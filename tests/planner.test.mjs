import assert from 'node:assert/strict';
import { buildPlannerPrompt, fallbackPlan, generatePlannerDay, validatePlannerInput } from '../worker/planner.js';
import { loadTier, planItems, validateDailyPlan } from '../worker/planner-schema.js';
import {
  orderedPlanSections, planProgress, setPlanMode, setPlanReview, togglePlanItem,
} from '../src/planner-plan.js';

const date = '2026-08-22';
const input = {
  date, energy: 'normal', availableTime: 'mostly_free', dayStyle: 'balanced',
  mustDo: "Continue building Future's AI Daily Planner.", lang: 'en', reason: '',
};
const profile = {
  priorities: ['Build personal AI product', 'Prepare for job search', 'Graduate application'],
  interests: ['AI', 'Product', 'Ocean science', 'History'], planningStyle: 'flexible',
  dailyRhythm: 'neutral', preferredActivities: ['Build / coding', 'Learning', 'Walking', 'Reading'],
};

const valid = validateDailyPlan({
  date,
  dayType: 'balanced',
  message: 'Make meaningful progress and leave room for life.',
  mainTask: { id: 'main-1', title: 'Build the first working AI Planner flow', durationMinutes: 90 },
  sections: {
    morning: [{ id: 'explore-1', type: 'explore', title: 'How personal AI memory works', durationMinutes: 35 }],
    afternoon: [{ id: 'learn-1', type: 'learn', title: 'Structured outputs', durationMinutes: 50 }],
    evening: [{ id: 'move-1', type: 'move', title: 'Walk outside', durationMinutes: 35 }],
    night: [{ id: 'read-1', type: 'read', title: 'Read 20 pages', durationMinutes: 25 }, { id: 'enjoy-1', type: 'enjoy', title: 'Guilt-free free time' }],
  },
  minimumDay: {
    message: 'A lighter day still counts.',
    items: [
      { id: 'min-main', type: 'main', title: 'Build one complete planner slice', durationMinutes: 30 },
      { id: 'min-learn', type: 'learn', title: 'Read about JSON validation', durationMinutes: 20 },
      { id: 'min-move', type: 'move', title: 'Stretch and walk', durationMinutes: 20 },
    ],
  },
}, date);

assert.equal(valid.mainTask.type, 'main');
assert.equal(planItems(valid).length, 6);
assert.equal(valid.sections.afternoon[0].type, 'learn');

// Supabase JSONB round trips can reorder object keys.
const reordered = { ...valid, sections: Object.fromEntries(Object.entries(valid.sections).reverse()) };
assert.deepEqual(orderedPlanSections(reordered).map(([part]) => part), ['morning', 'afternoon', 'evening', 'night']);
assert.deepEqual(orderedPlanSections(reordered).flatMap(([, items]) => items.map((item) => item.id)), ['explore-1', 'learn-1', 'move-1', 'read-1', 'enjoy-1']);

const completedPlan = togglePlanItem(valid, 'main-1');
assert.equal(completedPlan.mainTask.completed, true);
assert.equal(valid.mainTask.completed, false);
assert.equal(setPlanMode(completedPlan, 'minimum').activeMode, 'minimum');
assert.deepEqual(planProgress(completedPlan), { completed: 1, total: 6 });
assert.deepEqual(planProgress(setPlanMode(completedPlan, 'minimum')), { completed: 0, total: 3 });

// End-of-day review snapshots progress and ignores unknown feelings.
const reviewedPlan = setPlanReview(completedPlan, { feeling: 'too_much', note: `  ${'n'.repeat(300)} ` }, new Date('2026-08-22T21:00:00Z'));
assert.equal(reviewedPlan.review.feeling, 'too_much');
assert.equal(reviewedPlan.review.note.length, 240);
assert.equal(reviewedPlan.review.completed, 1);
assert.equal(reviewedPlan.review.total, 6);
assert.equal(reviewedPlan.review.reviewedAt, '2026-08-22T21:00:00.000Z');
assert.equal(completedPlan.review, undefined);
assert.equal(setPlanReview(completedPlan, { feeling: 'great' }), completedPlan);

assert.throws(() => validateDailyPlan({
  ...valid,
  sections: { ...valid.sections, morning: [{ id: 'bad', type: 'main', title: 'Second main', durationMinutes: 60 }] },
}, date), /type is not supported/);

