import React from 'react';
import ReactDOM from 'react-dom';
import { getLocale } from './i18n.js';
import { todayISO } from './store.jsx';
import { toISO } from './dates.js';
import { Icon } from './components.jsx';
import {
  callPlanner, plannerState, savePlannerProfile, updateDailyPlan,
} from './planner-client.js';
import {
  REVIEW_FEELINGS, orderedPlanSections, planProgress, setPlanMode, setPlanReview, togglePlanItem,
} from './planner-plan.js';

const { useCallback, useEffect, useRef, useState } = React;

const COLLAPSE_KEY = 'ai_planner_collapsed_v1';

const COPY = {
  en: {
    title: 'AI Daily Plan', minutes: 'min', saveFailed: 'Could not save this change. Please try again.',
    types: { main: 'Main', explore: 'Explore', learn: 'Learn', move: 'Move', read: 'Read', enjoy: 'Enjoy' },
    profileTitle: 'Let Future understand your days',
    profileSub: 'Set this once. Future will use it to propose a realistic day without asking you to plan from scratch.',
    priorities: 'Long-term priorities', interests: 'Interests', preferences: 'Planning style', rhythm: 'Preferred daily rhythm', activities: 'Typical activities',
    flexible: 'Flexible', structured: 'Structured', morning: 'Morning person', neutral: 'Neutral', evening: 'Evening person',
    custom: 'Add your own…', saveProfile: 'Save planning profile', saving: 'Saving…', chooseOne: 'Choose at least one priority and activity.',
    signInSub: 'Sign in and Future will plan a realistic day around your goals, energy, and time.', signIn: 'Sign in',
    checkTitle: 'How does today feel?', checkSub: 'Three quick choices, then Future takes it from here.', energy: 'Energy', time: 'Available time', style: 'Day style',
    low: 'Low', normal: 'Normal', high: 'High', free: 'Mostly free', half: 'Half day', busy: 'Busy', productive: 'Productive', balanced: 'Balanced', relaxed: 'Relaxed',
    mustDo: 'Anything you must do today? (optional)', plan: 'Plan my day',
    loading: ['Looking at what matters today…', 'Keeping your energy in mind…', 'Making room for life, too…'],
    failedTitle: "Future couldn't plan your day this time.", retry: 'Try again', backToPlan: 'Back to plan',
    errors: {
      rate_limited: 'A few too many requests. Please wait a minute and try again.',
      network: 'The connection dropped. Check your network and try again.',
      planner_ai_not_configured: 'AI planning is temporarily unavailable.',
      planner_timeout: 'Planning took too long this time. Please try again.',
    },
    dayparts: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' },
    why: 'Why this', goodDay: (target, total) => `${target} of ${total} is already a good day.`, allDone: 'Everything is done. Enjoy the rest of today.',
    minimumProgress: 'Every small step is enough today.',
    easier: 'Make today lighter', fuller: 'Back to the full day', replan: 'Replan', editProfile: 'Planning profile',
    minimum: 'Minimum Day', minimumDefault: 'Today can be lighter. Do a few small things and let that be enough.',
    collapse: 'Collapse plan', expand: 'Expand plan',
    replanTitle: 'What should change?', tooMuch: 'Too much', tooEasy: 'Too easy', lessTime: 'I have less time now', moreTime: 'I have more time now', changeFocus: "Change today's focus", surprise: 'Surprise me',
    focusInput: 'What should be the one focus today?', cancel: 'Cancel', applyReplan: 'Replan my day',
    reviewTitle: 'Wrap-up review', reviewPrompt: 'How did today’s plan feel?',
    feelings: { too_much: 'A bit too much', just_right: 'Just right', too_light: 'Could do more' },
    reviewNote: 'A note for tomorrow (optional)', saveReview: 'Save review', reviewed: 'Reviewed', editReview: 'Edit',
    reviewHint: 'Tomorrow’s plan will take this into account.',
    lastTime: (label, done, total) => `${label}: ${done}/${total} done`, yesterday: 'Yesterday', mainDone: 'main task done',
  },
  zh: {
    title: 'AI 每日规划 · Daily Plan', minutes: '分钟', saveFailed: '这次修改没有保存成功，请重试。',
    types: { main: '主任务', explore: '探索', learn: '学习', move: '运动', read: '阅读', enjoy: '享受' },
    profileLabels: {
      'Career / Job Search': '职业 / 求职', 'Personal Projects': '个人项目', Study: '学习',
      'Graduate Application': '研究生申请', Health: '健康', Reading: '阅读', Exploration: '探索',
      'AI / Technology': 'AI / 科技', Business: '商业', Science: '科学', 'Ocean / Climate': '海洋 / 气候',
      History: '历史', Psychology: '心理学', 'World Affairs': '国际时事', Art: '艺术',
      'Build / coding': '创作 / 编程', Learning: '学习', Exercise: '锻炼', Walking: '散步', Rest: '休息',
    },
    profileTitle: '让 Future 先理解你的生活',
    profileSub: '只需设置一次。以后 Future 会直接为你提出合理的一天，不必每天从零规划。',
    priorities: '长期优先事项', interests: '兴趣领域', preferences: '规划偏好', rhythm: '日常节奏', activities: '常见活动',
    flexible: '灵活', structured: '结构化', morning: '晨型', neutral: '中性', evening: '夜型',
    custom: '添加自定义…', saveProfile: '保存规划档案', saving: '保存中…', chooseOne: '请至少选择一项长期重点和一项常见活动。',
    signInSub: '登录后，Future 会结合你的目标、精力和时间，为你安排切实可行的一天。', signIn: '登录',
    checkTitle: '今天感觉怎么样？', checkSub: '只做三个选择，接下来交给 Future。', energy: '精力', time: '可用时间', style: '今天的风格',
    low: '偏低', normal: '正常', high: '充沛', free: '基本有空', half: '半天', busy: '很忙', productive: '推进为主', balanced: '平衡', relaxed: '轻松',
    mustDo: '今天有必须完成的事吗？（选填）', plan: '帮我安排今天',
    loading: ['正在看看今天真正重要的事…', '把你的精力也考虑进去…', '也给生活留一点空间…'],
    failedTitle: 'Future 这次没能安排好你的一天。', retry: '再试一次', backToPlan: '回到计划',
    errors: {
      rate_limited: '请求有点频繁，稍等一分钟再试。',
      network: '网络好像断开了，检查后再试。',
      planner_ai_not_configured: 'AI 规划暂时不可用，请稍后再试。',
      planner_timeout: '这次规划用时太久，请再试一次。',
    },
    dayparts: { morning: '上午', afternoon: '下午', evening: '傍晚', night: '夜间' },
    why: '为什么是它', goodDay: (target, total) => `完成 ${target} / ${total}，就是很好的一天。`, allDone: '全部完成，剩下的时间好好享受。',
    minimumProgress: '今天每完成一小步，都已经足够。',
    easier: '让今天轻一点', fuller: '回到完整计划', replan: '重新规划', editProfile: '规划档案',
    minimum: '最小一天', minimumDefault: '今天可以轻一点。做几件小事，就已经足够。',
    collapse: '收起计划', expand: '展开计划',
    replanTitle: '你希望改变什么？', tooMuch: '太多了', tooEasy: '太简单', lessTime: '现在时间更少', moreTime: '现在时间更多', changeFocus: '更换今天的重点', surprise: '给我一个惊喜',
    focusInput: '今天唯一的重点应该是什么？', cancel: '取消', applyReplan: '重新安排今天',
    reviewTitle: '收尾复盘', reviewPrompt: '今天的安排，感觉如何？',
    feelings: { too_much: '有点太满', just_right: '刚刚好', too_light: '还能更多' },
    reviewNote: '给明天留一句话（选填）', saveReview: '保存复盘', reviewed: '已复盘', editReview: '修改',
    reviewHint: '明天的规划会参考这次复盘。',
    lastTime: (label, done, total) => `${label}完成 ${done}/${total}`, yesterday: '昨天', mainDone: '主任务已完成',
  },
};

