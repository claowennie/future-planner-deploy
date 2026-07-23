import { serviceHeaders } from './feedback.js';

const FEEDBACK_LABELS = {
  feature_broken: '页面出错／没有反应',
  cannot_find: '找不到想用的功能',
  unclear_next_step: '不知道下一步怎么做',
  cumbersome: '操作步骤太麻烦',
  other: '其他',
};
const COMPLETION_LABELS = {
  completed: '完成了',
  completed_with_effort: '完成了，但有点费劲',
  not_completed: '没完成',
};

const INTENT_LABELS = { yes: '会', unsure: '不确定', no: '不会' };

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = String(row[key] || 'unknown');
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function linesFromCounts(counts, labels = {}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length
    ? entries.map(([key, count]) => `- ${labels[key] || key}：${count}`).join('\n')
    : '- 暂无';
}

function buildFeedbackDigest(feedbackRows, surveyRows, now = new Date()) {
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const date = (value) => new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
  }).format(value);
  const feedbackTypes = countBy(feedbackRows, 'feedback_type');
  const pages = countBy(feedbackRows, 'page_name');
  const completionStatuses = countBy(feedbackRows, 'completion_status');
  const intents = countBy(surveyRows, 'reopen_intent');
  return {
    subject: `Future 用户反馈周报｜${date(start)}—${date(now)}`,
    text: [
      `Future 用户反馈周报｜${date(start)}—${date(now)}`,
      '',
      `普通反馈：${feedbackRows.length} 条`,
      linesFromCounts(feedbackTypes, FEEDBACK_LABELS),
      '',
      '反馈页面：',
      linesFromCounts(pages),
      '',
      '最后是否完成：',
      linesFromCounts(completionStatuses, COMPLETION_LABELS),
      '',
      `第 7 天问卷：${surveyRows.length} 份`,
      '下周还会主动打开：',
      linesFromCounts(intents, INTENT_LABELS),
      '',
      '原始反馈仅保存在 Supabase。请登录 Supabase Dashboard 查看文本和进行每周归类。',
    ].join('\n'),
  };
}

async function readRows(env, table, since) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const query = new URLSearchParams({
    select: table === 'feedback' ? 'feedback_type,page_name,completion_status' : 'reopen_intent',
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: '5000',
  });
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers: serviceHeaders(env),
  });
  if (!response.ok) throw new Error(`feedback digest query failed: ${response.status}`);
  return response.json();
}

async function sendFeedbackDigest(env, now = new Date()) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const to = String(env.FEEDBACK_DIGEST_TO || '').trim();
  const from = String(env.FEEDBACK_DIGEST_FROM || '').trim();
  if (!apiKey || !to || !from || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [feedbackRows, surveyRows] = await Promise.all([
    readRows(env, 'feedback', since),
    readRows(env, 'day7_survey', since),
  ]);
  const digest = buildFeedbackDigest(feedbackRows, surveyRows, now);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject: digest.subject, text: digest.text }),
  });
  if (!response.ok) throw new Error(`feedback digest email failed: ${response.status}`);
  return { skipped: false, feedback: feedbackRows.length, surveys: surveyRows.length };
}

export { buildFeedbackDigest, sendFeedbackDigest };
