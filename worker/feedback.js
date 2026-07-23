const FEEDBACK_TYPES = new Set([
  'feature_broken',
  'cannot_find',
  'unclear_next_step',
  'cumbersome',
  'other',
]);
const COMPLETION_STATUSES = new Set([
  'completed',
  'completed_with_effort',
  'not_completed',
]);
const DEVICE_TYPES = new Set(['mobile', 'tablet', 'desktop', 'unknown']);

const PAGE_NAMES = new Set([
  'today',
  'week',
  'month',
  'year',
  'journal',
  'notes',
  'radio',
  'settings',
  'unknown',
]);

const USAGE_DAYS = new Set(['0', '1', '2', '3-4', '5-7']);
const USED_FEATURES = new Set([
  'today_todos',
  'pomodoro',
  'habits',
  'journal_reflection',
  'planning',
  'notes',
  'none',
]);
const REOPEN_INTENTS = new Set(['yes', 'unsure', 'no']);
const YES_REASONS = new Set([
  'plan_daily',
  'see_growth',
  'reduce_switching',
  'atmosphere',
  'other',
]);
const NO_REASONS = new Set([
  'forget',
  'previous_tool',
  'operation_problem',
  'unclear_value',
  'no_need',
  'privacy',
  'other',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class FeedbackError extends Error {
  constructor(message, status = 422, code = 'feedback_invalid') {
    super(message);
    this.name = 'FeedbackError';
    this.status = status;
    this.code = code;
  }
}

function textLength(value) {
  return Array.from(String(value || '')).length;
}

function optionalMessage(value, field = 'message_optional') {
  const message = String(value || '').trim();
  if (textLength(message) > 100) {
    throw new FeedbackError('补充内容不能超过 100 个字', 422, `${field}_too_long`);
  }
  return message || null;
}

function anonymousId(value) {
  const id = String(value || '').trim();
  if (!UUID_RE.test(id)) {
    throw new FeedbackError('匿名测试编号无效', 422, 'anonymous_test_id_invalid');
  }
  return id;
}

function exactKeys(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FeedbackError('请求内容无效', 400, 'feedback_invalid_json');
  }
  const extras = Object.keys(body).filter((key) => !allowed.has(key));
  if (extras.length) throw new FeedbackError('请求包含未允许的字段', 422, 'feedback_extra_fields');
}

function validateFeedback(body) {
  exactKeys(body, new Set([
    'feedback_type',
    'page_name',
    'completion_status',
    'message_optional',
    'anonymous_test_id',
    'app_version',
    'device_type',
  ]));
  const feedbackType = String(body.feedback_type || '');
  const pageName = String(body.page_name || '');
  const completionStatus = String(body.completion_status || '');
  const appVersion = String(body.app_version || '').trim();
  const deviceType = String(body.device_type || '');
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    throw new FeedbackError('请选择反馈类型', 422, 'feedback_type_invalid');
  }
  if (!PAGE_NAMES.has(pageName)) {
    throw new FeedbackError('页面名称无效', 422, 'page_name_invalid');
  }
  if (!COMPLETION_STATUSES.has(completionStatus)) {
    throw new FeedbackError('请选择最后是否完成', 422, 'completion_status_invalid');
  }
  if (!appVersion || textLength(appVersion) > 40) {
    throw new FeedbackError('网站版本无效', 422, 'app_version_invalid');
  }
  if (!DEVICE_TYPES.has(deviceType)) {
    throw new FeedbackError('设备类型无效', 422, 'device_type_invalid');
  }
  const message = optionalMessage(body.message_optional);
  if (feedbackType === 'other' && !message) {
    throw new FeedbackError('选择“其他”时请简单补充一句', 422, 'message_required');
  }
  return {
    feedback_type: feedbackType,
    page_name: pageName,
    completion_status: completionStatus,
    message_optional: message,
    anonymous_test_id: anonymousId(body.anonymous_test_id),
    app_version: appVersion,
    device_type: deviceType,
  };
}

function validateSurvey(body) {
  exactKeys(body, new Set([
    'usage_days',
    'used_features',
    'reopen_intent',
    'primary_reason',
    'desired_change_optional',
    'anonymous_test_id',
  ]));
  const usageDays = String(body.usage_days || '');
  const features = Array.isArray(body.used_features)
    ? [...new Set(body.used_features.map((item) => String(item)))]
    : [];
  const intent = String(body.reopen_intent || '');
  const reason = String(body.primary_reason || '');

  if (!USAGE_DAYS.has(usageDays)) {
    throw new FeedbackError('请选择实际使用天数', 422, 'usage_days_invalid');
  }
  if (!features.length || features.some((item) => !USED_FEATURES.has(item))) {
    throw new FeedbackError('请选择使用过的功能', 422, 'used_features_invalid');
  }
  if (features.includes('none') && features.length !== 1) {
    throw new FeedbackError('“没有”不能与其他功能同时选择', 422, 'used_features_none_conflict');
  }
  if (!REOPEN_INTENTS.has(intent)) {
    throw new FeedbackError('请选择是否会再次打开', 422, 'reopen_intent_invalid');
  }
  const allowedReasons = intent === 'yes' ? YES_REASONS : NO_REASONS;
  if (!allowedReasons.has(reason)) {
    throw new FeedbackError('请选择最主要的原因', 422, 'primary_reason_invalid');
  }

  return {
    usage_days: usageDays,
    used_features: features,
    reopen_intent: intent,
    primary_reason: reason,
    desired_change_optional: optionalMessage(body.desired_change_optional, 'desired_change_optional'),
    anonymous_test_id: anonymousId(body.anonymous_test_id),
  };
}

function serviceHeaders(env, extra = {}) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) {
    throw new FeedbackError('反馈服务尚未完成配置', 503, 'feedback_setup_required');
  }
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  };
  // Legacy service_role keys are JWTs and need the Authorization header.
  // New sb_secret_* keys are intentionally not JWTs; Supabase authenticates
  // those through the apikey header and rejects them as bearer tokens.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function supabaseRequest(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new FeedbackError('反馈服务尚未完成配置', 503, 'feedback_setup_required');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: serviceHeaders(env, options.headers),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (/relation .* does not exist|schema cache/i.test(detail)) {
      throw new FeedbackError('反馈数据表尚未建立', 503, 'feedback_table_required');
    }
    throw new FeedbackError('反馈暂时无法提交，请稍后再试', 502, 'feedback_store_failed');
  }
  return response;
}

async function insertFeedback(env, payload) {
  const row = validateFeedback(payload);
  await supabaseRequest(env, 'feedback', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
}

async function insertDay7Survey(env, payload) {
  const row = validateSurvey(payload);
  await supabaseRequest(env, 'day7_survey', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
}

export {
  FeedbackError,
  insertDay7Survey,
  insertFeedback,
  serviceHeaders,
  supabaseRequest,
  validateFeedback,
  validateSurvey,
};
