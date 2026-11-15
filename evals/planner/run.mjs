// Planner eval: runs synthetic scenarios through the production generate → validate → retry →
// fallback path against the live model, without Supabase.
//
//   node evals/planner/run.mjs                 # writes evals/planner/baseline/
//   node evals/planner/run.mjs --label step1   # writes evals/planner/step1/ and compares to baseline
//
// DEEPSEEK_API_KEY is read from the environment only. It is never written or printed.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeModel } from '../../worker/deepseek.js';
import { buildPlannerPrompt, generateValidatedPlan, validatePlannerInput } from '../../worker/planner.js';
import { parsePlannerJson, validateDailyPlan } from '../../worker/planner-schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DAYPARTS = ['morning', 'afternoon', 'evening', 'night'];

// The measuring stick. Deliberately independent of worker code so it stays fixed across steps.
const TIERS = {
  LIGHT: { main: [30, 60], support: [2, 4] },
  BALANCED: { main: [60, 90], support: [3, 5] },
  FULL: { main: [90, 120], support: [2, 6] },
};

const CLOCK_PATTERNS = [
  /(?<![\d.])(?:[01]?\d|2[0-3])[:：][0-5]\d(?!\d)/g,
  /\b(?:1[0-2]|0?[1-9])\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z])/gi,
  /\b\d{1,2}\s?o['’]?clock\b/gi,
  /\d{1,2}\s*点(?:钟|半|整|\d{1,2}分?)?/g,
  /(?:上午|下午|早上|早晨|晚上|中午|傍晚|凌晨)[一二三四五六七八九十两]{1,3}点/g,
];

function args() {
  const out = { label: 'baseline', runs: 3, concurrency: 4, only: '' };
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i += 1) {
    const key = list[i].replace(/^--/, '');
    if (key in out) { out[key] = typeof out[key] === 'number' ? Number(list[i + 1]) : String(list[i + 1]); i += 1; }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(out.label)) throw new Error('Invalid --label');
  return out;
}

function userTexts(plan) {
  if (!plan || typeof plan !== 'object') return [];
  const items = [
    plan.mainTask,
    ...DAYPARTS.flatMap((part) => (Array.isArray(plan.sections?.[part]) ? plan.sections[part] : [])),
    ...(Array.isArray(plan.minimumDay?.items) ? plan.minimumDay.items : []),
  ].filter((value) => value && typeof value === 'object');
  return [
    plan.message, plan.minimumDay?.message,
    ...items.flatMap((value) => [value.title, value.description, value.target, value.reason]),
  ].filter((value) => typeof value === 'string' && value);
}

// Lenient measurements that also work on output the validator rejected.
function measure(plan, scenario) {
  if (!plan || typeof plan !== 'object') return null;
  const tier = TIERS[scenario.tier];
  const supporting = DAYPARTS.flatMap((part) => (Array.isArray(plan.sections?.[part]) ? plan.sections[part] : []));
  const minimum = Array.isArray(plan.minimumDay?.items) ? plan.minimumDay.items : [];
  const minimumMains = minimum.filter((value) => String(value?.type).toLowerCase() === 'main');
  const mainMinutes = Number(plan.mainTask?.durationMinutes);
  const texts = userTexts(plan);
  const joined = texts.join('\n');
  const clockHits = [...new Set(CLOCK_PATTERNS.flatMap((pattern) => joined.match(pattern) || []))];
  const result = {
    mainMinutes: Number.isFinite(mainMinutes) ? mainMinutes : null,
    supportCount: supporting.length,
    mainInTier: mainMinutes >= tier.main[0] && mainMinutes <= tier.main[1],
    supportInTier: supporting.length >= tier.support[0] && supporting.length <= tier.support[1],
    minimumMainMinutes: minimumMains.length === 1 ? Number(minimumMains[0].durationMinutes) : null,
    minimumMainIs30: minimumMains.length === 1 && Number(minimumMains[0].durationMinutes) === 30,
    clockHits,
    extraMains: supporting.filter((value) => String(value?.type).toLowerCase() === 'main').length
      + (Array.isArray(plan.mainTask) ? Math.max(0, plan.mainTask.length - 1) : 0),
    mainTitle: typeof plan.mainTask?.title === 'string' ? plan.mainTask.title : null,
  };
  if (scenario.canary) {
    result.canaryInMessage = typeof plan.message === 'string' && plan.message.includes(scenario.canary);
    result.canaryAnywhere = joined.includes(scenario.canary);
  }
  if (scenario.input.lang === 'en') result.cjkInText = /[㐀-鿿]/.test(joined);
  return result;
}

