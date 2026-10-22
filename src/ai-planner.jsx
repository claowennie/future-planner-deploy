import React from 'react';
import ReactDOM from 'react-dom';
import { getLocale } from './i18n.js';
import { todayISO } from './store.jsx';
import {
  callPlanner, plannerState, savePlannerProfile, updateDailyPlan,
} from './planner-client.js';
import { orderedPlanSections, setPlanMode, togglePlanItem } from './planner-plan.js';

const { useCallback, useEffect, useMemo, useRef, useState } = React;

const COPY = {
  en: {
    minutes: 'min', saveFailed: 'Could not save this change. Please try again.',
    types: { main: 'Main', explore: 'Explore', learn: 'Learn', move: 'Move', read: 'Read', enjoy: 'Enjoy' },
    eyebrow: 'AI DAILY PLANNER', profileTitle: 'Let Future understand your days',
    profileSub: 'Set this once. Future will use it to propose a realistic day without asking you to plan from scratch.',
    priorities: 'Long-term priorities', interests: 'Interests', preferences: 'Planning style', rhythm: 'Preferred daily rhythm', activities: 'Typical activities',
    flexible: 'Flexible', structured: 'Structured', morning: 'Morning person', neutral: 'Neutral', evening: 'Evening person',
    custom: 'Add your own…', saveProfile: 'Save planning profile', saving: 'Saving…', chooseOne: 'Choose at least one priority and activity.',
    signInTitle: 'Your planner needs a home', signInSub: 'Sign in so Future can remember your profile, plans, and progress across devices.', signIn: 'Sign in to use AI Planner',
    checkTitle: 'How does today feel?', checkSub: 'Three quick choices, then Future will take it from here.', energy: 'Energy', time: 'Available time', style: 'Day style',
    low: 'Low', normal: 'Normal', high: 'High', free: 'Mostly free', half: 'Half day', busy: 'Busy', productive: 'Productive', balanced: 'Balanced', relaxed: 'Relaxed',
    mustDo: 'Anything you absolutely need to do today?', optional: 'Optional', plan: '✨ Plan my day',
    loading: ['Looking at what matters today…', 'Keeping your energy in mind…', 'Making room for life, too…'],
    failedTitle: "Future couldn't plan your day this time.", retry: 'Try again',
    focus: "TODAY'S FOCUS", main: 'MAIN', morningPart: 'MORNING', afternoonPart: 'AFTERNOON', eveningPart: 'EVENING', nightPart: 'NIGHT',
    progress: 'Today', goodDay: '4 / 6 is a good day.', minimumProgress: 'Every small step is enough today.', easier: 'Make today easier', fuller: 'Return to the full day', replan: 'Replan', editProfile: 'Planning profile',
    minimum: 'MINIMUM DAY', minimumDefault: 'Today can be lighter. Do a few small things and let that be enough.',
    replanTitle: 'What should change?', tooMuch: 'Too much', tooEasy: 'Too easy', lessTime: 'I have less time now', moreTime: 'I have more time now', changeFocus: "Change today's focus", surprise: 'Surprise me',
    focusInput: 'What should be the one focus today?', cancel: 'Cancel', applyReplan: 'Replan my day',
  },
  zh: {
    minutes: '分钟', saveFailed: '这次修改没有保存成功，请重试。',
    types: { main: '主任务', explore: '探索', learn: '学习', move: '运动', read: '阅读', enjoy: '享受生活' },
    profileLabels: {
      'Career / Job Search': '职业 / 求职', 'Personal Projects': '个人项目', Study: '学习',
      'Graduate Application': '研究生申请', Health: '健康', Reading: '阅读', Exploration: '探索',
      'AI / Technology': 'AI / 科技', Business: '商业', Science: '科学', 'Ocean / Climate': '海洋 / 气候',
      History: '历史', Psychology: '心理学', 'World Affairs': '国际时事', Art: '艺术',
      'Build / coding': '创作 / 编程', Learning: '学习', Exercise: '锻炼', Walking: '散步', Rest: '休息',
    },
    eyebrow: 'AI 每日规划', profileTitle: '让 Future 先理解你的生活',
    profileSub: '只需设置一次。以后 Future 会直接为你提出合理的一天，不必每天从零规划。',
    priorities: '长期优先事项', interests: '兴趣领域', preferences: '规划偏好', rhythm: '日常节奏', activities: '常见活动',
    flexible: '灵活', structured: '结构化', morning: '晨型', neutral: '中性', evening: '夜型',
    custom: '添加自定义…', saveProfile: '保存规划档案', saving: '保存中…', chooseOne: '请至少选择一项长期重点和一项常见活动。',
    signInTitle: '给你的计划一个安稳的家', signInSub: '登录后，Future 才能跨设备记住你的档案、每日计划与完成情况。', signIn: '登录后使用 AI Planner',
    checkTitle: '今天感觉怎么样？', checkSub: '只做三个选择，接下来交给 Future。', energy: '精力', time: '可用时间', style: '今天的风格',
    low: '低', normal: '正常', high: '充沛', free: '基本有空', half: '半天', busy: '很忙', productive: '推进为主', balanced: '平衡', relaxed: '轻松',
    mustDo: '今天有没有必须完成的事？', optional: '选填', plan: '✨ 帮我安排今天',
    loading: ['正在看看今天真正重要的事…', '把你的精力也考虑进去…', '也给生活留一点空间…'],
    failedTitle: 'Future 这次没能安排好你的一天。', retry: '再试一次',
    focus: '今天的重点', main: 'MAIN · 主任务', morningPart: '上午', afternoonPart: '下午', eveningPart: '傍晚', nightPart: '夜间',
    progress: '今天', goodDay: '完成 4 / 6，就是很好的一天。', minimumProgress: '今天每完成一小步，都已经足够。', easier: '让今天轻一点', fuller: '回到完整计划', replan: '重新规划', editProfile: '规划档案',
    minimum: 'MINIMUM DAY · 最小一天', minimumDefault: '今天可以轻一点。做几件小事，就已经足够。',
    replanTitle: '你希望改变什么？', tooMuch: '太多了', tooEasy: '太简单', lessTime: '现在时间更少', moreTime: '现在时间更多', changeFocus: '更换今天的重点', surprise: '给我一个惊喜',
    focusInput: '今天唯一的重点应该是什么？', cancel: '取消', applyReplan: '重新安排今天',
  },
};

