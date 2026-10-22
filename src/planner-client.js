async function authState() {
  const client = window.sbClient;
  if (!client) return { client: null, user: null, session: null };
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    client.auth.getUser(), client.auth.getSession(),
  ]);
  return {
    client,
    user: userData?.user || null,
    session: sessionData?.session || null,
  };
}

async function plannerState(date) {
  const { client, user } = await authState();
  if (!client || !user) return { signedIn: false, profile: null, plan: null };
  const [profileResult, planResult] = await Promise.all([
    client.from('planner_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    client.from('daily_plans').select('*').eq('user_id', user.id).eq('date', date)
      .order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = profileResult.error || planResult.error;
  if (error && error.code !== 'PGRST116') throw error;
  return { signedIn: true, profile: profileResult.data || null, plan: planResult.data || null };
}

async function savePlannerProfile(profile) {
  const { client, user } = await authState();
  if (!client || !user) throw new Error('auth_required');
  const payload = {
    user_id: user.id,
    priorities: profile.priorities,
    interests: profile.interests,
    planning_style: profile.planningStyle,
    daily_rhythm: profile.dailyRhythm,
    preferred_activities: profile.preferredActivities,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from('planner_profiles')
    .upsert(payload, { onConflict: 'user_id' }).select().single();
  if (error) throw error;
  return data;
}

async function callPlanner(path, input) {
  const { session } = await authState();
  if (!session?.access_token) throw new Error('auth_required');
  let response;
  try {
    response = await fetch(`/api/planner/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('network');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'planner_failed');
    error.code = payload.code || '';
    throw error;
  }
  return payload.plan;
}

async function updateDailyPlan(row, planJson) {
  const { client, user } = await authState();
  if (!client || !user) throw new Error('auth_required');
  const { data, error } = await client.from('daily_plans')
    .update({
      plan_json: planJson,
      day_type: planJson.activeMode === 'minimum' ? 'minimum' : planJson.dayType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id).eq('user_id', user.id).select().single();
  if (error) throw error;
  return data;
}

export { authState, callPlanner, plannerState, savePlannerProfile, updateDailyPlan };
