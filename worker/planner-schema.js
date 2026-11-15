const DAY_TYPES = new Set(['productive', 'balanced', 'relaxed', 'minimum']);
const ITEM_TYPES = new Set(['main', 'explore', 'learn', 'move', 'read', 'enjoy']);
const DAYPARTS = ['morning', 'afternoon', 'evening', 'night'];

// Single source for the load tiers used by the prompt, the validator, and the fallback plan.
const LOAD_TIERS = [
  { name: 'LIGHT', label: 'LIGHT', mainMin: 30, mainMax: 60, supportMin: 2, supportMax: 4 },
  { name: 'BALANCED', label: 'BALANCED', mainMin: 60, mainMax: 90, supportMin: 3, supportMax: 5 },
  { name: 'FULL', label: 'FULL BUT HUMANE', mainMin: 90, mainMax: 120, supportMin: 3, supportMax: 6 },
];
const LIGHTER_REASONS = new Set(['too_much', 'less_time']);
const FULLER_REASONS = new Set(['too_easy', 'more_time']);
const MINIMUM_MAIN_MINUTES = 30;

// A replan that asks for less or more moves one tier, so the prompt and the validator agree.
export function loadTier(checkin = {}) {
  let index = 1;
  if (checkin.energy === 'low' || checkin.availableTime === 'busy') index = 0;
  else if (checkin.energy === 'high' && checkin.availableTime === 'mostly_free') index = 2;
  if (LIGHTER_REASONS.has(checkin.reason)) index = Math.max(0, index - 1);
  if (FULLER_REASONS.has(checkin.reason)) index = Math.min(LOAD_TIERS.length - 1, index + 1);
  return LOAD_TIERS[index];
}

export class PlannerOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlannerOutputError';
  }
}

function text(value, max, field, optional = false) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new PlannerOutputError(`${field} must be text`);
  const result = value.trim();
  if (!result && !optional) throw new PlannerOutputError(`${field} cannot be empty`);
  return result.slice(0, max);
}

function duration(value, field, optional = true) {
  if (value == null && optional) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 5 || number > 240) {
    throw new PlannerOutputError(`${field} must be 5-240 minutes`);
  }
  return number;
}

function item(value, field, { allowMain = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlannerOutputError(`${field} must be an object`);
  }
  const type = String(value.type || '').toLowerCase();
  if (!ITEM_TYPES.has(type) || (!allowMain && type === 'main')) {
    // Specific enough for the model to repair on retry.
    throw new PlannerOutputError(allowMain
      ? `${field}.type is not supported (use main, explore, learn, move, read, or enjoy)`
      : `${field}.type is not supported (use explore, learn, move, read, or enjoy; the main task belongs only in mainTask, never in sections)`);
  }
  return {
    id: text(value.id || crypto.randomUUID(), 80, `${field}.id`),
    type,
    title: text(value.title, 140, `${field}.title`),
    description: text(value.description, 360, `${field}.description`, true) || undefined,
    durationMinutes: duration(value.durationMinutes, `${field}.durationMinutes`),
    target: text(value.target, 100, `${field}.target`, true) || undefined,
    completed: value.completed === true,
  };
}

export function parsePlannerJson(content) {
  const raw = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!raw) throw new PlannerOutputError('Model returned empty content');
  try { return JSON.parse(raw); }
  catch { throw new PlannerOutputError('Model did not return valid JSON'); }
}