const PROFILE_OPTIONS = {
  priorities: ['Career / Job Search', 'Personal Projects', 'Study', 'Graduate Application', 'Health', 'Reading', 'Exploration'],
  interests: ['AI / Technology', 'Business', 'Science', 'Ocean / Climate', 'History', 'Psychology', 'World Affairs', 'Art'],
  activities: ['Build / coding', 'Learning', 'Exercise', 'Walking', 'Reading', 'Exploration', 'Rest'],
};

const TYPE_META = {
  explore: ['◌', 'Explore'], learn: ['↗', 'Learn'], move: ['~', 'Move'],
  read: ['□', 'Read'], enjoy: ['✦', 'Enjoy'], main: ['●', 'Main'],
};

function ChoiceChips({ values, selected, onChange, single = false }) {
  const toggle = (value) => onChange(single
    ? value
    : (selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]));
  return <div className="planner-chips">{values.map((option) => {
    const value = typeof option === 'string' ? option : option.value;
    const label = typeof option === 'string' ? option : option.label;
    const active = single ? selected === value : selected.includes(value);
    return <button key={value} type="button" className={`planner-chip ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => toggle(value)}>{label}</button>;
  })}</div>;
}

function TagField({ title, options, value, onChange, copy }) {
  const [custom, setCustom] = useState('');
  const add = () => {
    const next = custom.trim().slice(0, 60);
    if (next && !value.includes(next)) onChange([...value, next]);
    setCustom('');
  };
  const all = [...new Set([...options, ...value.filter((item) => !options.includes(item))])];
  return <div className="planner-field">
    <div className="planner-label">{title}</div>
    <ChoiceChips values={all.map((item) => ({ value: item, label: copy.profileLabels?.[item] || item }))} selected={value} onChange={onChange}/>
    <input className="planner-custom" value={custom} onChange={(event) => setCustom(event.target.value)} onBlur={add}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder={copy.custom} maxLength={60}/>
  </div>;
}

function PlannerProfile({ initial, onSaved, copy }) {
  const [profile, setProfile] = useState({
    priorities: initial?.priorities || [], interests: initial?.interests || [],
    planningStyle: initial?.planning_style || 'flexible', dailyRhythm: initial?.daily_rhythm || 'neutral',
    preferredActivities: initial?.preferred_activities || [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const save = async () => {
    if (!profile.priorities.length || !profile.preferredActivities.length) { setError(copy.chooseOne); return; }
    setBusy(true); setError('');
    try { onSaved(await savePlannerProfile(profile)); }
    catch { setError(copy.failedTitle); }
    finally { setBusy(false); }
  };
  return <section className="planner-shell planner-profile">
    <div className="planner-eyebrow">{copy.eyebrow}</div><h2>{copy.profileTitle}</h2><p className="planner-lede">{copy.profileSub}</p>
    <TagField title={copy.priorities} options={PROFILE_OPTIONS.priorities} value={profile.priorities} onChange={(value) => update('priorities', value)} copy={copy}/>
    <TagField title={copy.interests} options={PROFILE_OPTIONS.interests} value={profile.interests} onChange={(value) => update('interests', value)} copy={copy}/>
    <div className="planner-field-grid">
      <div className="planner-field"><div className="planner-label">{copy.preferences}</div><ChoiceChips single selected={profile.planningStyle} onChange={(value) => update('planningStyle', value)} values={[{ value: 'flexible', label: copy.flexible }, { value: 'structured', label: copy.structured }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.rhythm}</div><ChoiceChips single selected={profile.dailyRhythm} onChange={(value) => update('dailyRhythm', value)} values={[{ value: 'morning', label: copy.morning }, { value: 'neutral', label: copy.neutral }, { value: 'evening', label: copy.evening }]}/></div>
    </div>
    <TagField title={copy.activities} options={PROFILE_OPTIONS.activities} value={profile.preferredActivities} onChange={(value) => update('preferredActivities', value)} copy={copy}/>
    {error && <div className="planner-error" role="alert">{error}</div>}
    <button type="button" className="btn btn-primary planner-primary" disabled={busy} onClick={save}>{busy ? copy.saving : copy.saveProfile}</button>
  </section>;
}

function DailyCheckin({ onGenerate, copy, busy }) {
  const [input, setInput] = useState({ energy: 'normal', availableTime: 'half_day', dayStyle: 'balanced', mustDo: '' });
  const set = (field, value) => setInput((current) => ({ ...current, [field]: value }));
  return <section className="planner-shell planner-checkin">
    <div className="planner-eyebrow">{copy.eyebrow}</div><h2>{copy.checkTitle}</h2><p className="planner-lede">{copy.checkSub}</p>
    <div className="planner-check-grid">
      <div className="planner-field"><div className="planner-label">{copy.energy}</div><ChoiceChips single selected={input.energy} onChange={(value) => set('energy', value)} values={[{ value: 'low', label: `○ ${copy.low}` }, { value: 'normal', label: `◐ ${copy.normal}` }, { value: 'high', label: `⚡ ${copy.high}` }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.time}</div><ChoiceChips single selected={input.availableTime} onChange={(value) => set('availableTime', value)} values={[{ value: 'mostly_free', label: copy.free }, { value: 'half_day', label: copy.half }, { value: 'busy', label: copy.busy }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.style}</div><ChoiceChips single selected={input.dayStyle} onChange={(value) => set('dayStyle', value)} values={[{ value: 'productive', label: copy.productive }, { value: 'balanced', label: copy.balanced }, { value: 'relaxed', label: copy.relaxed }]}/></div>
    </div>
    <label className="planner-must"><span>{copy.mustDo} <em>{copy.optional}</em></span><input value={input.mustDo} onChange={(event) => set('mustDo', event.target.value)} maxLength={240}/></label>
    <button type="button" className="btn btn-primary planner-primary" disabled={busy} onClick={() => onGenerate(input)}>{copy.plan}</button>
  </section>;
}

function LoadingPlanner({ copy }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { const timer = setInterval(() => setIndex((value) => (value + 1) % copy.loading.length), 1700); return () => clearInterval(timer); }, [copy]);
  return <section className="planner-shell planner-loading" aria-live="polite"><div className="planner-orbit"><span/><span/><span/></div><p>{copy.loading[index]}</p></section>;
}

function PlanItem({ item, main = false, onToggle, copy, disabled }) {
  const [mark, fallbackLabel] = TYPE_META[item.type] || TYPE_META.learn;
  const label = copy.types[item.type] || fallbackLabel;
  return <button type="button" className={`planner-item ${main ? 'planner-main' : ''} ${item.completed ? 'completed' : ''}`} disabled={disabled} onClick={() => onToggle(item.id)} aria-pressed={item.completed}>
    <div className="planner-item-type"><span>{mark}</span>{main ? label.toUpperCase() : label}</div>
    <div className="planner-item-copy"><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}
      <div className="planner-item-meta">{item.durationMinutes ? `${item.durationMinutes} ${copy.minutes}` : ''}{item.target ? `${item.durationMinutes ? ' · ' : ''}${item.target}` : ''}</div></div>
    <span className="planner-check" aria-hidden="true">{item.completed ? '✓' : ''}</span>
  </button>;
}

function ReplanSheet({ copy, onClose, onSubmit, busy }) {
  const [reason, setReason] = useState('');
  const [focus, setFocus] = useState('');
  const options = [
    ['too_much', copy.tooMuch], ['too_easy', copy.tooEasy], ['less_time', copy.lessTime],
    ['more_time', copy.moreTime], ['change_focus', copy.changeFocus], ['surprise_me', copy.surprise],
  ];
  return ReactDOM.createPortal(<div className="planner-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="planner-sheet" role="dialog" aria-modal="true" aria-label={copy.replanTitle}>
      <div className="planner-sheet-handle"/><h3>{copy.replanTitle}</h3>
      <ChoiceChips single selected={reason} onChange={setReason} values={options.map(([value, label]) => ({ value, label }))}/>
      {reason === 'change_focus' && <input className="planner-focus-input" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder={copy.focusInput} maxLength={240} autoFocus/>}
      <div className="planner-sheet-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>{copy.cancel}</button><button type="button" className="btn btn-primary" disabled={!reason || busy || (reason === 'change_focus' && !focus.trim())} onClick={() => onSubmit(reason, focus)}>{copy.applyReplan}</button></div>
    </div>
  </div>, document.body);
}

function TodayPlan({ row, onRowChange, onReplan, onEditProfile, copy }) {
  const plan = row.plan_json;
  const minimum = plan.activeMode === 'minimum';
  const standardItems = [plan.mainTask, ...orderedPlanSections(plan).flatMap(([, items]) => items)].filter(Boolean);
  const items = minimum ? (plan.minimumDay?.items || []) : standardItems;
  const completed = items.filter((item) => item.completed).length;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const persist = async (next) => {
    if (savingRef.current || next === plan) return;
    savingRef.current = true;
    setSaving(true); setSaveError('');
    onRowChange({ ...row, plan_json: next });
    try { onRowChange(await updateDailyPlan(row, next)); }
    catch { onRowChange(row); setSaveError(copy.saveFailed); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const toggle = (id) => persist(togglePlanItem(plan, id));
  const switchMode = () => persist(setPlanMode(plan, minimum ? 'standard' : 'minimum'));
  return <section className={`planner-today ${minimum ? 'minimum' : ''}`}>
    <div className="planner-today-head"><div><div className="planner-eyebrow">{minimum ? copy.minimum : copy.eyebrow}</div><p>{minimum ? (plan.minimumDay?.message || copy.minimumDefault) : plan.message}</p></div><button type="button" className="planner-profile-link" disabled={saving} onClick={onEditProfile}>{copy.editProfile}</button></div>
    {!minimum && <><div className="planner-section-title">{copy.focus}</div><PlanItem item={plan.mainTask} main onToggle={toggle} copy={copy} disabled={saving}/></>}
    {minimum ? <div className="planner-minimum-list">{items.map((item) => <PlanItem key={item.id} item={item} main={item.type === 'main'} onToggle={toggle} copy={copy} disabled={saving}/>)}</div> : orderedPlanSections(plan).map(([part, partItems]) => partItems.length > 0 && <div className="planner-daypart" key={part}><div className="planner-section-title">{copy[`${part}Part`]}</div>{partItems.map((item) => <PlanItem key={item.id} item={item} onToggle={toggle} copy={copy} disabled={saving}/>)}</div>)}
    <div className="planner-progress"><div className="planner-progress-copy"><span>{copy.progress}</span><strong>{completed} / {items.length}</strong></div><div className="planner-progress-track"><span style={{ width: `${items.length ? completed / items.length * 100 : 0}%` }}/></div><p>{minimum ? copy.minimumProgress : copy.goodDay}</p></div>
    {saveError && <div className="planner-error" role="alert">{saveError}</div>}
    <div className="planner-actions"><button type="button" className="btn btn-ghost" disabled={saving} onClick={switchMode}>{minimum ? '↖' : '⌁'} {minimum ? copy.fuller : copy.easier}</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={onReplan}>↻ {copy.replan}</button></div>
  </section>;
}

function AIPlanner() {
  const copy = COPY[getLocale()] || COPY.zh;
  const date = todayISO();
  const [status, setStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [row, setRow] = useState(null);
  const [lastInput, setLastInput] = useState(null);
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [replanOpen, setReplanOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading'); setError('');
    try {
      const state = await plannerState(date);
      if (!state.signedIn) { setStatus('signed_out'); return; }
      setProfile(state.profile); setRow(state.plan);
      setStatus(state.profile ? (state.plan ? 'plan' : 'checkin') : 'profile');
    } catch { setStatus('error'); setError(copy.failedTitle); }
  }, [copy.failedTitle, date]);

  useEffect(() => {
    load();
    const { data } = window.sbClient?.auth.onAuthStateChange(() => { setTimeout(load, 0); }) || {};
    return () => data?.subscription?.unsubscribe();
  }, [load]);

  const generate = async (input) => {
    setLastInput(input); setStatus('generating'); setError('');
    try {
      const next = await callPlanner('generate', { ...input, date, lang: getLocale() });
      setRow(next); setStatus('plan');
    } catch { setError(copy.failedTitle); setStatus('error'); }
  };
  const replan = async (reason, focus) => {
    const current = row.checkin || lastInput || { energy: 'normal', availableTime: 'half_day', dayStyle: 'balanced', mustDo: '' };
    const adjusted = { ...current };
    if (reason === 'too_much') { adjusted.energy = 'low'; adjusted.dayStyle = 'relaxed'; }
    if (reason === 'too_easy') { adjusted.energy = 'high'; adjusted.dayStyle = 'productive'; }
    if (reason === 'less_time') adjusted.availableTime = 'busy';
    if (reason === 'more_time') adjusted.availableTime = 'mostly_free';
    if (reason === 'change_focus') adjusted.mustDo = focus.trim();
    setReplanOpen(false); setStatus('generating');
    try {
      const next = await callPlanner('replan', { ...adjusted, date, lang: getLocale(), reason });
      setRow(next); setStatus('plan');
    } catch { setError(copy.failedTitle); setStatus('error'); }
  };

  const content = useMemo(() => {
    if (status === 'loading' || status === 'generating') return <LoadingPlanner copy={copy}/>;
    if (status === 'signed_out') return <section className="planner-shell planner-signin"><div className="planner-eyebrow">{copy.eyebrow}</div><h2>{copy.signInTitle}</h2><p className="planner-lede">{copy.signInSub}</p><button type="button" className="btn btn-primary planner-primary" onClick={() => window.dispatchEvent(new Event('future:open-auth'))}>{copy.signIn}</button></section>;
    if (editingProfile || status === 'profile') return <PlannerProfile initial={profile} copy={copy} onSaved={(saved) => { setProfile(saved); setEditingProfile(false); setStatus(row ? 'plan' : 'checkin'); }}/>;
    if (status === 'checkin') return <DailyCheckin copy={copy} onGenerate={generate}/>;
    if (status === 'error') return <section className="planner-shell planner-failed"><div className="planner-failed-mark">∿</div><h3>{error || copy.failedTitle}</h3><button type="button" className="btn btn-primary" onClick={() => (profile ? setStatus(row ? 'plan' : 'checkin') : load())}>{copy.retry}</button></section>;
    return <TodayPlan row={row} copy={copy} onRowChange={setRow} onReplan={() => setReplanOpen(true)} onEditProfile={() => setEditingProfile(true)}/>;
  }, [copy, editingProfile, error, load, profile, row, status]);

  return <div className="ai-planner-wrap">{content}{replanOpen && <ReplanSheet copy={copy} busy={status === 'generating'} onClose={() => setReplanOpen(false)} onSubmit={replan}/>}</div>;
}

export { AIPlanner };