assert.throws(() => validatePlannerInput({ ...input, energy: 'infinite' }), /Invalid daily check-in/);
assert.equal(validatePlannerInput(input).dayStyle, 'balanced');
for (const invalidDate of ['2026-02-30', '2026-13-01', '2026-00-10', 'not-a-date']) {
  assert.throws(() => validatePlannerInput({ ...input, date: invalidDate }), /Invalid planner date/);
}
assert.equal(validatePlannerInput({ ...input, date: '2028-02-29' }).date, '2028-02-29');

const prompt = buildPlannerPrompt({
  input,
  context: { profile, product: { goals: [], tasks: [] }, recent: [] },
});
assert.match(prompt, /Exactly one real Main Task/);
assert.match(prompt, /Never give exact clock times/);
assert.match(prompt, /RECENT 7-DAY PLANNING HISTORY/);
assert.match(prompt, /Minimum Day/);

const low = fallbackPlan({ ...input, energy: 'low', availableTime: 'busy' }, profile);
assert.equal(low.dayType, 'relaxed');
assert.ok(low.mainTask.durationMinutes <= 60);
assert.equal(low.minimumDay.items.filter((item) => item.type === 'main').length, 1);
assert.ok(planItems(low).length <= 5);

// Load tiers: one source for the prompt, the validator, and the fallback.
const lightDay = { energy: 'low', availableTime: 'half_day' };
const busyDay = { energy: 'high', availableTime: 'busy' };
const balancedDay = { energy: 'normal', availableTime: 'mostly_free' };
const fullDay = { energy: 'high', availableTime: 'mostly_free' };
assert.equal(loadTier(lightDay).name, 'LIGHT');
assert.equal(loadTier(busyDay).name, 'LIGHT');
assert.equal(loadTier(balancedDay).name, 'BALANCED');
assert.equal(loadTier(fullDay).name, 'FULL');
assert.equal(loadTier({ ...balancedDay, reason: 'too_much' }).name, 'LIGHT');
assert.equal(loadTier({ ...balancedDay, reason: 'less_time' }).name, 'LIGHT');
assert.equal(loadTier({ ...balancedDay, reason: 'too_easy' }).name, 'FULL');
assert.equal(loadTier({ ...balancedDay, reason: 'more_time' }).name, 'FULL');
assert.equal(loadTier({ ...balancedDay, reason: 'change_focus' }).name, 'BALANCED');
assert.equal(loadTier({ ...lightDay, reason: 'too_much' }).name, 'LIGHT');
assert.equal(loadTier({ ...fullDay, reason: 'more_time' }).name, 'FULL');

const supportPool = ['explore', 'learn', 'move', 'read', 'enjoy', 'explore', 'learn'];
const tierPayload = (mainMinutes, supportCount, minimumMainMinutes = 30) => ({
  date,
  dayType: 'balanced',
  message: 'A day sized to the check-in.',
  mainTask: { id: 'tier-main', title: 'One meaningful thing', durationMinutes: mainMinutes },
  sections: {
    morning: supportPool.slice(0, supportCount).map((type, index) => ({ id: `tier-${index}`, type, title: `Item ${index}`, durationMinutes: 20 })),
    afternoon: [], evening: [], night: [],
  },
  minimumDay: {
    items: [
      { id: 'tier-min-main', type: 'main', title: 'A small slice', durationMinutes: minimumMainMinutes },
      { id: 'tier-min-learn', type: 'learn', title: 'Read one example', durationMinutes: 20 },
      { id: 'tier-min-move', type: 'move', title: 'Walk', durationMinutes: 20 },
    ],
  },
});
assert.equal(validateDailyPlan(tierPayload(30, 2), date, lightDay).mainTask.durationMinutes, 30);
assert.equal(validateDailyPlan(tierPayload(60, 4), date, busyDay).mainTask.durationMinutes, 60);
assert.equal(validateDailyPlan(tierPayload(75, 5), date, balancedDay).mainTask.durationMinutes, 75);
assert.equal(validateDailyPlan(tierPayload(120, 6), date, fullDay).mainTask.durationMinutes, 120);
assert.throws(() => validateDailyPlan(tierPayload(90, 3), date, busyDay), /mainTask\.durationMinutes must be 30-60 on a LIGHT day \(got 90\)/);
assert.throws(() => validateDailyPlan(tierPayload(45, 3), date, balancedDay), /must be 60-90 on a BALANCED day \(got 45\)/);
assert.throws(() => validateDailyPlan(tierPayload(45, 5), date, lightDay), /2-4 supporting items in total on a LIGHT day \(got 5\)/);
assert.throws(() => validateDailyPlan(tierPayload(75, 2), date, balancedDay), /3-5 supporting items in total on a BALANCED day \(got 2\)/);
assert.throws(() => validateDailyPlan(tierPayload(100, 7), date, fullDay), /3-6 supporting items in total on a FULL day \(got 7\)/);
assert.throws(() => validateDailyPlan(tierPayload(75, 4, 45), date, balancedDay), /minimumDay main item must be exactly 30 minutes \(got 45\)/);
assert.throws(
  () => validateDailyPlan(tierPayload(90, 5, 45), date, busyDay),
  /got 90\); sections must contain 2-4 supporting items in total on a LIGHT day \(got 5\); minimumDay main item must be exactly 30 minutes \(got 45\)/,
);
// A replan that asks for less is judged against the lighter tier.
assert.equal(validateDailyPlan(tierPayload(45, 3), date, { ...balancedDay, reason: 'too_much' }).mainTask.durationMinutes, 45);
assert.throws(() => validateDailyPlan(tierPayload(75, 4), date, { ...balancedDay, reason: 'too_much' }), /on a LIGHT day/);
assert.equal(validateDailyPlan(tierPayload(100, 6), date, { ...balancedDay, reason: 'more_time' }).mainTask.durationMinutes, 100);
// Without a check-in only the structural rules apply, as before.
assert.equal(validateDailyPlan(tierPayload(200, 7, 45), date).mainTask.durationMinutes, 200);

