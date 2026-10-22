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

export { allPlanItems, orderedPlanSections, setPlanMode, togglePlanItem };
