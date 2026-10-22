// JSONB object key order is not chronological; always render explicit dayparts.
function orderedPlanSections(plan) {
  return ['morning', 'afternoon', 'evening', 'night'].map((part) => [part, plan?.sections?.[part] || []]);
}

function clonePlan(plan) {
  return typeof structuredClone === 'function'
    ? structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
}

function allPlanItems(plan) {
  return [
    plan?.mainTask,
    ...orderedPlanSections(plan).flatMap(([, items]) => items),
    ...(plan?.minimumDay?.items || []),
  ].filter(Boolean);
}

// Items of the mode the user is currently following (standard or Minimum Day).
function activePlanItems(plan) {
  if (plan?.activeMode === 'minimum') return plan.minimumDay?.items || [];
  return [plan?.mainTask, ...orderedPlanSections(plan).flatMap(([, items]) => items)].filter(Boolean);
}

function planProgress(plan) {
  const items = activePlanItems(plan);
  return { completed: items.filter((item) => item.completed).length, total: items.length };
}

function togglePlanItem(plan, id) {
  const next = clonePlan(plan);
  const target = allPlanItems(next).find((item) => item.id === id);
  if (!target) return plan;
  target.completed = !target.completed;
  return next;
}

function setPlanMode(plan, mode) {
  if (!['standard', 'minimum'].includes(mode)) return plan;
  return { ...plan, activeMode: mode };
}

const REVIEW_FEELINGS = ['too_much', 'just_right', 'too_light'];

// End-of-day review lives inside plan_json so the next generation can read it.
function setPlanReview(plan, { feeling, note = '' }, now = new Date()) {
  if (!REVIEW_FEELINGS.includes(feeling)) return plan;
  return {
    ...plan,
    review: {
      feeling,
      note: String(note || '').trim().slice(0, 240),
      ...planProgress(plan),
      reviewedAt: now.toISOString(),
    },
  };
}

export {
  REVIEW_FEELINGS, activePlanItems, allPlanItems, orderedPlanSections, planProgress,
  setPlanMode, setPlanReview, togglePlanItem,
};
