import assert from 'node:assert/strict';
import { buildPlannerPrompt, fallbackPlan, generatePlannerDay, validatePlannerInput } from '../worker/planner.js';
import { planItems, validateDailyPlan } from '../worker/planner-schema.js';
import { orderedPlanSections, setPlanMode, togglePlanItem } from '../src/planner-plan.js';

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
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes('/rest/v1/planner_profiles')) return Response.json([{
    priorities: profile.priorities, interests: profile.interests,
    planning_style: 'flexible', daily_rhythm: 'neutral', preferred_activities: profile.preferredActivities,
  }]);
  if (target.includes('/rest/v1/planner_data')) return Response.json([{ data: {
    okrs: [{ id: 'goal-1', name: 'Build a personal AI product', aim: 'Ship a useful first version', krs: [] }],
    todos: { [date]: [{ id: 'task-1', text: input.mustDo, done: false, okrId: 'goal-1' }] },
  } }]);
  if (target.includes('/rest/v1/daily_plans') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (target.includes('/rest/v1/daily_plans') && options.method === 'POST') {
    inserted = JSON.parse(options.body);
    return Response.json([{ id: 'plan-row', ...inserted }]);
  }
  if (target.includes('api.deepseek.com')) return Response.json({ choices: [{ message: { content: JSON.stringify(aiPayload) } }] });
  throw new Error(`Unexpected URL ${target}`);
};
const generated = await generatePlannerDay({
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
  DEEPSEEK_API_KEY: 'x'.repeat(32), PLANNER_MODEL: 'deepseek-flash',
}, 'user-token', 'user-1', input);
assert.equal(generated.source, 'ai');
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
  if (target.includes('api.deepseek.com')) return Response.json({ choices: [{ message: { content: JSON.stringify({ ...aiPayload, mainTask: { ...aiPayload.mainTask, title: 'Ship a smaller complete slice' } }) } }] });
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

globalThis.fetch = originalFetch;

console.log('planner tests passed');