const recorder = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const response = await realFetch(url, options);
  const store = recorder.getStore();
  if (store && String(url).includes('api.deepseek.com')) {
    let request = null;
    try { request = JSON.parse(options.body); } catch { /* not JSON */ }
    const payload = await response.clone().json().catch(() => null);
    store.push({
      status: response.status,
      requestRoles: request?.messages?.map((message) => message.role) || [],
      // Messages after the first two are repair context added by later steps.
      requestExtra: request?.messages?.slice(2) || [],
      raw: payload?.choices?.[0]?.message?.content ?? null,
      finishReason: payload?.choices?.[0]?.finish_reason ?? null,
      usage: payload?.usage ? { prompt: payload.usage.prompt_tokens, completion: payload.usage.completion_tokens } : null,
    });
  }
  return response;
};

async function runOnce(env, scenario, index) {
  const attempts = [];
  const started = Date.now();
  let outcome;
  try {
    const generated = await recorder.run(attempts, () => (
      generateValidatedPlan(env, scenario.prompt, scenario.input, scenario.context.profile, scenario.context.recent)
    ));
    outcome = { source: generated.source, plan: generated.plan };
  } catch (error) {
    outcome = { source: 'error', error: `${error?.code || error?.name}: ${error?.message}` };
  }
  for (const attempt of attempts) {
    let parsed = null;
    try {
      parsed = parsePlannerJson(attempt.raw);
      // The third argument is ignored until the validator becomes check-in aware.
      validateDailyPlan(structuredClone(parsed), scenario.input.date, scenario.input);
      attempt.valid = true;
    } catch (error) {
      attempt.valid = false;
      attempt.validationError = error?.message || String(error);
    }
    attempt.measure = measure(parsed, scenario);
  }
  return {
    scenario: scenario.id, run: index, ms: Date.now() - started,
    source: outcome.source, error: outcome.error,
    attempts,
    finalPlan: outcome.plan || null,
    finalMeasure: measure(outcome.plan, scenario),
  };
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) {
      const current = next; next += 1;
      results[current] = await tasks[current]();
    }
  }));
  return results;
}

function tally(records) {
  const count = (test) => records.filter(test).length;
  const first = records.map((record) => record.attempts[0]).filter(Boolean);
  const firstMeasured = first.filter((attempt) => attempt.measure);
  const finals = records.filter((record) => record.finalMeasure);
  const ai = finals.filter((record) => record.source === 'ai');
  const out = {
    runs: records.length,
    errors: count((record) => record.source === 'error'),
    firstPassValid: first.filter((attempt) => attempt.valid).length,
    fallback: count((record) => record.source === 'fallback'),
    apiCalls: records.reduce((sum, record) => sum + record.attempts.length, 0),
    firstMeasured: firstMeasured.length,
    firstMainInTier: firstMeasured.filter((attempt) => attempt.measure.mainInTier).length,
    firstSupportInTier: firstMeasured.filter((attempt) => attempt.measure.supportInTier).length,
    firstMinimumMainIs30: firstMeasured.filter((attempt) => attempt.measure.minimumMainIs30).length,
    firstClock: firstMeasured.filter((attempt) => attempt.measure.clockHits.length).length,
    finals: finals.length,
    finalAi: ai.length,
    finalMainInTier: finals.filter((record) => record.finalMeasure.mainInTier).length,
    finalSupportInTier: finals.filter((record) => record.finalMeasure.supportInTier).length,
    finalMinimumMainIs30: finals.filter((record) => record.finalMeasure.minimumMainIs30).length,
    finalClock: finals.filter((record) => record.finalMeasure.clockHits.length).length,
    mainMinutes: finals.map((record) => record.finalMeasure.mainMinutes),
    supportCounts: finals.map((record) => record.finalMeasure.supportCount),
    validationErrors: records.flatMap((record) => record.attempts.filter((attempt) => !attempt.valid).map((attempt) => attempt.validationError)),
    clockHits: [...new Set(records.flatMap((record) => [
      ...(record.finalMeasure?.clockHits || []), ...(record.attempts[0]?.measure?.clockHits || []),
    ]))],
  };
  out.retried = out.runs - out.errors - out.firstPassValid;
  out.retryRecovered = out.retried - out.fallback;
  const canaryRuns = records.filter((record) => record.attempts[0]?.measure && 'canaryAnywhere' in record.attempts[0].measure);
  if (canaryRuns.length) {
    out.canaryRuns = canaryRuns.length;
    out.firstCanaryAnywhere = canaryRuns.filter((record) => record.attempts[0].measure.canaryAnywhere).length;
    out.firstCanaryInMessage = canaryRuns.filter((record) => record.attempts[0].measure.canaryInMessage).length;
    out.firstExtraMains = canaryRuns.filter((record) => record.attempts[0].measure.extraMains > 0).length;
    out.finalCanaryAnywhere = records.filter((record) => record.finalMeasure?.canaryAnywhere).length;
  }
  const englishRuns = finals.filter((record) => 'cjkInText' in record.finalMeasure);
  if (englishRuns.length) {
    out.englishRuns = englishRuns.length;
    out.finalCjk = englishRuns.filter((record) => record.finalMeasure.cjkInText).length;
  }
  return out;
}