assert.match(buildPlannerPrompt({ input: { ...input, ...busyDay }, context: { profile, product: {}, recent: [] } }), /LIGHT: main 30-60 min and 2-4 supporting items/);
assert.match(buildPlannerPrompt({ input: { ...input, ...fullDay }, context: { profile, product: {}, recent: [] } }), /FULL BUT HUMANE: main 90-120 min and 3-6 supporting items/);
assert.match(buildPlannerPrompt({ input: { ...input, reason: 'too_much' }, context: { profile, product: {}, recent: [] }, previousPlan: valid }), /LIGHT: main 30-60 min/);

for (const lang of ['zh', 'en']) {
  for (const checkin of [lightDay, busyDay, balancedDay, fullDay, { ...balancedDay, reason: 'too_much' }, { ...balancedDay, reason: 'too_easy' }]) {
    const tier = loadTier(checkin);
    const plan = fallbackPlan({ ...input, ...checkin, lang }, profile);
    assert.ok(plan.mainTask.durationMinutes >= tier.mainMin && plan.mainTask.durationMinutes <= tier.mainMax);
    assert.ok(planItems(plan).length - 1 >= tier.supportMin && planItems(plan).length - 1 <= tier.supportMax);
    assert.equal(plan.minimumDay.items.find((value) => value.type === 'main').durationMinutes, 30);
  }
}

// The fallback reads the most recent planned day instead of using one fixed template.
const noMustDo = { ...input, mustDo: '' };
const supportTotal = (plan) => planItems(plan).length - 1;
const day = (overrides) => ({
  date: '2026-08-21', dayType: 'balanced', completed: '4/5', review: null,
  main: { title: 'Draft the portfolio case study', completed: true }, explore: [], learn: [], moveCompleted: true,
  ...overrides,
});
const steadyFallback = fallbackPlan(noMustDo, profile, []);
assert.equal(steadyFallback.mainTask.durationMinutes, 75);
assert.equal(supportTotal(steadyFallback), 5);
assert.equal(steadyFallback.mainTask.title, profile.priorities[0]);
assert.deepEqual(fallbackPlan(noMustDo, profile).message, steadyFallback.message);

const afterTooMuch = fallbackPlan(noMustDo, profile, [day({ review: { feeling: 'too_much', note: '' } })]);
assert.equal(afterTooMuch.mainTask.durationMinutes, 60);
assert.equal(supportTotal(afterTooMuch), 3);
assert.equal(afterTooMuch.dayType, 'relaxed');
assert.match(afterTooMuch.message, /too much/);
assert.notEqual(afterTooMuch.message, steadyFallback.message);

const afterLowCompletion = fallbackPlan(noMustDo, profile, [day({ completed: '1/6' })]);
assert.equal(afterLowCompletion.mainTask.durationMinutes, 60);
assert.equal(supportTotal(afterLowCompletion), 3);

