const DAY_TYPES = new Set(['productive', 'balanced', 'relaxed', 'minimum']);
const ITEM_TYPES = new Set(['main', 'explore', 'learn', 'move', 'read', 'enjoy']);
const DAYPARTS = ['morning', 'afternoon', 'evening', 'night'];

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
    throw new PlannerOutputError(`${field}.type is not supported`);
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

export function validateDailyPlan(payload, expectedDate) {
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
  const sections = {};
  let itemCount = 0;
  const ids = new Set([mainTask.id]);
  for (const part of DAYPARTS) {
    const values = payload.sections[part];
    if (!Array.isArray(values)) throw new PlannerOutputError(`sections.${part} must be an array`);
    sections[part] = values.map((value, index) => item(value, `sections.${part}[${index}]`));
    itemCount += sections[part].length;
    for (const planItem of sections[part]) {
      if (ids.has(planItem.id)) planItem.id = crypto.randomUUID();
      ids.add(planItem.id);
    }
  }
  if (itemCount < 2 || itemCount > 7) throw new PlannerOutputError('Plan must contain 2-7 supporting items');

  const minimumValues = payload.minimumDay?.items;
  if (!Array.isArray(minimumValues) || minimumValues.length < 3 || minimumValues.length > 5) {
    throw new PlannerOutputError('minimumDay.items must contain 3-5 items');
  }
  const minimumItems = minimumValues.map((value, index) => (
    item(value, `minimumDay.items[${index}]`, { allowMain: true })
  ));
  if (minimumItems.filter((value) => value.type === 'main').length !== 1) {
    throw new PlannerOutputError('minimumDay must contain exactly one main item');
  }
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