const PROFILE_OPTIONS = {
  priorities: ['Career / Job Search', 'Personal Projects', 'Study', 'Graduate Application', 'Health', 'Reading', 'Exploration'],
  interests: ['AI / Technology', 'Business', 'Science', 'Ocean / Climate', 'History', 'Psychology', 'World Affairs', 'Art'],
  activities: ['Build / coding', 'Learning', 'Exercise', 'Walking', 'Reading', 'Exploration', 'Rest'],
};

function errorMessage(error, copy) {
  if (error?.status === 429) return copy.errors.rate_limited;
  return copy.errors[error?.code] || copy.failedTitle;
}

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

function ChoiceChips({ values, selected, onChange, single = false, className = '' }) {
  const toggle = (value) => onChange(single
    ? value
    : (selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]));
  return <div className={`planner-chips ${className}`}>{values.map((option) => {
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
    <input className="planner-input planner-custom" value={custom} onChange={(event) => setCustom(event.target.value)} onBlur={add}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder={copy.custom} maxLength={60}/>
  </div>;
}

function PlannerProfile({ initial, onSaved, onCancel, copy }) {
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
    catch (err) { setError(errorMessage(err, copy)); }
    finally { setBusy(false); }
  };
  return <div className="planner-pane planner-profile">
    <h3 className="planner-heading">{copy.profileTitle}</h3><p className="planner-lede">{copy.profileSub}</p>
    <TagField title={copy.priorities} options={PROFILE_OPTIONS.priorities} value={profile.priorities} onChange={(value) => update('priorities', value)} copy={copy}/>
    <TagField title={copy.interests} options={PROFILE_OPTIONS.interests} value={profile.interests} onChange={(value) => update('interests', value)} copy={copy}/>
    <div className="planner-field-grid">
      <div className="planner-field"><div className="planner-label">{copy.preferences}</div><ChoiceChips single className="planner-seg" selected={profile.planningStyle} onChange={(value) => update('planningStyle', value)} values={[{ value: 'flexible', label: copy.flexible }, { value: 'structured', label: copy.structured }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.rhythm}</div><ChoiceChips single className="planner-seg" selected={profile.dailyRhythm} onChange={(value) => update('dailyRhythm', value)} values={[{ value: 'morning', label: copy.morning }, { value: 'neutral', label: copy.neutral }, { value: 'evening', label: copy.evening }]}/></div>
    </div>
    <TagField title={copy.activities} options={PROFILE_OPTIONS.activities} value={profile.preferredActivities} onChange={(value) => update('preferredActivities', value)} copy={copy}/>
    {error && <div className="planner-error" role="alert">{error}</div>}
    <div className="planner-form-actions">
      {onCancel && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>{copy.cancel}</button>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? copy.saving : copy.saveProfile}</button>
    </div>
  </div>;
}

function PreviousRecap({ previous, today, copy }) {
  const plan = previous?.plan_json;
  if (!plan) return null;
  const { completed, total } = planProgress(plan);
  if (!total) return null;
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = previous.date === toISO(yesterday);
  const label = isYesterday ? copy.yesterday : previous.date.slice(5).replace('-', '/');
  const mainDone = plan.activeMode !== 'minimum' && plan.mainTask?.completed;
  const feeling = plan.review?.feeling && copy.feelings[plan.review.feeling];
  return <div className="planner-recap">
    <span className="planner-recap-dot" aria-hidden="true"/>
    <span>{copy.lastTime(label, completed, total)}</span>
    {mainDone && <span>· {copy.mainDone}</span>}
    {feeling && <span>· {feeling}</span>}
  </div>;
}

function DailyCheckin({ initial, previous, today, onGenerate, copy }) {
  const [input, setInput] = useState(initial || { energy: 'normal', availableTime: 'half_day', dayStyle: 'balanced', mustDo: '' });
  const set = (field, value) => setInput((current) => ({ ...current, [field]: value }));
  const submit = (event) => { event.preventDefault(); onGenerate(input); };
  return <form className="planner-pane planner-checkin" onSubmit={submit}>
    <div className="planner-checkin-intro">
      <h3 className="planner-heading">{copy.checkTitle}</h3>
      <p className="planner-lede">{copy.checkSub}</p>
      <PreviousRecap previous={previous} today={today} copy={copy}/>
    </div>
    <div className="planner-check-grid">
      <div className="planner-field"><div className="planner-label">{copy.energy}</div><ChoiceChips single className="planner-seg" selected={input.energy} onChange={(value) => set('energy', value)} values={[{ value: 'low', label: copy.low }, { value: 'normal', label: copy.normal }, { value: 'high', label: copy.high }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.time}</div><ChoiceChips single className="planner-seg" selected={input.availableTime} onChange={(value) => set('availableTime', value)} values={[{ value: 'mostly_free', label: copy.free }, { value: 'half_day', label: copy.half }, { value: 'busy', label: copy.busy }]}/></div>
      <div className="planner-field"><div className="planner-label">{copy.style}</div><ChoiceChips single className="planner-seg" selected={input.dayStyle} onChange={(value) => set('dayStyle', value)} values={[{ value: 'productive', label: copy.productive }, { value: 'balanced', label: copy.balanced }, { value: 'relaxed', label: copy.relaxed }]}/></div>
    </div>
    <div className="planner-submit-row">
      <input className="planner-input" value={input.mustDo} onChange={(event) => set('mustDo', event.target.value)} maxLength={240} placeholder={copy.mustDo} aria-label={copy.mustDo}/>
      <button type="submit" className="btn btn-primary"><Icon.Sparkle/> {copy.plan}</button>
    </div>
  </form>;
}

function LoadingPlanner({ copy }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { const timer = setInterval(() => setIndex((value) => (value + 1) % copy.loading.length), 1700); return () => clearInterval(timer); }, [copy]);
  return <div className="planner-pane planner-loading" aria-live="polite" aria-busy="true">
    <div className="planner-skeleton"><span/><span/><span/></div>
    <p>{copy.loading[index]}</p>
  </div>;
}

function CheckMark({ done }) {
  return <span className={`planner-check ${done ? 'checked' : ''}`} aria-hidden="true"><Icon.Check/></span>;
}

function itemMeta(item, copy) {
  return [item.durationMinutes ? `${item.durationMinutes} ${copy.minutes}` : '', item.target || ''].filter(Boolean).join(' · ');
}

function FocusItem({ item, onToggle, copy, disabled }) {
  if (!item) return null;
  const meta = itemMeta(item, copy);
  return <button type="button" className={`planner-focus ${item.completed ? 'completed' : ''}`} disabled={disabled} onClick={() => onToggle(item.id)} aria-pressed={item.completed}>
    <span className="planner-focus-top"><span className="planner-tag" data-type="main">{copy.types.main}</span>{meta && <span className="planner-meta">{meta}</span>}<CheckMark done={item.completed}/></span>
    <strong className="planner-focus-title">{item.title}</strong>
    {item.description && <span className="planner-focus-desc">{item.description}</span>}
    {item.reason && <span className="planner-focus-why"><em>{copy.why}</em>{item.reason}</span>}
  </button>;
}

function PlanRow({ item, onToggle, copy, disabled }) {
  const meta = itemMeta(item, copy);
  return <button type="button" className={`planner-row ${item.completed ? 'completed' : ''}`} disabled={disabled} onClick={() => onToggle(item.id)} aria-pressed={item.completed}>
    <CheckMark done={item.completed}/>
    <span className="planner-row-body">
      <span className="planner-row-title">{item.title}</span>
      {item.description && <span className="planner-row-desc">{item.description}</span>}
    </span>
    <span className="planner-row-side">
      <span className="planner-tag" data-type={item.type}>{copy.types[item.type] || item.type}</span>
      {meta && <span className="planner-meta">{meta}</span>}
    </span>
  </button>;
}

function ReplanSheet({ copy, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [focus, setFocus] = useState('');
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const options = [
    ['too_much', copy.tooMuch], ['too_easy', copy.tooEasy], ['less_time', copy.lessTime],
    ['more_time', copy.moreTime], ['change_focus', copy.changeFocus], ['surprise_me', copy.surprise],
  ];
  return ReactDOM.createPortal(<div className="planner-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="planner-sheet" role="dialog" aria-modal="true" aria-label={copy.replanTitle}>
      <div className="planner-sheet-handle"/><h3>{copy.replanTitle}</h3>
      <ChoiceChips single selected={reason} onChange={setReason} values={options.map(([value, label]) => ({ value, label }))}/>
      {reason === 'change_focus' && <input className="planner-input planner-focus-input" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder={copy.focusInput} maxLength={240} autoFocus/>}
      <div className="planner-sheet-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>{copy.cancel}</button><button type="button" className="btn btn-primary" disabled={!reason || (reason === 'change_focus' && !focus.trim())} onClick={() => onSubmit(reason, focus)}>{copy.applyReplan}</button></div>
    </div>
  </div>, document.body);
}

function PlanReview({ plan, onSave, copy, disabled }) {
  const review = plan.review;
  const [editing, setEditing] = useState(false);
  const [feeling, setFeeling] = useState(review?.feeling || '');
  const [note, setNote] = useState(review?.note || '');
  if (review && !editing) {
    return <div className="planner-review done">
      <span className="planner-review-badge"><Icon.Check/> {copy.reviewed}</span>
      <span className="planner-review-summary">{copy.feelings[review.feeling]}{review.note ? ` · “${review.note}”` : ''}</span>
      <button type="button" className="planner-link" disabled={disabled} onClick={() => { setFeeling(review.feeling); setNote(review.note || ''); setEditing(true); }}>{copy.editReview}</button>
    </div>;
  }
  const save = async () => {
    if (await onSave({ feeling, note })) setEditing(false);
  };
  return <div className="planner-review">
    <div className="planner-review-head"><span className="planner-review-title">{copy.reviewTitle}</span><span>{copy.reviewPrompt}</span></div>
    <ChoiceChips single className="planner-seg" selected={feeling} onChange={setFeeling} values={REVIEW_FEELINGS.map((value) => ({ value, label: copy.feelings[value] }))}/>
    {feeling && <div className="planner-submit-row">
      <input className="planner-input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder={copy.reviewNote} aria-label={copy.reviewNote}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }}/>
      {editing && <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => setEditing(false)}>{copy.cancel}</button>}
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={save}>{copy.saveReview}</button>
    </div>}
    {feeling && <p className="planner-hint">{copy.reviewHint}</p>}
  </div>;
}

function TodayPlan({ row, collapsed, saving, persist, onReplan, copy }) {
  const plan = row.plan_json;
  const minimum = plan.activeMode === 'minimum';
  const { completed, total } = planProgress(plan);
  const main = minimum ? (plan.minimumDay?.items || []).find((item) => item.type === 'main') : plan.mainTask;
  const groups = minimum
    ? [['minimum', (plan.minimumDay?.items || []).filter((item) => item !== main)]]
    : orderedPlanSections(plan);
  const target = Math.max(1, Math.ceil(total * 2 / 3));
  const hint = completed >= total ? copy.allDone : (minimum ? copy.minimumProgress : copy.goodDay(target, total));
  const toggle = (id) => persist(togglePlanItem(plan, id));
  const switchMode = () => persist(setPlanMode(plan, minimum ? 'standard' : 'minimum'));
  const saveReview = (review) => persist(setPlanReview(plan, review));

  if (collapsed) {
    return <div className="planner-collapsed">
      {main && <PlanRow item={main} onToggle={toggle} copy={copy} disabled={saving}/>}
    </div>;
  }

  return <div className={`planner-pane planner-plan ${minimum ? 'minimum' : ''}`}>
    <p className="planner-message">{minimum ? (plan.minimumDay?.message || copy.minimumDefault) : plan.message}</p>
    <div className="planner-plan-grid">
      <div className="planner-focus-col">
        <FocusItem item={main} onToggle={toggle} copy={copy} disabled={saving}/>
        <div className="planner-progress">
          <div className="planner-progress-track"><span style={{ width: `${total ? completed / total * 100 : 0}%` }}/></div>
          <p>{hint}</p>
        </div>
        <div className="planner-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={switchMode}>{minimum ? copy.fuller : copy.easier}</button>
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onReplan}><Icon.Refresh/> {copy.replan}</button>
        </div>
      </div>
      <div className="planner-timeline">
        {groups.map(([part, items]) => items.length > 0 && <div className="planner-daypart" key={part}>
          <div className="planner-daypart-label">{part === 'minimum' ? copy.minimum : copy.dayparts[part]}</div>
          {items.map((item) => <PlanRow key={item.id} item={item} onToggle={toggle} copy={copy} disabled={saving}/>)}
        </div>)}
      </div>
      <PlanReview key={row.id} plan={plan} onSave={saveReview} copy={copy} disabled={saving}/>
    </div>
  </div>;
}

function AIPlanner() {
  const copy = COPY[getLocale()] || COPY.zh;
  const date = todayISO();
  const [status, setStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [row, setRow] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [lastInput, setLastInput] = useState(null);
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [replanOpen, setReplanOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const statusRef = useRef(status);
  const savingRef = useRef(false);
  const retryRef = useRef(null);
  statusRef.current = status;

  // quiet: refresh after an auth event without flashing the loading state.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setStatus('loading'); setError(''); }
    try {
      const state = await plannerState(date);
      if (statusRef.current === 'generating') return;
      if (!state.signedIn) { setStatus('signed_out'); setProfile(null); setRow(null); return; }
      setProfile(state.profile); setRow(state.plan); setPrevious(state.previous);
      setStatus(state.profile ? (state.plan ? 'plan' : 'checkin') : 'profile');
    } catch (err) {
      if (quiet) return;
      retryRef.current = () => load();
      setStatus('error'); setError(errorMessage(err, copy));
    }
  }, [copy, date]);

  useEffect(() => {
    load();
    const { data } = window.sbClient?.auth.onAuthStateChange((event) => {
      // Token refreshes fire hourly; only identity changes need a reload.
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) setTimeout(() => load({ quiet: true }), 0);
    }) || {};
    return () => data?.subscription?.unsubscribe();
  }, [load]);

  const toggleCollapsed = () => setCollapsed((value) => {
    try { localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1'); } catch {}
    return !value;
  });

  const run = async (path, payload) => {
    setStatus('generating'); setError(''); setSaveError('');
    statusRef.current = 'generating';
    try {
      const next = await callPlanner(path, { ...payload, date, lang: getLocale() });
      setRow(next); setStatus('plan');
      if (collapsed) toggleCollapsed();
    } catch (err) {
      retryRef.current = () => run(path, payload);
      setError(errorMessage(err, copy)); setStatus('error');
    }
  };
  const generate = (input) => { setLastInput(input); run('generate', input); };
  const replan = (reason, focus) => {
    const current = row.checkin || lastInput || { energy: 'normal', availableTime: 'half_day', dayStyle: 'balanced', mustDo: '' };
    const adjusted = { ...current };
    if (reason === 'too_much') { adjusted.energy = 'low'; adjusted.dayStyle = 'relaxed'; }
    if (reason === 'too_easy') { adjusted.energy = 'high'; adjusted.dayStyle = 'productive'; }
    if (reason === 'less_time') adjusted.availableTime = 'busy';
    if (reason === 'more_time') adjusted.availableTime = 'mostly_free';
    if (reason === 'change_focus') adjusted.mustDo = focus.trim();
    setReplanOpen(false);
    run('replan', { ...adjusted, reason });
  };

  // Optimistic save of plan_json; resolves true when persisted.
  const persist = async (next) => {
    if (savingRef.current || !row || next === row.plan_json) return false;
    const before = row;
    savingRef.current = true;
    setSaving(true); setSaveError('');
    setRow({ ...before, plan_json: next });
    try { setRow(await updateDailyPlan(before, next)); return true; }
    catch { setRow(before); setSaveError(copy.saveFailed); return false; }
    finally { savingRef.current = false; setSaving(false); }
  };

  const showPlan = status === 'plan' && row && !editingProfile;
  const progress = showPlan ? planProgress(row.plan_json) : null;
  const minimum = showPlan && row.plan_json.activeMode === 'minimum';

  const renderContent = () => {
    if (status === 'loading' || status === 'generating') return <LoadingPlanner copy={copy}/>;
    if (status === 'signed_out') return <div className="planner-signin"><p>{copy.signInSub}</p><button type="button" className="btn btn-primary" onClick={() => window.dispatchEvent(new Event('future:open-auth'))}>{copy.signIn}</button></div>;
    if (editingProfile || status === 'profile') {
      return <PlannerProfile initial={profile} copy={copy}
        onCancel={profile ? () => setEditingProfile(false) : null}
        onSaved={(saved) => { setProfile(saved); setEditingProfile(false); setStatus(row ? 'plan' : 'checkin'); }}/>;
    }
    if (status === 'checkin') return <DailyCheckin copy={copy} initial={lastInput} previous={previous} today={date} onGenerate={generate}/>;
    if (status === 'error') {
      return <div className="planner-failed" role="alert">
        <p>{error || copy.failedTitle}</p>
        <div className="planner-form-actions">
          {row && <button type="button" className="btn btn-ghost" onClick={() => setStatus('plan')}>{copy.backToPlan}</button>}
          <button type="button" className="btn btn-primary" onClick={() => (retryRef.current ? retryRef.current() : load())}>{copy.retry}</button>
        </div>
      </div>;
    }
    return <TodayPlan row={row} copy={copy} collapsed={collapsed} saving={saving} persist={persist} onReplan={() => setReplanOpen(true)}/>;
  };

  return <section className={`card ai-planner ${collapsed && showPlan ? 'is-collapsed' : ''}`} aria-label={copy.title}>
    <div className="card-header ai-planner-head">
      <div className="card-title"><Icon.Sparkle/> {copy.title}</div>
      {showPlan && <div className="ai-planner-head-side">
        {minimum && <span className="planner-mode-pill">{copy.minimum}</span>}
        <span className="card-meta planner-count">{progress.completed} / {progress.total}</span>
        {!collapsed && <button type="button" className="card-action" disabled={saving} onClick={() => setEditingProfile(true)}>{copy.editProfile}</button>}
        <button type="button" className="card-action planner-collapse" aria-expanded={!collapsed} aria-label={collapsed ? copy.expand : copy.collapse} title={collapsed ? copy.expand : copy.collapse} onClick={toggleCollapsed}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>}
    </div>
    {renderContent()}
    {saveError && <div className="planner-error" role="alert">{saveError}</div>}
    {replanOpen && <ReplanSheet copy={copy} onClose={() => setReplanOpen(false)} onSubmit={replan}/>}
  </section>;
}

export { AIPlanner };