const afterTooLight = fallbackPlan(noMustDo, profile, [day({ review: { feeling: 'too_light', note: '' } })]);
assert.equal(afterTooLight.mainTask.durationMinutes, 90);
assert.equal(supportTotal(afterTooLight), 5);
assert.equal(supportTotal(fallbackPlan({ ...noMustDo, ...fullDay }, profile, [day({ review: { feeling: 'too_light', note: '' } })])), 6);

// Only the most recent day decides the pace.
const olderTooMuch = fallbackPlan(noMustDo, profile, [day({ date: '2026-08-20', review: { feeling: 'too_much', note: '' } }), day({})]);
assert.equal(olderTooMuch.mainTask.durationMinutes, 75);

const carried = fallbackPlan(noMustDo, profile, [day({ main: { title: 'Draft the portfolio case study', completed: false } })]);
assert.equal(carried.mainTask.title, 'Continue: Draft the portfolio case study (one small step first)');
assert.equal(carried.minimumDay.items[0].title, carried.mainTask.title);
assert.match(carried.message, /still open/);
assert.match(carried.mainTask.reason, /left open last time/);
const carriedZh = fallbackPlan({ ...noMustDo, lang: 'zh' }, profile, [day({ main: { title: '写完作品集初稿', completed: false }, review: { feeling: 'too_much', note: '' } })]);
assert.equal(carriedZh.mainTask.title, '继续：写完作品集初稿（先做一小步）');
assert.match(carriedZh.message, /还没做完.*偏满/);
// An explicit must-do still wins over an unfinished main task.
const mustDoWins = fallbackPlan(input, profile, [day({ main: { title: 'Draft the portfolio case study', completed: false } })]);
assert.equal(mustDoWins.mainTask.title, input.mustDo);
assert.doesNotMatch(mustDoWins.message, /still open/);

// Explore avoids interests the recent days already covered.
assert.match(JSON.stringify(steadyFallback.sections), /Explore: AI/);
const freshTopic = fallbackPlan(noMustDo, profile, [day({ explore: ['How AI memory works'], learn: ['Product metrics'] })]);
assert.match(JSON.stringify(freshTopic.sections), /Explore: Ocean science/);

// Every pace stays inside the day's load tier, in both languages.
for (const lang of ['zh', 'en']) {
  for (const checkin of [lightDay, balancedDay, fullDay]) {
    for (const feeling of ['too_much', 'just_right', 'too_light']) {
      const tier = loadTier(checkin);
      const plan = fallbackPlan({ ...noMustDo, ...checkin, lang }, profile, [day({ review: { feeling, note: '' }, main: { title: 'Open task', completed: false } })]);
      assert.ok(plan.mainTask.durationMinutes >= tier.mainMin && plan.mainTask.durationMinutes <= tier.mainMax);
      assert.ok(supportTotal(plan) >= tier.supportMin && supportTotal(plan) <= tier.supportMax);
    }
  }
}