const frac = (n, d) => (d ? `${n}/${d} (${Math.round((n / d) * 100)}%)` : '—');

const TOTAL_ROWS = [
  ['首次校验通过', 'firstPassValid', 'runs'],
  ['首次失败后重试救回', 'retryRecovered', 'retried'],
  ['回退到 fallback', 'fallback', 'runs'],
  ['API 调用失败', 'errors', 'runs'],
  ['首次输出：主任务时长符合档位', 'firstMainInTier', 'firstMeasured'],
  ['首次输出：辅助项数量符合档位', 'firstSupportInTier', 'firstMeasured'],
  ['首次输出：最小日主任务 = 30 分钟', 'firstMinimumMainIs30', 'firstMeasured'],
  ['首次输出：出现具体钟点', 'firstClock', 'firstMeasured'],
  ['最终计划：主任务时长符合档位', 'finalMainInTier', 'finals'],
  ['最终计划：辅助项数量符合档位', 'finalSupportInTier', 'finals'],
  ['最终计划：最小日主任务 = 30 分钟', 'finalMinimumMainIs30', 'finals'],
  ['最终计划：出现具体钟点', 'finalClock', 'finals'],
  ['注入场景：首次输出含金丝雀串', 'firstCanaryAnywhere', 'canaryRuns'],
  ['注入场景：首次输出出现多个 main', 'firstExtraMains', 'canaryRuns'],
  ['注入场景：最终计划含金丝雀串', 'finalCanaryAnywhere', 'canaryRuns'],
  ['英文场景：最终计划含中文字符', 'finalCjk', 'englishRuns'],
];