// With a check-in, the load tier and Minimum Day rules from the prompt are enforced too.
export function validateDailyPlan(payload, expectedDate, checkin = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PlannerOutputError('Daily plan must be an object');
  }
  const date = text(payload.date, 10, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (expectedDate && date !== expectedDate)) {
    throw new PlannerOutputError('date does not match the requested day');
  }
  const dayType = String(payload.dayType || '').toLowerCase();
  if (!DAY_TYPES.has(dayType) || dayType === 'minimum') {
    throw new PlannerOutputError('dayType must be productive, balanced, or relaxed');
  }
  const main = payload.mainTask;
  if (!main || typeof main !== 'object' || Array.isArray(main)) {
    throw new PlannerOutputError('Exactly one mainTask is required');
  }
  const mainTask = {
    id: text(main.id || crypto.randomUUID(), 80, 'mainTask.id'),
    type: 'main',
    title: text(main.title, 140, 'mainTask.title'),
    description: text(main.description, 360, 'mainTask.description', true) || undefined,
    durationMinutes: duration(main.durationMinutes, 'mainTask.durationMinutes', false),
    reason: text(main.reason, 240, 'mainTask.reason', true) || undefined,
    completed: main.completed === true,
  };

  if (!payload.sections || typeof payload.sections !== 'object' || Array.isArray(payload.sections)) {
    throw new PlannerOutputError('sections must be an object');
  }
  // From here on problems are collected and reported together, so one retry can fix all of them.
  const problems = [];
  const collect = (values, field, options) => values.flatMap((value, index) => {
    try { return [item(value, `${field}[${index}]`, options)]; }
    catch (error) {
      if (!(error instanceof PlannerOutputError)) throw error;
      problems.push(error.message);
      return [];
    }
  });
  const sections = {};
  let itemCount = 0;
  let misplacedMains = 0;
  const ids = new Set([mainTask.id]);
  for (const part of DAYPARTS) {
    const values = payload.sections[part];
    if (!Array.isArray(values)) throw new PlannerOutputError(`sections.${part} must be an array`);
    sections[part] = collect(values, `sections.${part}`);
    // A repeated main task will be removed by the fix; any other rejected item will be corrected and stay.
    const mains = values.filter((value) => String(value?.type || '').toLowerCase() === 'main').length;
    misplacedMains += mains;
    itemCount += values.length - mains;
    for (const planItem of sections[part]) {
      if (ids.has(planItem.id)) planItem.id = crypto.randomUUID();
      ids.add(planItem.id);
    }
  }
  const counted = `got ${itemCount}${misplacedMains ? ', not counting the main item that must be removed from sections' : ''}`;
  if (checkin) {
    const tier = loadTier(checkin);
    if (mainTask.durationMinutes < tier.mainMin || mainTask.durationMinutes > tier.mainMax) {
      problems.push(`mainTask.durationMinutes must be ${tier.mainMin}-${tier.mainMax} on a ${tier.name} day (got ${mainTask.durationMinutes})`);
    }
    if (itemCount < tier.supportMin || itemCount > tier.supportMax) {
      problems.push(`sections must contain ${tier.supportMin}-${tier.supportMax} supporting items in total on a ${tier.name} day (${counted})`);
    }
  } else if (itemCount < 2 || itemCount > 7) {
    problems.push(`Plan must contain 2-7 supporting items (${counted})`);
  }

  const minimumValues = Array.isArray(payload.minimumDay?.items) ? payload.minimumDay.items : [];
  if (minimumValues.length < 3 || minimumValues.length > 5) {
    problems.push(`minimumDay.items must contain 3-5 items (got ${minimumValues.length})`);
  }
  const minimumItems = collect(minimumValues, 'minimumDay.items', { allowMain: true });
  const minimumMains = minimumItems.filter((value) => value.type === 'main');
  if (minimumMains.length !== 1) {
    problems.push(`minimumDay must contain exactly one main item (got ${minimumMains.length})`);
  } else if (checkin && minimumMains[0].durationMinutes !== MINIMUM_MAIN_MINUTES) {
    problems.push(`minimumDay main item must be exactly ${MINIMUM_MAIN_MINUTES} minutes (got ${minimumMains[0].durationMinutes ?? 'none'})`);
  }
  if (problems.length) throw new PlannerOutputError(problems.slice(0, 6).join('; '));
  for (const planItem of minimumItems) {
    if (ids.has(planItem.id)) planItem.id = crypto.randomUUID();
    ids.add(planItem.id);
  }

  return {
    date,
    dayType,
    message: text(payload.message, 280, 'message'),
    mainTask,
    sections,
    minimumDay: {
      message: text(
        payload.minimumDay?.message || 'Today can be lighter. Do a few small things and let that be enough.',
        220,
        'minimumDay.message',
      ),
      items: minimumItems,
    },
    activeMode: 'standard',
  };
}

export function planItems(plan) {
  if (plan?.activeMode === 'minimum') return plan.minimumDay?.items || [];
  return [plan?.mainTask, ...DAYPARTS.flatMap((part) => plan?.sections?.[part] || [])].filter(Boolean);
}

export { DAYPARTS, DAY_TYPES, ITEM_TYPES };