const originalFetch = globalThis.fetch;
const aiPayload = {
  date,
  dayType: 'balanced',
  message: 'A realistic day with one meaningful focus.',
  mainTask: { id: 'ai-main', title: 'Ship the planner flow', durationMinutes: 90 },
  sections: {
    morning: [{ id: 'ai-learn', type: 'learn', title: 'Review structured output handling', durationMinutes: 40 }],
    afternoon: [{ id: 'ai-explore', type: 'explore', title: 'Explore calm interface patterns', durationMinutes: 30 }],
    evening: [{ id: 'ai-move', type: 'move', title: 'Take a walk', durationMinutes: 30 }],
    night: [],
  },
  minimumDay: {
    message: 'Small steps are enough.',
    items: [
      { id: 'ai-min-main', type: 'main', title: 'Finish one planner slice', durationMinutes: 30 },
      { id: 'ai-min-learn', type: 'learn', title: 'Read one validation example', durationMinutes: 20 },
      { id: 'ai-min-move', type: 'move', title: 'Walk and stretch', durationMinutes: 20 },
    ],
  },
};
let inserted = null;
let capturedPrompt = '';
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/rest/v1/planner_profiles')) return Response.json([{
    priorities: profile.priorities, interests: profile.interests,
    planning_style: 'flexible', daily_rhythm: 'neutral', preferred_activities: profile.preferredActivities,
  }]);
  if (target.includes('/rest/v1/planner_data')) return Response.json([{ data: {
    okrs: [{ id: 'goal-1', name: 'Build a personal AI product', aim: 'Ship a useful first version', krs: [] }],
    todos: { [date]: [{ id: 'task-1', text: input.mustDo, done: false, okrId: 'goal-1' }] },
    reflection: { '2026-08-21': 'Felt scattered after lunch.', [date]: 'Future reflection', '2026-08-20': '   ' },
  } }]);
  if (target.includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET') return Response.json([
    { id: 'yesterday', date: '2026-08-21', day_type: 'balanced', version: 1, plan_json: { ...reviewedPlan, date: '2026-08-21', review: { ...reviewedPlan.review, note: 'Too many errands' } } },
  ]);
  if (target.includes('/rest/v1/daily_plans') && options.method === 'POST') {
    inserted = JSON.parse(options.body);
    return Response.json([{ id: 'plan-row', ...inserted }]);
  }
  if (target.includes('api.deepseek.com')) {
    capturedPrompt = JSON.parse(options.body).messages[1].content;
    return Response.json({ choices: [{ message: { content: JSON.stringify(aiPayload) } }] });
  }
  throw new Error(`Unexpected URL ${target}`);
};
const generated = await generatePlannerDay({
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
  DEEPSEEK_API_KEY: 'x'.repeat(32), PLANNER_MODEL: 'deepseek-flash',
}, 'user-token', 'user-1', input);
assert.equal(generated.source, 'ai');
assert.match(capturedPrompt, /"completed":"1\/6"/);
assert.match(capturedPrompt, /"review":\{"feeling":"too_much","note":"Too many errands"\}/);
assert.match(capturedPrompt, /"reflections":\[\{"date":"2026-08-21","text":"Felt scattered after lunch."\}\]/);
assert.doesNotMatch(capturedPrompt, /Future reflection/);
assert.equal(generated.row.plan_json.mainTask.title, 'Ship the planner flow');
assert.equal(inserted.user_id, 'user-1');
assert.equal(inserted.version, 1);

const existingRow = { id: 'plan-v1', user_id: 'user-1', date, day_type: 'balanced', plan_json: valid, version: 1, checkin: input };
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/rest/v1/planner_profiles')) return Response.json([{
    priorities: profile.priorities, interests: profile.interests,
    planning_style: 'flexible', daily_rhythm: 'neutral', preferred_activities: profile.preferredActivities,
  }]);
  if (target.includes('/rest/v1/planner_data')) return Response.json([{ data: {} }]);
  if (target.includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET') return Response.json([existingRow]);
  if (target.includes('/rest/v1/daily_plans') && options.method === 'POST') {
    const body = JSON.parse(options.body);
    return Response.json([{ id: 'plan-v2', ...body }]);
  }
  if (target.includes('api.deepseek.com')) return Response.json({ choices: [{ message: { content: JSON.stringify({ ...aiPayload, mainTask: { ...aiPayload.mainTask, title: 'Ship a smaller complete slice', durationMinutes: 45 } }) } }] });
  throw new Error(`Unexpected URL ${target}`);
};
const replanned = await generatePlannerDay({
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
  DEEPSEEK_API_KEY: 'x'.repeat(32),
}, 'user-token', 'user-1', { ...input, reason: 'too_much' }, { replan: true });
assert.equal(replanned.row.version, 2);
assert.equal(replanned.row.replan_reason, 'too_much');
assert.equal(replanned.row.plan_json.mainTask.title, 'Ship a smaller complete slice');

let invalidCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/rest/v1/planner_profiles')) return Response.json([{
    priorities: profile.priorities, interests: profile.interests,
    planning_style: 'flexible', daily_rhythm: 'neutral', preferred_activities: profile.preferredActivities,
  }]);
  if (target.includes('/rest/v1/planner_data')) return Response.json([{ data: {} }]);
  if (target.includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (target.includes('/rest/v1/daily_plans') && options.method === 'POST') {
    const body = JSON.parse(options.body);
    return Response.json([{ id: 'fallback-row', ...body }]);
  }
  if (target.includes('api.deepseek.com')) { invalidCalls += 1; return Response.json({ choices: [{ message: { content: '{invalid' } }] }); }
  throw new Error(`Unexpected URL ${target}`);
};
const fallbackGenerated = await generatePlannerDay({
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
  DEEPSEEK_API_KEY: 'x'.repeat(32),
}, 'user-token', 'user-1', input);
assert.equal(invalidCalls, 2);
assert.equal(fallbackGenerated.source, 'fallback');
assert.equal(fallbackGenerated.row.plan_json.mainTask.title, input.mustDo);