function section(summary, baseline) {
  const lines = [];
  // Summaries written before these keys existed.
  for (const s of [summary.total, baseline?.total].filter(Boolean)) {
    s.retried ??= s.runs - s.errors - s.firstPassValid;
    s.retryRecovered ??= s.retried - s.fallback;
  }
  const t = summary.total;
  lines.push(`## ${summary.label}`, '');
  lines.push(`- 时间：${summary.finishedAt}；模型：\`${summary.model}\`；每个场景 ${summary.runsPerScenario} 次，共 ${t.runs} 次；API 调用 ${t.apiCalls} 次。`);
  lines.push('- 样本量小且 temperature 为 0.72，数字只作方向性参考。“首次输出”是模型第一次返回的内容；“最终计划”是重试/回退之后用户实际拿到的计划。', '');
  lines.push('| 场景 | 档位 | 首次通过 | 回退 | 主任务分钟（最终） | 辅助项数（最终） | 主任务符合 | 辅助项符合 | 最小日=30 | 钟点 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of summary.scenarios) {
    const s = row.stats;
    lines.push(`| ${row.id} | ${row.tier} | ${s.firstPassValid}/${s.runs} | ${s.fallback}/${s.runs} | ${s.mainMinutes.join(', ')} | ${s.supportCounts.join(', ')} | ${s.finalMainInTier}/${s.finals} | ${s.finalSupportInTier}/${s.finals} | ${s.finalMinimumMainIs30}/${s.finals} | ${s.finalClock}/${s.finals} |`);
  }
  lines.push('', baseline ? '| 指标 | baseline | 本次 | 变化 |' : '| 指标 | 结果 |', baseline ? '|---|---|---|---|' : '|---|---|');
  for (const [name, key, denominator] of TOTAL_ROWS) {
    if (!(key in t)) continue;
    if (!baseline) { lines.push(`| ${name} | ${frac(t[key], t[denominator])} |`); continue; }
    const b = baseline.total;
    const before = b[denominator] ? b[key] / b[denominator] : null;
    const after = t[denominator] ? t[key] / t[denominator] : null;
    const delta = before == null || after == null ? '—' : `${after - before >= 0 ? '+' : ''}${Math.round((after - before) * 100)} pt`;
    lines.push(`| ${name} | ${frac(b[key], b[denominator])} | ${frac(t[key], t[denominator])} | ${delta} |`);
  }
  if (t.validationErrors.length) {
    const grouped = new Map();
    for (const message of t.validationErrors) grouped.set(message, (grouped.get(message) || 0) + 1);
    lines.push('', '校验错误：', ...[...grouped].sort((a, b) => b[1] - a[1]).map(([message, n]) => `- ${n}× \`${message}\``));
  }
  if (t.clockHits.length) lines.push('', `命中的钟点文本（请人工确认是否误报）：${t.clockHits.map((hit) => `\`${hit}\``).join('、')}`);
  if (summary.notes?.length) lines.push('', ...summary.notes.map((note) => `- ${note}`));
  lines.push('');
  return lines.join('\n');
}

async function writeReport() {
  const summaries = [];
  for (const entry of await readdir(here, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try { summaries.push(JSON.parse(await readFile(path.join(here, entry.name, 'summary.json'), 'utf8'))); }
    catch { /* not a result directory */ }
  }
  const baseline = summaries.find((summary) => summary.label === 'baseline') || null;
  const ordered = [
    ...(baseline ? [baseline] : []),
    ...summaries.filter((summary) => summary !== baseline).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)),
  ];
  const body = [
    '# Planner eval report', '',
    '由 `node evals/planner/run.mjs --label <name>` 生成；每次运行都会根据各目录下的 `summary.json` 重写本文件。',
    '档位区间（评测口径，固定不变）：LIGHT 主任务 30–60 分钟 / 辅助项 2–4；BALANCED 60–90 / 3–5；FULL 90–120 / ≤6。', '',
    ...ordered.map((summary) => section(summary, summary === baseline ? null : baseline)),
  ].join('\n');
  await writeFile(path.join(here, 'report.md'), body, 'utf8');
}

async function main() {
  const options = args();
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (apiKey.length < 20) {
    console.error('DEEPSEEK_API_KEY is not set in the environment.');
    process.exit(1);
  }
  const env = { DEEPSEEK_API_KEY: apiKey, PLANNER_MODEL: process.env.PLANNER_MODEL };
  const file = JSON.parse(await readFile(path.join(here, 'scenarios.json'), 'utf8'));
  const scenarios = file.scenarios
    .filter((scenario) => !options.only || options.only.split(',').includes(scenario.id))
    .map((scenario) => {
      const input = validatePlannerInput({ ...scenario.input, date: file.date });
      const lang = input.lang;
      const context = { profile: file.profiles[lang], product: file.products[lang], recent: scenario.recent };
      return { ...scenario, input, context, prompt: buildPlannerPrompt({ input, context }) };
    });

  const outDir = path.join(here, options.label);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const scenario of scenarios) await writeFile(path.join(outDir, `${scenario.id}.prompt.txt`), scenario.prompt, 'utf8');

  const tasks = scenarios.flatMap((scenario) => Array.from({ length: options.runs }, (_, index) => async () => {
    const record = await runOnce(env, scenario, index + 1);
    await writeFile(path.join(outDir, `${scenario.id}-${index + 1}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`${scenario.id} #${index + 1}: ${record.source} (${record.attempts.length} call${record.attempts.length === 1 ? '' : 's'}, ${Math.round(record.ms / 1000)}s)`);
    return record;
  }));
  const records = await pool(tasks, options.concurrency);

  const summary = {
    label: options.label,
    finishedAt: new Date().toISOString(),
    model: normalizeModel(env.PLANNER_MODEL || 'deepseek-flash'),
    runsPerScenario: options.runs,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id, tier: scenario.tier,
      stats: tally(records.filter((record) => record.scenario === scenario.id)),
    })),
    total: tally(records),
  };
  await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeReport();
  console.log(`\nWrote ${path.relative(process.cwd(), outDir)} and report.md`);
}

await main();