// A rejected first reply is sent back with the validation error instead of being retried blind.
const repairRequests = [];
const duplicatedMain = {
  ...aiPayload,
  sections: { ...aiPayload.sections, afternoon: [{ id: 'dup-main', type: 'main', title: 'Ship the planner flow', durationMinutes: 90 }, ...aiPayload.sections.afternoon] },
};
const repairFetch = (replies) => async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/rest/v1/planner_profiles')) return Response.json([{
    priorities: profile.priorities, interests: profile.interests,
    planning_style: 'flexible', daily_rhythm: 'neutral', preferred_activities: profile.preferredActivities,
  }]);
  if (target.includes('/rest/v1/planner_data')) return Response.json([{ data: {} }]);
  if (target.includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (target.includes('/rest/v1/daily_plans') && options.method === 'POST') return Response.json([{ id: 'repair-row', ...JSON.parse(options.body) }]);
  if (target.includes('api.deepseek.com')) {
    repairRequests.push(JSON.parse(options.body).messages);
    return Response.json({ choices: [{ message: { content: replies[repairRequests.length - 1] } }] });
  }
  throw new Error(`Unexpected URL ${target}`);
};
const plannerEnv = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
  DEEPSEEK_API_KEY: 'x'.repeat(32),
};
globalThis.fetch = repairFetch([JSON.stringify(duplicatedMain), JSON.stringify(aiPayload)]);
const repaired = await generatePlannerDay(plannerEnv, 'user-token', 'user-1', input);
assert.equal(repaired.source, 'ai');
assert.equal(repairRequests.length, 2);
assert.deepEqual(repairRequests[0].map((message) => message.role), ['system', 'user']);
assert.deepEqual(repairRequests[1].map((message) => message.role), ['system', 'user', 'assistant', 'user']);
assert.equal(repairRequests[1][1].content, repairRequests[0][1].content);
assert.equal(repairRequests[1][2].content, JSON.stringify(duplicatedMain));
assert.match(repairRequests[1][3].content, /sections\.afternoon\[0\]\.type is not supported/);
assert.match(repairRequests[1][3].content, /belongs only in mainTask/);

// An empty first reply has nothing to quote, so the error is appended to the original prompt.
repairRequests.length = 0;
globalThis.fetch = repairFetch(['', JSON.stringify(aiPayload)]);
const repairedEmpty = await generatePlannerDay(plannerEnv, 'user-token', 'user-1', input);
assert.equal(repairedEmpty.source, 'ai');
assert.deepEqual(repairRequests[1].map((message) => message.role), ['system', 'user']);
assert.match(repairRequests[1][1].content, /rejected by validation: Model returned empty content/);

// A reply outside the load tier is rejected and the retry is told the expected range.
repairRequests.length = 0;
globalThis.fetch = repairFetch([
  JSON.stringify({ ...aiPayload, mainTask: { ...aiPayload.mainTask, durationMinutes: 90 } }),
  JSON.stringify({ ...aiPayload, mainTask: { ...aiPayload.mainTask, durationMinutes: 45 } }),
]);
const tierRepaired = await generatePlannerDay(plannerEnv, 'user-token', 'user-1', { ...input, availableTime: 'busy' });
assert.equal(tierRepaired.source, 'ai');
assert.equal(tierRepaired.row.plan_json.mainTask.durationMinutes, 45);
assert.match(repairRequests[1][3].content, /must be 30-60 on a LIGHT day \(got 90\)/);

// When both replies are rejected, the persisted fallback reflects yesterday's review and open main task.
repairRequests.length = 0;
const yesterdayPlan = {
  ...valid, date: '2026-08-21', mainTask: { ...valid.mainTask, title: 'Draft the portfolio case study', completed: false },
  review: { feeling: 'too_much', note: '', completed: 1, total: 6 },
};
const historyFetch = repairFetch(['{invalid', '{invalid']);
globalThis.fetch = async (url, options = {}) => (
  String(url).includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET'
    ? Response.json([{ id: 'yesterday', date: '2026-08-21', day_type: 'balanced', version: 1, plan_json: yesterdayPlan }])
    : historyFetch(url, options)
);
const historyFallback = await generatePlannerDay(plannerEnv, 'user-token', 'user-1', noMustDo);
assert.equal(historyFallback.source, 'fallback');
assert.equal(historyFallback.row.plan_json.mainTask.title, 'Continue: Draft the portfolio case study (one small step first)');
assert.equal(historyFallback.row.plan_json.mainTask.durationMinutes, 60);

globalThis.fetch = originalFetch;

console.log('planner tests passed');
