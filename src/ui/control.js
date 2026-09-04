import { PET_POSES, PET_POSE_ASSETS, PET_POSE_LABELS } from './pet-poses.js';
import { companionAnimationSrc } from './asset-paths.js';
import { createSuppressionController } from './suppression-controller.js';
import { formatNextReminderText } from './reminder-schedule.js';
import {
  beginDraftSave,
  cancelDraft,
  createDraftSession,
  draftSaveFailed,
  draftSaveSucceeded,
  hasDirtyDrafts,
  syncDraftSaved,
  updateDraft
} from './draft-session.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const api = window.pomopet || createBrowserBridge();
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const priorityLabels = { P0: 'P0 重要', P1: 'P1 今天', P2: 'P2 顺手' };
const supportedIntervals = new Set([15, 30, 45, 60, 90, 120]);
const sessions = { reminder: null, offwork: null, persona: null, settings: null, todoAdd: null, todo: null };
const saveEpochs = { reminder: 0, offwork: 0, persona: 0, settings: 0, todoAdd: 0, todo: 0 };
const editing = { offwork: false, settings: false };
const deleteConfirmations = new Map();
const suppressionController = createSuppressionController({ send: (source, active) => api.command('companion:suppress', { source, active }) });
let state;
let selectedPreset = '25/5';
let selectedAlarmId = null;
let reminderEditing = false;
let editingTodoId = null;
let breakChooserOpen = false;
let breakChoicesSignature = null;
let alarmListSignature = null;
let clockSkewMs = 0;
let voices = [];
let lastDirtyReport = null;
let aiTesting = false;
let customDurationDraft = null;
let customDurationSaveChain = Promise.resolve();
let lastQueuedCustomDuration = null;
let selectedReviewDate = null;

function createBrowserBridge() {
  const demo = {
    now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0, todoId: null }, todos: { items: [], activeId: null }, alarms: [],
    offwork: { enabled: true, workStart: '10:00', time: '18:30', latestTime: '22:30', exclusions: [{ start: '12:00', end: '14:00', label: '午休' }, { start: '18:00', end: '19:00', label: '晚餐' }], weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 10, escalateMinutes: 15 },
    persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' },
    settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: .75, interactions: true, companionEnabled: true, launchAtLogin: false, aiCopyEnabled: false, aiKeyConfigured: false, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', ttsVoiceName: '' },
    aiStatus: { status: 'builtin', sample: null, errorCode: null, checkedAt: null }
  };
  const listeners = [];
  const emit = () => listeners.forEach((callback) => callback(structuredClone(demo)));
  return {
    getState: async () => structuredClone(demo), onState: (callback) => { listeners.push(callback); return () => {}; }, onDiscardDrafts: () => () => {}, setDirty: () => {}, showControl: () => {},
    setAiKey: async (key) => { demo.settings.aiKeyConfigured = Boolean(String(key || '').trim()); },
    command: async (name, payload = {}) => {
      demo.now = Date.now();
      if (name === 'timer:start') { demo.timer = { ...demo.timer, status: 'running', task: String(payload.task || '').trim(), todoId: payload.todoId || null, remainingMs: payload.focusMinutes * 60_000, targetAt: demo.now + payload.focusMinutes * 60_000 }; }
      if (name === 'timer:updateTask') demo.timer.task = String(payload.task || '').trim();
      if (name === 'timer:pause') { demo.timer.remainingMs = Math.max(0, demo.timer.targetAt - demo.now); demo.timer.targetAt = null; demo.timer.status = 'paused'; }
      if (name === 'timer:resume') { demo.timer.targetAt = demo.now + demo.timer.remainingMs; demo.timer.status = 'running'; }
      if (name === 'todo:add') { const item = { id: `browser-todo-${demo.now}`, title: payload.title, priority: payload.priority, estimatePomos: Number(payload.estimatePomos) || 1, completedPomos: 0, spentMs: 0, done: false, createdAt: demo.now }; demo.todos.items.unshift(item); demo.todos.activeId = item.id; }
      if (name === 'todo:active') demo.todos.activeId = payload.id;
      if (name === 'todo:toggle') { const item = demo.todos.items.find((todo) => todo.id === payload.id); if (item) item.done = Boolean(payload.done); }
      if (name === 'todo:start') { const item = demo.todos.items.find((todo) => todo.id === payload.id && !todo.done); if (item) { demo.todos.activeId = item.id; demo.timer = { ...demo.timer, status: 'running', phase: 'focus', task: item.title, todoId: item.id, remainingMs: payload.focusMinutes * 60_000, targetAt: demo.now + payload.focusMinutes * 60_000 }; } }
      if (name === 'todo:update') { const item = demo.todos.items.find((todo) => todo.id === payload.id); if (item) Object.assign(item, payload.patch); }
      if (name === 'todo:remove') { demo.todos.items = demo.todos.items.filter((todo) => todo.id !== payload.id); if (demo.todos.activeId === payload.id) demo.todos.activeId = demo.todos.items[0]?.id || null; }
      if (name === 'alarm:add') demo.alarms.push({ ...payload, id: `browser-alarm-${demo.now}`, snoozes: [] });
      if (name === 'alarm:update') { const alarm = demo.alarms.find((item) => item.id === payload.id); if (alarm) Object.assign(alarm, payload.patch); }
      if (name === 'alarm:remove') demo.alarms = demo.alarms.filter((item) => item.id !== payload.id);
      if (name === 'alarm:enabled') { const alarm = demo.alarms.find((item) => item.id === payload.id); if (alarm) alarm.enabled = payload.enabled; }
      if (name === 'offwork:update') demo.offwork = { ...demo.offwork, ...payload };
      if (name === 'settings:update') demo.settings = { ...demo.settings, ...payload };
      if (name === 'persona:update') demo.persona = { ...demo.persona, ...payload };
      if (name === 'ai:test') demo.aiStatus = { status: demo.settings.aiCopyEnabled && demo.settings.aiKeyConfigured ? 'connected' : 'builtin', sample: demo.settings.aiCopyEnabled && demo.settings.aiKeyConfigured ? '今天也稳稳向前啦。' : null, errorCode: null, checkedAt: demo.now };
      emit();
      return structuredClone(demo);
    }
  };
}

const escapeHtml = (value) => { const span = document.createElement('span'); span.textContent = value ?? ''; return span.innerHTML; };
const escapeAttr = (value) => escapeHtml(value).replaceAll('"', '&quot;');
const format = (ms) => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
const displayRemaining = (timer) => timer.status === 'running' && timer.targetAt ? Math.max(0, timer.targetAt - (Date.now() - clockSkewMs)) : timer.remainingMs;
const dateInput = (timestamp) => {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const validTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
const activeTodo = () => state?.todos?.items?.find((todo) => todo.id === state.todos.activeId) || null;
const defaultPersona = () => ({ preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional', companionEnabled: true });
const personaDraft = (persona = {}, settings = {}) => ({ ...defaultPersona(), ...persona, companionEnabled: settings.companionEnabled !== false });
const settingsDraft = (settings = {}) => ({ voiceMode: settings.voiceMode || 'key', volume: Number(settings.volume ?? .75), ttsEngine: settings.ttsEngine || 'edge', edgeTtsVoice: settings.edgeTtsVoice || 'zh-CN-XiaoxiaoNeural', ttsVoiceName: settings.ttsVoiceName || '', aiCopyEnabled: Boolean(settings.aiCopyEnabled), aiKeyConfigured: Boolean(settings.aiKeyConfigured), aiApiKey: '', interactions: settings.interactions !== false, launchAtLogin: Boolean(settings.launchAtLogin) });
const offworkDraft = (offwork = {}) => ({ enabled: Boolean(offwork.enabled), workStart: offwork.workStart || '10:00', time: offwork.time || '18:30', latestTime: offwork.latestTime || '22:30', exclusions: structuredClone(offwork.exclusions || [{ start: '12:00', end: '14:00', label: '午休' }, { start: '18:00', end: '19:00', label: '晚餐' }]), weekdays: [...(offwork.weekdays || [1, 2, 3, 4, 5])], pose: offwork.pose || 'sleepy', blockMode: Boolean(offwork.blockMode), snoozeMinutes: Number(offwork.snoozeMinutes || 10), escalateMinutes: Number(offwork.escalateMinutes || 15) });
const blankReminder = () => ({ id: null, label: '', type: 'once', at: Date.now() + 3_600_000, time: '09:00', weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 30, pose: 'annoyed', enabled: true });
const reminderDraft = (alarm) => ({ ...blankReminder(), ...structuredClone(alarm || {}), weekdays: [...(alarm?.weekdays || [1, 2, 3, 4, 5])], pose: alarm?.pose === 'alarm' ? 'annoyed' : (alarm?.pose || 'annoyed') });
const todoDraft = (todo) => ({ id: todo.id, title: todo.title, priority: todo.priority || 'P1', estimatePomos: Number(todo.estimatePomos || 1) });
const blankTodoAdd = (choices = {}) => ({ title: '', priority: choices.priority || 'P1', estimatePomos: Number(choices.estimatePomos || 1) });

function reportDirty() {
  updateNavigationLock();
  const dirty = hasDirtyDrafts(sessions);
  if (dirty === lastDirtyReport) return;
  lastDirtyReport = dirty;
  api.setDirty?.(dirty);
  syncEditingSuppression();
}

function isAnySaving() {
  return Object.values(sessions).some((session) => session?.saving);
}

function updateNavigationLock() {
  const saving = isAnySaving();
  $$('.tabs [role="tab"]').forEach((tab) => { tab.disabled = saving; });
}

function setSession(name, session) {
  sessions[name] = session;
  updateNavigationLock();
  reportDirty();
  return session;
}

function editSession(name, patch) {
  if (!sessions[name] || sessions[name].saving) return;
  setSession(name, updateDraft(sessions[name], patch));
}

function startSessionSave(name) {
  const attempt = beginDraftSave(sessions[name]);
  if (!attempt.accepted) return null;
  const epoch = ++saveEpochs[name];
  setSession(name, attempt.session);
  return epoch;
}

function isCurrentSave(name, epoch) {
  return saveEpochs[name] === epoch && sessions[name]?.saving;
}

function resetAllDrafts() {
  for (const name of Object.keys(sessions)) {
    saveEpochs[name] += 1;
    if (sessions[name]) sessions[name] = cancelDraft(sessions[name]);
  }
  editingTodoId = null;
  sessions.todo = null;
  reminderEditing = false;
  editing.offwork = false;
  editing.settings = false;
  reportDirty();
  render(state);
}

function confirmDiscard() {
  if (isAnySaving()) return false;
  if (!hasDirtyDrafts(sessions)) return true;
  const discard = globalThis.confirm('有未保存修改。选择“确定”放弃修改，选择“取消”继续编辑。');
  if (discard) resetAllDrafts();
  return discard;
}

async function sendCommand(name, payload) {
  try {
    return await api.command(name, payload);
  } catch (error) {
    $('#timerHint').textContent = `末末刚才没接住这个指令：${error?.message || 'unknown_error'}`;
    throw error;
  }
}

async function command(name, payload) {
  const next = await sendCommand(name, payload);
  render(next);
  return next;
}

function initializeSessions(next) {
  sessions.offwork = sessions.offwork ? syncDraftSaved(sessions.offwork, offworkDraft(next.offwork)) : createDraftSession(offworkDraft(next.offwork));
  sessions.persona = sessions.persona ? syncDraftSaved(sessions.persona, personaDraft(next.persona, next.settings)) : createDraftSession(personaDraft(next.persona, next.settings));
  sessions.settings = sessions.settings ? syncDraftSaved(sessions.settings, settingsDraft(next.settings)) : createDraftSession(settingsDraft(next.settings));
  if (!sessions.todoAdd) sessions.todoAdd = createDraftSession(blankTodoAdd());
  if (!sessions.reminder) sessions.reminder = createDraftSession(blankReminder());
}

function render(next) {
  if (!next) return;
  state = next;
  state.todos ||= { items: [], activeId: null };
  state.alarms ||= [];
  state.settings ||= {};
  state.offwork ||= offworkDraft();
  state.persona ||= defaultPersona();
  state.aiStatus ||= { status: 'builtin', sample: null, errorCode: null };
  state.review ||= { days: [] };
  clockSkewMs = Date.now() - (state.now || Date.now());
  initializeSessions(state);
  const timer = state.timer;
  renderTimerClock();
  $('#todayCount').textContent = timer.todayCount || 0;
  const selectedTodo = activeTodo();
  if (document.activeElement !== $('#task')) $('#task').value = timer.task || selectedTodo?.title || '';
  $('#phase').textContent = timer.status === 'idle' || timer.status === 'stopped' ? '准备专注' : timer.phase === 'break' ? '休息一下' : timer.status === 'paused' ? '暂停中' : '末末陪你专注中';
  $('#mainAction').textContent = timer.status === 'paused' ? '继续' : timer.status === 'running' ? '暂停' : '开始专注';
  $('#complete').textContent = timer.phase === 'break' ? '结束休息' : '提前完成';
  $('#complete').classList.toggle('hidden', !['running', 'paused'].includes(timer.status));
  $('#stop').classList.toggle('hidden', !['running', 'paused'].includes(timer.status));
  selectedPreset = state.settings.preset || selectedPreset;
  $$('#presets button').forEach((button) => button.classList.toggle('selected', button.dataset.preset === selectedPreset));
  $('#customTime').classList.toggle('hidden', selectedPreset !== 'custom');
  const customValues = customDurationDraft || { focus: state.settings.customFocus || 25, rest: state.settings.customBreak || 5 };
  $('#focusMinutes').value = customValues.focus;
  $('#breakMinutes').value = customValues.rest;
  renderBreakContinuation();
  renderTodoAdd();
  renderTodos();
  renderReminders();
  renderOffwork();
  renderReview();
  renderPersona();
  renderSettings();
  reportDirty();
}

function renderTimerClock() {
  if (!state?.timer) return;
  const timer = state.timer;
  const preset = state.settings?.preset;
  const configuredFocus = preset === '50/10' ? 50 : preset === 'custom' ? Number(state.settings.customFocus) || 25 : 25;
  const remainingMs = ['idle', 'stopped'].includes(timer.status) ? configuredFocus * 60_000 : displayRemaining(timer);
  $('#clock').textContent = format(remainingMs);
  const totalMs = Number(timer.phase === 'break' ? timer.breakMs : timer.focusMs) || remainingMs;
  const progress = ['running', 'paused'].includes(timer.status) && totalMs > 0
    ? Math.round(Math.min(100, Math.max(0, (totalMs - remainingMs) / totalMs * 100)))
    : 0;
  const bar = $('#timerProgress');
  bar.setAttribute('aria-valuenow', String(progress));
  bar.querySelector('i').style.width = `${progress}%`;
  bar.dataset.phase = timer.phase === 'break' ? 'break' : 'focus';
}

function compactDuration(ms) {
  const minutes = Math.round((Number(ms) || 0) / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function shortDate(dayKey, index) {
  if (index === 0) return '今天';
  const date = new Date(`${dayKey}T12:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${weekdays[date.getDay()]}`;
}

function clockTime(timestamp) {
  return Number.isFinite(Number(timestamp))
    ? new Date(Number(timestamp)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--';
}

function reviewTimeline(day) {
  const rawStart = Number(day.rangeStartAt); const rawEnd = Number(day.rangeEndAt);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return '<p class="review-empty">这一天还没有形成可绘制的时间线。</p>';
  const axisStartDate = new Date(rawStart); axisStartDate.setMinutes(0, 0, 0);
  const axisEndDate = new Date(rawEnd); axisEndDate.setMinutes(0, 0, 0); if (axisEndDate.getTime() < rawEnd) axisEndDate.setHours(axisEndDate.getHours() + 1);
  const axisStart = axisStartDate.getTime(); const axisEnd = Math.max(axisStart + 3_600_000, axisEndDate.getTime()); const span = axisEnd - axisStart;
  const position = (timestamp) => Math.max(0, Math.min(100, (Number(timestamp) - axisStart) / span * 100));
  const totalHours = Math.max(1, Math.round(span / 3_600_000)); const hourStep = totalHours > 13 ? 2 : 1;
  const hours = [];
  for (let hour = 0; hour <= totalHours; hour += hourStep) {
    const timestamp = axisStart + hour * 3_600_000;
    hours.push(`<span style="left:${position(timestamp)}%">${new Date(timestamp).getHours()}</span>`);
  }
  const kindLabel = { focus: '专注', break: '休息', excluded: '固定休息', unrecorded: '未记录' };
  const segments = (day.timeline || []).map((item) => {
    const left = position(item.startedAt); const right = position(item.endedAt);
    const label = item.kind === 'focus' ? item.taskTitle || '未命名任务' : kindLabel[item.kind] || '未记录';
    return `<span class="review-timeline-segment kind-${escapeAttr(item.kind || 'unrecorded')}" style="left:${left}%;width:${Math.max(.7, right - left)}%" title="${escapeAttr(`${clockTime(item.startedAt)}–${clockTime(item.endedAt)} ${label}`)}">${escapeHtml(label)}</span>`;
  }).join('');
  const reminderEvents = day.reminderTimeline?.length
    ? day.reminderTimeline
    : Object.entries(day.reminderBuckets || {}).map(([time, count]) => ({ text: '健康提醒', firedAt: new Date(`${day.date}T${time}:00`).getTime(), count }));
  const reminderMarkers = reminderEvents.map((event) => {
    const reminder = event.text || '健康提醒';
    const marker = reminder.includes('水') ? '水' : /动|活动|运动|站/.test(reminder) ? '动' : '醒';
    return `<span class="review-reminder-marker" style="left:${position(event.firedAt)}%" title="${escapeAttr(`${clockTime(event.firedAt)} ${reminder}${event.count ? ` ${event.count} 次` : ''}`)}">${marker}</span>`;
  }).join('');
  return `<div class="review-timeline-axis">${hours.join('')}</div><div class="review-timeline-row"><strong>记录状态</strong><div class="review-timeline-track">${segments}</div></div><div class="review-timeline-row"><strong>健康节奏</strong><div class="review-timeline-track health-track">${reminderMarkers}</div></div>`;
}

function reviewSuggestions(day) {
  const suggestions = [];
  const focus = Number(day.totals?.focusMs) || 0; const tasks = day.tasks || [];
  if (tasks.length && focus) {
    const share = Math.round(tasks[0].ms / focus * 100);
    suggestions.push(`今天投入最多的是“${tasks[0].title}”，占有效专注约 ${share}%。最重要的事有被认真照顾到。`);
  } else suggestions.push('这一天还没有专注记录。需要回顾时，从最重要的一件事开始计时就够了。');
  if (day.extensionCount) suggestions.push(`下班后又延长了 ${day.extensionCount} 次。明天把最后一颗番茄放到计划下班前，收尾会轻松一点。`);
  else if ((day.totals?.breakMs || 0) < focus * .12 && focus) suggestions.push('专注很多，主动休息偏少。下一颗番茄结束后，让眼睛和肩膀先离开屏幕几分钟。');
  else if ((day.reminders || []).length) suggestions.push(`末末今天提醒了 ${(day.reminders || []).reduce((sum, item) => sum + item.count, 0)} 次，工作节奏里也记得给身体留位置。`);
  else suggestions.push('今天的工作边界挺清楚。继续让专注有终点，也让休息真的发生。');
  return suggestions.slice(0, 2);
}

function renderReview() {
  const days = state.review?.days || [];
  if (!days.some((day) => day.date === selectedReviewDate)) selectedReviewDate = days[0]?.date || null;
  $('#reviewDateSelect').innerHTML = days.map((day, index) => `<option value="${escapeAttr(day.date)}" ${day.date === selectedReviewDate ? 'selected' : ''}>${shortDate(day.date, index)} · ${compactDuration(day.totals?.focusMs)}</option>`).join('');
  $('#reviewDateSelect').onchange = (event) => { selectedReviewDate = event.target.value; renderReview(); };
  const day = days.find((item) => item.date === selectedReviewDate);
  if (!day) {
    $('#reviewSelectedDate').textContent = '时间花在哪里'; $('#reviewSummary').replaceChildren(); $('#reviewTimeline').innerHTML = '<p class="review-empty">开始一颗番茄后，这里会出现你的时间足迹。</p>'; $('#reviewTasks').replaceChildren(); $('#reviewInsights').replaceChildren(); $('#reviewReminderTotals').replaceChildren(); return;
  }
  const index = days.indexOf(day); const finalTime = day.actualOffworkAt ? clockTime(day.actualOffworkAt) : '尚未收工';
  $('#reviewSelectedDate').textContent = `${shortDate(day.date, index)} · 时间花在哪里`;
  $('#reviewSummary').innerHTML = `<div><span>有效专注</span><strong>${compactDuration(day.totals?.focusMs)}</strong><small>${day.counts?.natural || 0} 颗自然完成</small></div><div><span>休息与恢复</span><strong>${compactDuration(day.totals?.breakMs)}</strong><small>${day.restTimeWorkMs ? `休息时段工作 ${compactDuration(day.restTimeWorkMs)}` : '节奏由你主动记录'}</small></div><div><span>最终收工</span><strong>${finalTime}</strong><small>${day.extensionCount ? `延长 ${day.extensionCount} 次` : '没有继续延长'}</small></div><div><span>未记录空档</span><strong>${compactDuration(day.totals?.unrecordedMs)}</strong><small>不用记录所有琐事</small></div>`;
  $('#reviewRangeLabel').textContent = `${clockTime(day.rangeStartAt)}–${clockTime(day.rangeEndAt)}`;
  $('#reviewTimeline').innerHTML = reviewTimeline(day);
  $('#reviewReminderTotals').innerHTML = (day.reminders || []).map((item) => `<span>${escapeHtml(item.text)} <b>${item.count}</b> 次</span>`).join('') || '<span>暂无健康提醒</span>';
  const tasks = day.tasks || []; const maximum = Math.max(1, ...tasks.map((task) => task.ms || 0));
  $('#reviewTasks').innerHTML = tasks.map((task, taskIndex) => `<div class="review-task-row"><span title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</span><div><i style="width:${Math.max(3, Math.round((task.ms || 0) / maximum * 100))}%;--task-color:var(--review-task-${taskIndex % 4})"></i></div><b>${compactDuration(task.ms)}</b></div>`).join('') || '<p class="review-empty">这一天暂无专注任务。</p>';
  const suggestions = reviewSuggestions(day);
  $('#reviewInsights').innerHTML = `<h3>末末只说两件有用的事</h3>${suggestions.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}`;
}

function renderBreakContinuation() {
  const continuation = state.breakContinuation;
  $('#breakContinuation').classList.toggle('hidden', !continuation);
  if (!continuation) { breakChooserOpen = false; breakChoicesSignature = null; $('#breakChooser').replaceChildren(); $('#breakChooser').classList.add('hidden'); $('#breakContinuationChoose').setAttribute('aria-expanded', 'false'); return; }
  $('#breakContinuationPrimary').textContent = continuation.canContinue ? '继续刚才的任务' : continuation.recommendedTodoId ? '开始推荐任务' : '添加下一件事';
  $('#breakContinuationChoose').classList.toggle('hidden', !continuation.actions.choose);
  if (!continuation.actions.choose) breakChooserOpen = false;
  $('#breakContinuationChoose').setAttribute('aria-expanded', String(breakChooserOpen));
  const chooser = $('#breakChooser');
  const choices = continuation.choices || [];
  const signature = JSON.stringify(choices.map(({ id, title, priority }) => ({ id, title, priority })));
  if (signature !== breakChoicesSignature) {
    const focusedId = chooser.contains(document.activeElement) ? document.activeElement.dataset.todoId : null;
    chooser.innerHTML = choices.map((todo) => `<button type="button" data-todo-id="${escapeAttr(todo.id)}">${escapeHtml(todo.title)}</button>`).join('');
    breakChoicesSignature = signature;
    $$('#breakChooser [data-todo-id]').forEach((button) => { button.onclick = () => command('break:switch', { todoId: button.dataset.todoId }); });
    if (breakChooserOpen) globalThis.requestAnimationFrame(() => ($$('#breakChooser [data-todo-id]').find((button) => button.dataset.todoId === focusedId) || $('#breakChooser button') || $('#breakContinuationChoose')).focus());
  }
  chooser.classList.toggle('hidden', !breakChooserOpen || !continuation.actions.choose);
}

function spentText(ms) { const minutes = Math.round((Number(ms) || 0) / 60_000); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`; }

function renderTodoAdd() {
  const session = sessions.todoAdd;
  const saving = Boolean(session.saving || sessions.todo?.saving);
  $('#todoTitle').value = session.draft.title;
  $('#todoPriority').value = session.draft.priority;
  $('#todoEstimate').value = session.draft.estimatePomos;
  $('#todoAddError').textContent = session.error || '';
  $('#todoForm').setAttribute('aria-busy', String(saving));
  $('#todoForm').classList.toggle('is-saving', saving);
  $$('#todoForm input, #todoForm select, #todoForm button').forEach((control) => { control.disabled = saving; });
}

function renderTodoPanel() {
  renderTodoAdd();
  renderTodos();
}

function todoRowMarkup(todo, isEditing, listLocked) {
  const row = isEditing && sessions.todo ? sessions.todo.draft : todo;
  const classes = ['todo-item', isEditing ? 'editing' : '', todo.id === state.todos.activeId ? 'active' : '', todo.done ? 'done' : '', isEditing && sessions.todo?.saving ? 'is-saving' : ''].filter(Boolean).join(' ');
  const disabled = listLocked ? 'disabled' : '';
  if (isEditing) return `<article class="${classes}" data-id="${escapeAttr(todo.id)}" aria-busy="${sessions.todo.saving}"><input class="todo-done" type="checkbox" ${todo.done ? 'checked' : ''} ${disabled} aria-label="完成 ${escapeAttr(todo.title)}"><div class="todo-edit-fields"><input class="todo-title-input" value="${escapeAttr(row.title)}" ${disabled} aria-label="事项"><div class="todo-edit-meta"><select class="todo-priority" ${disabled} aria-label="优先级">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${row.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select><label><input class="todo-estimate" type="number" min="1" max="12" value="${row.estimatePomos}" ${disabled} aria-label="预估番茄"> 颗番茄</label></div><p class="form-error todo-error">${escapeHtml(sessions.todo.error || '')}</p></div><div class="todo-edit-actions"><button class="todo-save" type="button" ${disabled}>保存</button><button class="todo-cancel" type="button" ${disabled}>取消</button></div></article>`;
  const progress = Math.min(100, Math.round(Number(todo.completedPomos || 0) / Math.max(1, Number(todo.estimatePomos || 1)) * 100));
  const confirming = (deleteConfirmations.get(todo.id) || 0) > Date.now();
  const startDisabled = listLocked || !['idle', 'stopped'].includes(state.timer.status) ? 'disabled' : '';
  const startButton = todo.done ? '' : `<button class="todo-start" type="button" ${startDisabled} aria-label="开始专注 ${escapeAttr(todo.title)}" title="开始专注">▶</button>`;
  return `<article class="${classes}" data-id="${escapeAttr(todo.id)}"><input class="todo-done" type="checkbox" ${todo.done ? 'checked' : ''} ${disabled} aria-label="完成 ${escapeAttr(todo.title)}"><div class="todo-content"><strong class="todo-title">${escapeHtml(todo.title)}</strong><div class="todo-meta"><small class="todo-progress">${todo.completedPomos || 0}/${todo.estimatePomos} 番茄 · ${spentText(todo.spentMs)}</small><span class="todo-meter" aria-hidden="true"><i style="width:${progress}%"></i></span></div></div><span class="todo-priority-pill priority-${String(todo.priority).toLowerCase()}">${priorityLabels[todo.priority]}</span><div class="todo-row-actions">${startButton}<button class="todo-edit" type="button" ${disabled} aria-label="编辑 ${escapeAttr(todo.title)}" title="编辑">✎</button><button class="todo-remove" type="button" ${disabled} aria-label="删除 ${escapeAttr(todo.title)}" title="${confirming ? '再次点击确认删除' : '删除'}" data-confirming="${confirming}">${confirming ? '删' : '×'}</button></div></article>`;
}

function todoRowSignature(todo, isEditing, listLocked) {
  if (isEditing) return JSON.stringify({ id: todo.id, editing: true, saving: sessions.todo?.saving, error: sessions.todo?.error, listLocked });
  return JSON.stringify({ ...todo, active: todo.id === state.todos.activeId, confirming: (deleteConfirmations.get(todo.id) || 0) > Date.now(), listLocked, timerStatus: state.timer.status });
}

function createTodoRow(todo, isEditing, listLocked, signature) {
  const template = document.createElement('template');
  template.innerHTML = todoRowMarkup(todo, isEditing, listLocked);
  const row = template.content.firstElementChild;
  row.dataset.renderSignature = signature;
  bindTodoRow(row);
  return row;
}

function renderTodos() {
  const items = state.todos.items || [];
  if (editingTodoId && !items.some((todo) => todo.id === editingTodoId)) { editingTodoId = null; sessions.todo = null; }
  const doneCount = items.filter((todo) => todo.done).length;
  const planned = items.reduce((sum, todo) => sum + Number(todo.estimatePomos || 0), 0);
  const actual = items.reduce((sum, todo) => sum + Number(todo.completedPomos || 0), 0);
  $('#todoStats').textContent = items.length ? `完成 ${doneCount}/${items.length} · 计划 ${planned} 番茄 · 已用 ${actual} 番茄` : '先列 3 件最重要的事';
  const list = $('#todoList');
  if (!items.length) { if (!list.querySelector('.empty')) list.innerHTML = '<div class="empty compact">把今天真正要推进的事写下来。</div>'; return; }
  list.querySelector('.empty')?.remove();
  const listLocked = Boolean(sessions.todo?.saving || sessions.todoAdd?.saving);
  const retained = new Set();
  items.forEach((todo, index) => {
    const isEditing = todo.id === editingTodoId;
    const signature = todoRowSignature(todo, isEditing, listLocked);
    let row = [...list.children].find((child) => child.dataset.id === todo.id);
    if (!row || row.dataset.renderSignature !== signature) {
      const replacement = createTodoRow(todo, isEditing, listLocked, signature);
      if (row) row.replaceWith(replacement); else list.append(replacement);
      row = replacement;
    }
    retained.add(row);
    const position = list.children[index];
    if (position !== row) list.insertBefore(row, position || null);
  });
  [...list.children].forEach((row) => { if (!retained.has(row)) row.remove(); });
}

function bindTodoRow(row) {
    const id = row.dataset.id;
    row.onclick = (event) => { if (!sessions.todo?.saving && !sessions.todoAdd?.saving && !event.target.matches('input, select, button')) command('todo:active', { id }); };
    row.querySelector('.todo-done').onchange = (event) => command('todo:toggle', { id, done: event.currentTarget.checked });
    row.querySelector('.todo-start')?.addEventListener('click', async () => {
      if (selectedPreset === 'custom' && !await saveCustomDurations()) return;
      const [focusMinutes, breakMinutes] = selectedDurations();
      await command('todo:start', { id, focusMinutes, breakMinutes });
    });
    row.querySelector('.todo-edit')?.addEventListener('click', () => {
      if (!confirmDiscard()) return;
      const todo = state.todos.items.find((item) => item.id === id);
      editingTodoId = id; sessions.todo = createDraftSession(todoDraft(todo)); reportDirty(); renderTodos();
      $('.todo-title-input')?.focus();
    });
    row.querySelector('.todo-title-input')?.addEventListener('input', (event) => editSession('todo', { title: event.target.value }));
    row.querySelector('.todo-priority')?.addEventListener('change', (event) => editSession('todo', { priority: event.target.value }));
    row.querySelector('.todo-estimate')?.addEventListener('input', (event) => editSession('todo', { estimatePomos: Number(event.target.value) || 1 }));
    row.querySelector('.todo-save')?.addEventListener('click', async () => {
      if (sessions.todoAdd?.saving) return;
      const draft = sessions.todo?.draft;
      if (!draft?.title.trim()) { setSession('todo', draftSaveFailed(sessions.todo, '请输入事项')); renderTodos(); return; }
      const epoch = startSessionSave('todo'); if (epoch == null) return; renderTodoPanel();
      try { const next = await sendCommand('todo:update', { id, patch: { title: draft.title.trim(), priority: draft.priority, estimatePomos: draft.estimatePomos } }); if (!isCurrentSave('todo', epoch)) return; sessions.todo = draftSaveSucceeded(sessions.todo); editingTodoId = null; sessions.todo = null; reportDirty(); render(next); }
      catch { if (!isCurrentSave('todo', epoch)) return; setSession('todo', draftSaveFailed(sessions.todo, '保存失败，请重试')); renderTodoPanel(); }
    });
    row.querySelector('.todo-cancel')?.addEventListener('click', () => { sessions.todo = sessions.todo ? cancelDraft(sessions.todo) : null; editingTodoId = null; sessions.todo = null; reportDirty(); renderTodos(); });
    row.querySelector('.todo-remove')?.addEventListener('click', async () => {
      const expiresAt = deleteConfirmations.get(id) || 0;
      if (expiresAt <= Date.now()) { deleteConfirmations.set(id, Date.now() + 2_200); renderTodos(); setTimeout(() => { if ((deleteConfirmations.get(id) || 0) <= Date.now()) { deleteConfirmations.delete(id); renderTodos(); } }, 2_220); return; }
      deleteConfirmations.delete(id); await command('todo:remove', { id });
    });
}

function alarmRule(alarm) {
  if (alarm.type === 'once') return new Date(alarm.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const days = alarm.weekdays?.length === 5 && [1, 2, 3, 4, 5].every((day) => alarm.weekdays.includes(day)) ? '工作日' : (alarm.weekdays || []).map((day) => `周${weekdays[day]}`).join('、');
  return alarm.type === 'interval' ? `${days} · ${alarm.startTime}–${alarm.endTime} · 每 ${alarm.intervalMinutes} 分钟` : `${days} · ${alarm.time}`;
}

function renderReminders() {
  $('#alarmCount').textContent = `${state.alarms.filter((alarm) => alarm.enabled).length} 个计划运行中`;
  const copyMode = state.settings.aiCopyEnabled && state.settings.aiKeyConfigured ? 'AI 文案' : '内置文案';
  const markup = state.alarms.length ? state.alarms.map((alarm) => {
    const pose = alarm.pose === 'alarm' ? 'annoyed' : (alarm.pose || 'annoyed');
    const poseSrc = companionAnimationSrc(PET_POSE_ASSETS[pose] || 'annoyed');
    return `<article class="alarm-item ${alarm.id === selectedAlarmId ? 'selected' : ''}" data-id="${escapeAttr(alarm.id)}"><img class="alarm-pose" src="${escapeAttr(poseSrc)}" alt="${escapeAttr(PET_POSE_LABELS[pose] || '提醒动作')}"><div class="alarm-meta"><strong>${escapeHtml(alarm.label)}</strong><small>${escapeHtml(alarmRule(alarm))}</small><span>${escapeHtml(formatNextReminderText(alarm, state.now || Date.now()))} · ${escapeHtml(PET_POSE_LABELS[pose] || '提醒动作')} · ${copyMode}</span></div><label class="alarm-status"><input class="alarm-enabled" type="checkbox" ${alarm.enabled ? 'checked' : ''} aria-label="${alarm.enabled ? '停用' : '启用'} ${escapeAttr(alarm.label)}"><span>${alarm.enabled ? '运行中' : '已暂停'}</span></label><div class="alarm-tools"><button class="alarm-edit" type="button" aria-label="编辑 ${escapeAttr(alarm.label)}" title="编辑">✎</button><button class="alarm-delete" type="button" aria-label="删除 ${escapeAttr(alarm.label)}" title="删除">×</button></div><time class="alarm-time">${escapeHtml(alarm.type === 'interval' ? alarm.startTime : alarm.type === 'weekly' ? alarm.time : new Date(alarm.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }))}</time></article>`;
  }).join('') : '<div class="empty">还没有提醒计划。可以从右侧新建，或直接使用模板。</div>';
  if (markup !== alarmListSignature) {
    $('#alarmList').innerHTML = markup;
    alarmListSignature = markup;
    $$('#alarmList .alarm-item').forEach((row) => {
      const alarm = state.alarms.find((item) => item.id === row.dataset.id);
      row.querySelector('.alarm-edit').onclick = () => openReminder(alarm);
      row.querySelector('.alarm-delete').onclick = async () => { if (!confirmDiscard()) return; await command('alarm:remove', { id: alarm.id }); if (selectedAlarmId === alarm.id) openReminder(); };
      row.querySelector('.alarm-enabled').onchange = async (event) => { if (!confirmDiscard()) { event.target.checked = alarm.enabled; return; } await command('alarm:enabled', { id: alarm.id, enabled: event.target.checked }); };
    });
  }
  setReminderListSaving(sessions.reminder.saving);
  renderReminderEditor();
}

function setReminderListSaving(saving) {
  $$('#alarmList input, #alarmList button, #newAlarm, [data-template]').forEach((control) => {
    if (control.disabled !== Boolean(saving)) control.disabled = Boolean(saving);
  });
}

function renderDays(selector, selected) {
  const root = $(selector);
  root.innerHTML = weekdays.map((label, day) => `<button type="button" data-day="${day}" class="${selected.includes(day) ? 'on' : ''}" aria-pressed="${selected.includes(day)}">${label}</button>`).join('');
  root.querySelectorAll('button').forEach((button) => { button.disabled = sessions.reminder.saving; button.onclick = () => {
    const day = Number(button.dataset.day); const days = sessions.reminder.draft.weekdays;
    editSession('reminder', { weekdays: days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort() });
    renderReminderEditor();
  }; });
}

function renderReminderEditor() {
  const session = sessions.reminder;
  const draft = session.draft;
  $('#alarmEditorTitle').textContent = draft.id ? `编辑${draft.label || '提醒'}` : '新建提醒';
  $('#alarmDraftState').textContent = session.saving ? '保存中…' : session.dirty ? '有未保存修改' : '草稿受保护';
  $('#alarmLabel').value = draft.label;
  $('#alarmWhen').value = dateInput(draft.at);
  $('#alarmTime').value = draft.time ?? '';
  $('#alarmStartTime').value = draft.startTime ?? '';
  $('#alarmEndTime').value = draft.endTime ?? '';
  $('#alarmInterval').value = String(draft.intervalMinutes || 30);
  $('#alarmPose').value = draft.pose;
  $$('[data-alarm-type]').forEach((button) => button.classList.toggle('active', button.dataset.alarmType === draft.type));
  $$('[data-fields]').forEach((group) => group.classList.toggle('hidden', group.dataset.fields !== draft.type));
  renderDays('#alarmDays', draft.weekdays);
  renderDays('#alarmIntervalDays', draft.weekdays);
  const days = draft.weekdays.length === 5 && [1, 2, 3, 4, 5].every((day) => draft.weekdays.includes(day)) ? '工作日' : draft.weekdays.map((day) => `周${weekdays[day]}`).join('、');
  const incompleteTime = draft.type === 'once'
    ? !Number.isFinite(draft.at)
    : draft.type === 'weekly' ? !validTime(draft.time) : !validTime(draft.startTime) || !validTime(draft.endTime);
  $('#alarmSchedulePreview').innerHTML = incompleteTime
    ? '<strong>预计提醒</strong><br>请补全时间'
    : draft.type === 'interval' ? `<strong>预计提醒</strong><br>${escapeHtml(days || '未选择日期')} ${escapeHtml(draft.startTime)} 起，每 ${draft.intervalMinutes} 分钟提醒一次；不晚于 ${escapeHtml(draft.endTime)}。` : draft.type === 'weekly' ? `<strong>预计提醒</strong><br>${escapeHtml(days || '未选择日期')} ${escapeHtml(draft.time)} 提醒。` : `<strong>预计提醒</strong><br>${escapeHtml(new Date(draft.at).toLocaleString('zh-CN'))} 提醒一次。`;
  $('#alarmError').textContent = session.error || (incompleteTime ? '请补全时间' : '');
  $('#alarmForm').setAttribute('aria-busy', String(session.saving));
  $('#alarmForm').classList.toggle('is-saving', session.saving);
  $$('#alarmForm input, #alarmForm select, #alarmForm button, #alarmForm textarea').forEach((control) => {
    if (control.disabled !== Boolean(session.saving)) control.disabled = Boolean(session.saving);
  });
  setReminderListSaving(session.saving);
}

function openReminder(alarm = null) {
  if (!confirmDiscard()) return;
  reminderEditing = true;
  selectedAlarmId = alarm?.id || null;
  sessions.reminder = createDraftSession(reminderDraft(alarm));
  reportDirty(); syncEditingSuppression(); renderReminders(); $('#alarmLabel').focus();
}

function applyTemplate(kind) {
  if (!confirmDiscard()) return;
  reminderEditing = true;
  const template = kind === 'water'
    ? { ...blankReminder(), label: '喝水提醒', type: 'interval', weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 30, pose: 'water' }
    : { ...blankReminder(), label: '起来活动活动', type: 'interval', weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', intervalMinutes: 60, pose: 'comfort' };
  selectedAlarmId = null;
  sessions.reminder = updateDraft(createDraftSession(blankReminder()), template);
  reportDirty(); syncEditingSuppression(); renderReminders();
}

function validateReminder(draft) {
  if (!draft.label.trim()) return '请输入提醒内容';
  if (draft.type === 'once' && !Number.isFinite(draft.at)) return '请补全时间';
  if (draft.type === 'once' && draft.at <= Date.now()) return '请选择未来的提醒时间';
  if (draft.type !== 'once' && !draft.weekdays.length) return '请至少选择一天';
  if (draft.type === 'weekly' && !validTime(draft.time)) return '请补全时间';
  if (draft.type === 'interval') {
    if (!validTime(draft.startTime) || !validTime(draft.endTime)) return '请补全时间';
    if (draft.startTime >= draft.endTime) return '开始时间要早于结束时间';
    if (!supportedIntervals.has(Number(draft.intervalMinutes))) return '请选择支持的提醒间隔';
  }
  return null;
}

function alarmPayload(draft) {
  return { label: draft.label.trim(), type: draft.type, pose: draft.pose, at: draft.type === 'once' ? draft.at : null, time: draft.type === 'weekly' ? draft.time : null, weekdays: draft.type === 'once' ? [] : [...draft.weekdays], startTime: draft.type === 'interval' ? draft.startTime : null, endTime: draft.type === 'interval' ? draft.endTime : null, intervalMinutes: draft.type === 'interval' ? Number(draft.intervalMinutes) : null };
}

function renderOffwork() {
  const draft = sessions.offwork.draft;
  const exclusions = draft.exclusions || [];
  $('#offworkEnabled').checked = draft.enabled; $('#workStart').value = draft.workStart; $('#offworkTime').value = draft.time; $('#latestOffworkTime').value = draft.latestTime; $('#offworkPose').value = draft.pose; $('#offworkBlockMode').checked = draft.blockMode; $('#escalateMinutes').value = draft.escalateMinutes; $('#offworkSnooze').value = draft.snoozeMinutes;
  $('#lunchStart').value = exclusions[0]?.start || '12:00'; $('#lunchEnd').value = exclusions[0]?.end || '14:00'; $('#dinnerStart').value = exclusions[1]?.start || '18:00'; $('#dinnerEnd').value = exclusions[1]?.end || '19:00';
  $('#offworkDays').innerHTML = weekdays.map((label, day) => `<button type="button" data-day="${day}" class="${draft.weekdays.includes(day) ? 'on' : ''}" ${editing.offwork ? '' : 'disabled'}>${label}</button>`).join('');
  $('#offworkDays').querySelectorAll('button').forEach((button) => button.onclick = () => { const day = Number(button.dataset.day); editSession('offwork', { weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day].sort() }); renderOffwork(); });
  $('#offworkError').textContent = sessions.offwork.error || '';
  setPanelEditing('offwork', editing.offwork);
  $$('#offworkPanel .exclusion-settings input').forEach((control) => { control.disabled = !editing.offwork || sessions.offwork.saving; });
  setSavingState($('#offworkPanel'), sessions.offwork.saving);
}

function personaLines(persona) {
  const pet = persona.petName || '末末'; const owner = persona.ownerName || '主人';
  return {
    gentle: [`${owner}，陪${pet}喝几口水吧。你照顾好自己，我才放心。`, '起来走一小圈吧，我想陪你把肩膀上的疲惫轻轻抖掉。', `不用每一分钟都有成果。${pet}会安静陪着你。`],
    witty: ['你再不喝水，杯子都要以为自己只是摆件了。来，给它一点职业尊严。', '椅子已经拥有你一小时了，该办离职交接了。起来走两步。', `${owner}忙得很像回事，${pet}来检查你有没有偷累。`],
    clever: ['大侠先饮三口水再赶路。江湖事急，照顾你这件事更急。', '肩膀都快练成铁布衫了。起来陪我走一圈，回来再闯这一关。', `${pet}替${owner}望风。累了便退回来歇一歇。`],
    sunny: ['喝水任务发布！完成后奖励末末牌超大声夸夸一次。', '起身活动两分钟！你负责伸懒腰，我负责宣布状态满格。', `${owner}今天也在认真向前，${pet}必须来夸一下！`]
  }[persona.preset] || [];
}

function renderPersona() {
  const draft = sessions.persona.draft;
  const saving = sessions.persona.saving;
  $$('#personaPanel input, #personaPanel select, #personaPanel textarea, #personaPanel [data-persona]').forEach((control) => { control.disabled = saving; });
  $$('.persona-options [data-persona]').forEach((button) => button.classList.toggle('active', button.dataset.persona === draft.preset));
  $('#petName').value = draft.petName; $('#ownerName').value = draft.ownerName; $('#customPrompt').value = draft.customPrompt; $('#teaseLevel').value = draft.teaseLevel; $('#teaseOutput').textContent = `${draft.teaseLevel}%`; $('#companionEnabled').checked = draft.companionEnabled; $('#chatFrequency').value = draft.chatFrequency; $('#chatFrequency').disabled = saving || !draft.companionEnabled;
  const lines = personaLines(draft); $('#personaWaterLine').textContent = lines[0]; $('#personaMoveLine').textContent = lines[1]; $('#personaChatLine').textContent = lines[2];
  $('#personaError').textContent = sessions.persona.error || ''; $('#savePersona').disabled = saving || !sessions.persona.dirty;
  $('#cancelPersona').disabled = saving || !sessions.persona.dirty;
  setSavingState($('#personaPanel'), saving);
}

function refreshVoiceOptions() {
  voices = globalThis.speechSynthesis?.getVoices?.() || [];
  const select = $('#ttsVoiceName'); const current = sessions.settings?.draft.ttsVoiceName || '';
  const preferred = voices.filter((voice) => /^zh|Chinese|Mandarin|Cantonese|Tingting|Sin-ji|Mei-Jia|Yu-shu/i.test(`${voice.lang} ${voice.name}`));
  const ordered = [...preferred, ...voices.filter((voice) => !preferred.includes(voice))].slice(0, 40);
  select.innerHTML = '<option value="">系统默认</option>' + ordered.map((voice) => `<option value="${escapeAttr(voice.name)}">${escapeHtml(`${voice.name} · ${voice.lang}`)}</option>`).join('');
  select.value = ordered.some((voice) => voice.name === current) ? current : '';
}

function renderSettings() {
  const draft = sessions.settings.draft;
  $('#voiceMode').value = draft.voiceMode; $('#volume').value = draft.volume; $('#volumeOutput').textContent = `${Math.round(draft.volume * 100)}%`; $('#ttsEngine').value = draft.ttsEngine; $('#edgeTtsVoice').value = draft.edgeTtsVoice; $('#ttsVoiceName').value = draft.ttsVoiceName; $('#aiCopyEnabled').checked = draft.aiCopyEnabled; $('#aiApiKey').value = draft.aiApiKey || ''; $('#interactions').checked = draft.interactions; $('#launchAtLogin').checked = draft.launchAtLogin;
  const status = state.aiStatus || { status: 'builtin' };
  $('#aiStatus').textContent = status.status === 'connected' ? 'AI 已连接' : status.status === 'failed' ? 'AI 连接失败' : '使用内置文案';
  $('#aiKeyStatus').textContent = draft.aiKeyConfigured ? '已配置本机密钥' : '尚未配置密钥';
  $('#aiTestSample').textContent = status.sample || (status.errorCode ? `失败原因：${status.errorCode}` : '');
  $('#settingsError').textContent = sessions.settings.error || '';
  setPanelEditing('settings', editing.settings);
  setSavingState($('#settingsPanel'), sessions.settings.saving);
  $('#testAi').disabled = Boolean(editing.settings || sessions.settings.saving || aiTesting);
}

function setSavingState(root, saving) {
  root.setAttribute('aria-busy', String(saving));
  root.classList.toggle('is-saving', saving);
  if (saving) root.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = true; });
}

function setPanelEditing(panel, enabled) {
  const root = $(`#${panel}Panel`); root.classList.toggle('editing', enabled);
  const saving = sessions[panel].saving;
  root.querySelectorAll('.settings-grid input, .settings-grid select').forEach((control) => { control.disabled = !enabled || saving; });
  const cap = panel === 'offwork' ? 'Offwork' : 'Settings';
  $(`#edit${cap}`).classList.toggle('hidden', enabled); $(`#cancel${cap}`).classList.toggle('hidden', !enabled); $(`#edit${cap}`).disabled = saving; $(`#cancel${cap}`).disabled = saving; $(`#save${cap}`).disabled = !enabled || saving;
}

function startEditing(panel) { editing[panel] = true; if (panel === 'offwork') renderOffwork(); else renderSettings(); syncEditingSuppression(); }
function cancelEditing(panel) { sessions[panel] = cancelDraft(sessions[panel]); editing[panel] = false; reportDirty(); if (panel === 'offwork') renderOffwork(); else renderSettings(); }
function syncEditingSuppression() { void suppressionController.setDesired('editing', Boolean(editing.offwork || editing.settings || editingTodoId || reminderEditing || sessions.persona?.dirty)); }
function isTypingControl(element) { const nonTyping = ['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit']; return element instanceof HTMLInputElement && !nonTyping.includes(element.type) || element?.tagName === 'TEXTAREA' || element instanceof HTMLElement && element.isContentEditable; }

$('#alarmPose').innerHTML = PET_POSES.map(({ value, label }) => `<option value="${value}">${label}</option>`).join('');
const selectedDurations = () => selectedPreset === '50/10' ? [50, 10] : selectedPreset === 'custom' ? [Number($('#focusMinutes').value), Number($('#breakMinutes').value)] : [25, 5];
const readCustomDurations = () => {
  const focus = Number($('#focusMinutes').value); const rest = Number($('#breakMinutes').value);
  const focusValid = Number.isInteger(focus) && focus >= 1 && focus <= 180;
  const restValid = Number.isInteger(rest) && rest >= 1 && rest <= 60;
  $('#focusMinutes').setAttribute('aria-invalid', String(!focusValid));
  $('#breakMinutes').setAttribute('aria-invalid', String(!restValid));
  if (!focusValid || !restValid) {
    $('#timerHint').textContent = '专注时间请输入 1–180 分钟，休息时间请输入 1–60 分钟。';
    return null;
  }
  return [focus, rest];
};
const rememberCustomDurationDraft = () => {
  customDurationDraft = { focus: $('#focusMinutes').value, rest: $('#breakMinutes').value };
};
const saveCustomDurations = () => {
  const durations = readCustomDurations();
  if (!durations) return Promise.resolve(null);
  const [customFocus, customBreak] = durations;
  const signature = `${customFocus}/${customBreak}`;
  if (signature === lastQueuedCustomDuration) return customDurationSaveChain;
  lastQueuedCustomDuration = signature;
  customDurationSaveChain = customDurationSaveChain.catch(() => null).then(async () => {
    try {
      const next = await sendCommand('settings:update', { preset: 'custom', customFocus, customBreak });
      if (`${customDurationDraft?.focus}/${customDurationDraft?.rest}` === signature) customDurationDraft = null;
      render(next);
      return next;
    } catch {
      if (lastQueuedCustomDuration === signature) lastQueuedCustomDuration = null;
      $('#timerHint').textContent = '自定义时间保存失败，请再试一次。';
      return null;
    }
  });
  return customDurationSaveChain;
};
$('#mainAction').onclick = async () => { const timer = state.timer; if (timer.status === 'running') return command('timer:pause'); if (timer.status === 'paused') return command('timer:resume'); if (selectedPreset === 'custom' && !await saveCustomDurations()) return; const preset = selectedDurations(); const todo = activeTodo(); return command('timer:start', { task: $('#task').value || todo?.title || '', todoId: todo?.id || null, focusMinutes: preset[0], breakMinutes: preset[1] }); };
[$('#focusMinutes'), $('#breakMinutes')].forEach((input) => {
  input.oninput = rememberCustomDurationDraft;
  input.onchange = () => { void saveCustomDurations(); };
  input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } };
});
$('#task').onblur = async () => { const task = $('#task').value; if (task.trim() !== (state.timer.task || '').trim()) await sendCommand('timer:updateTask', { task }); };
$('#task').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#task').blur(); } };
$('#todoTitle').oninput = (event) => editSession('todoAdd', { title: event.target.value });
$('#todoPriority').onchange = (event) => editSession('todoAdd', { priority: event.target.value });
$('#todoEstimate').oninput = (event) => editSession('todoAdd', { estimatePomos: Number(event.target.value) || 1 });
$('#addTodo').onclick = async () => {
  if (sessions.todo?.saving) return;
  const draft = sessions.todoAdd.draft;
  if (!draft.title.trim()) { setSession('todoAdd', draftSaveFailed(sessions.todoAdd, '请输入待办事项')); renderTodoAdd(); return; }
  const epoch = startSessionSave('todoAdd'); if (epoch == null) return; renderTodoPanel();
  try {
    const next = await sendCommand('todo:add', { title: draft.title.trim(), priority: draft.priority, estimatePomos: draft.estimatePomos });
    if (!isCurrentSave('todoAdd', epoch)) return;
    sessions.todoAdd = draftSaveSucceeded(sessions.todoAdd, blankTodoAdd(draft)); reportDirty(); $('#addTodo').blur(); render(next);
  } catch {
    if (!isCurrentSave('todoAdd', epoch)) return;
    setSession('todoAdd', draftSaveFailed(sessions.todoAdd, '添加失败，请重试')); renderTodoPanel();
  }
};
$('#todoTitle').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#addTodo').click(); } };
$('#complete').onclick = () => command(state.timer.phase === 'break' ? 'timer:endBreak' : 'timer:complete'); $('#stop').onclick = () => command('timer:stop');
$$('#presets button').forEach((button) => button.onclick = () => { selectedPreset = button.dataset.preset; if (selectedPreset !== 'custom') customDurationDraft = null; command('settings:update', { preset: selectedPreset }); });
$('#showPet').onclick = () => command('pet:visible', { visible: true });
$('#breakContinuationPrimary').onclick = () => { const continuation = state.breakContinuation; if (continuation.canContinue) return command('break:continue'); if (continuation.recommendedTodoId) return command('break:switch', { todoId: continuation.recommendedTodoId }); api.showControl({ focus: 'todo-entry' }); $('#todoTitle').focus(); };
$('#breakContinuationChoose').onclick = () => { breakChooserOpen = !breakChooserOpen; renderBreakContinuation(); globalThis.requestAnimationFrame(() => (breakChooserOpen ? $('#breakChooser button') : $('#breakContinuationChoose'))?.focus()); };
$('#breakContinuationIdle').onclick = () => command('break:idle');

function activateTab(button, focus = false) {
  if (button.classList.contains('active')) { if (focus) button.focus(); return true; }
  if (isAnySaving() || !confirmDiscard()) return false;
  $$('.tabs [role="tab"]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  $$('.drawer').forEach((drawer) => {
    const active = drawer.id === `${button.dataset.tab}Panel`;
    drawer.classList.toggle('active', active);
    drawer.hidden = !active;
  });
  if (focus) button.focus();
  return true;
}

$$('.tabs [role="tab"]').forEach((button, index, tabs) => {
  const panel = $(`#${button.getAttribute('aria-controls')}`);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', button.id);
  panel.hidden = !button.classList.contains('active');
  button.onclick = () => activateTab(button);
  button.onkeydown = (event) => {
    let targetIndex;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = tabs.length - 1;
    if (targetIndex == null) return;
    event.preventDefault();
    activateTab(tabs[targetIndex], true);
  };
});
$('#newAlarm').onclick = () => openReminder();
$$('[data-template]').forEach((button) => button.onclick = () => applyTemplate(button.dataset.template));
$$('[data-alarm-type]').forEach((button) => button.onclick = () => { editSession('reminder', { type: button.dataset.alarmType }); renderReminderEditor(); });
$('#alarmLabel').oninput = (event) => { editSession('reminder', { label: event.target.value }); $('#alarmDraftState').textContent = '有未保存修改'; };
$('#alarmWhen').oninput = (event) => { editSession('reminder', { at: new Date(event.target.value).getTime() }); renderReminderEditor(); };
$('#alarmTime').oninput = (event) => { editSession('reminder', { time: event.target.value }); renderReminderEditor(); };
$('#alarmStartTime').oninput = (event) => { editSession('reminder', { startTime: event.target.value }); renderReminderEditor(); };
$('#alarmEndTime').oninput = (event) => { editSession('reminder', { endTime: event.target.value }); renderReminderEditor(); };
$('#alarmInterval').onchange = (event) => { editSession('reminder', { intervalMinutes: Number(event.target.value) }); renderReminderEditor(); };
$('#alarmPose').onchange = (event) => editSession('reminder', { pose: event.target.value });
$('#cancelAlarm').onclick = () => { reminderEditing = false; setSession('reminder', cancelDraft(sessions.reminder)); renderReminderEditor(); syncEditingSuppression(); };
$('#alarmForm').onsubmit = async (event) => {
  event.preventDefault(); const error = validateReminder(sessions.reminder.draft);
  if (error) { setSession('reminder', draftSaveFailed(sessions.reminder, error)); renderReminderEditor(); return; }
  const epoch = startSessionSave('reminder'); if (epoch == null) return; renderReminderEditor();
  const draft = sessions.reminder.draft; const payload = alarmPayload(draft);
  const commandPayload = draft.id ? { id: draft.id, patch: payload } : { ...payload, enabled: true };
  try { const next = await sendCommand(draft.id ? 'alarm:update' : 'alarm:add', commandPayload); if (!isCurrentSave('reminder', epoch)) return; sessions.reminder = draftSaveSucceeded(sessions.reminder, { ...draft, ...payload, enabled: draft.id ? draft.enabled : true }); reminderEditing = false; reportDirty(); render(next); }
  catch { if (!isCurrentSave('reminder', epoch)) return; setSession('reminder', draftSaveFailed(sessions.reminder, '保存失败，请重试')); renderReminderEditor(); }
};

$('#editOffwork').onclick = () => startEditing('offwork'); $('#cancelOffwork').onclick = () => cancelEditing('offwork');
[['#offworkEnabled', 'enabled', 'checked'], ['#workStart', 'workStart', 'value'], ['#offworkTime', 'time', 'value'], ['#latestOffworkTime', 'latestTime', 'value'], ['#offworkPose', 'pose', 'value'], ['#offworkBlockMode', 'blockMode', 'checked'], ['#escalateMinutes', 'escalateMinutes', 'number'], ['#offworkSnooze', 'snoozeMinutes', 'number']].forEach(([selector, key, mode]) => $(selector).addEventListener('input', (event) => editSession('offwork', { [key]: mode === 'checked' ? event.target.checked : mode === 'number' ? Number(event.target.value) : event.target.value })));
[['#lunchStart', 0, 'start'], ['#lunchEnd', 0, 'end'], ['#dinnerStart', 1, 'start'], ['#dinnerEnd', 1, 'end']].forEach(([selector, index, key]) => $(selector).addEventListener('input', (event) => { const exclusions = structuredClone(sessions.offwork.draft.exclusions || []); exclusions[index] = { start: index ? '18:00' : '12:00', end: index ? '19:00' : '14:00', label: index ? '晚餐' : '午休', ...(exclusions[index] || {}), [key]: event.target.value }; editSession('offwork', { exclusions }); }));
$('#saveOffwork').onclick = async () => { const draft = sessions.offwork.draft; if (![draft.workStart, draft.time, draft.latestTime].every(validTime)) { setSession('offwork', draftSaveFailed(sessions.offwork, '请输入有效的工作时间')); renderOffwork(); return; } if (draft.time > draft.latestTime) { setSession('offwork', draftSaveFailed(sessions.offwork, '计划下班时间不能晚于最晚下班时间')); renderOffwork(); return; } if ((draft.exclusions || []).some((item) => !validTime(item.start) || !validTime(item.end) || item.start >= item.end)) { setSession('offwork', draftSaveFailed(sessions.offwork, '排除时段的开始时间要早于结束时间')); renderOffwork(); return; } if (!draft.weekdays.length) { setSession('offwork', draftSaveFailed(sessions.offwork, '请至少选择一天')); renderOffwork(); return; } const epoch = startSessionSave('offwork'); if (epoch == null) return; renderOffwork(); try { const next = await sendCommand('offwork:update', draft); if (!isCurrentSave('offwork', epoch)) return; sessions.offwork = draftSaveSucceeded(sessions.offwork); editing.offwork = false; reportDirty(); render(next); } catch { if (!isCurrentSave('offwork', epoch)) return; setSession('offwork', draftSaveFailed(sessions.offwork, '保存失败，请重试')); renderOffwork(); } };

$$('[data-persona]').forEach((button) => button.onclick = () => { editSession('persona', { preset: button.dataset.persona }); renderPersona(); });
[['#petName', 'petName'], ['#ownerName', 'ownerName'], ['#customPrompt', 'customPrompt'], ['#chatFrequency', 'chatFrequency']].forEach(([selector, key]) => $(selector).addEventListener('input', (event) => { editSession('persona', { [key]: event.target.value }); renderPersona(); }));
$('#companionEnabled').addEventListener('input', (event) => { editSession('persona', { companionEnabled: event.target.checked }); renderPersona(); });
$('#teaseLevel').oninput = (event) => { editSession('persona', { teaseLevel: Number(event.target.value) }); renderPersona(); };
$('#cancelPersona').onclick = () => { setSession('persona', cancelDraft(sessions.persona)); renderPersona(); syncEditingSuppression(); };
$('#savePersona').onclick = async () => { const draft = sessions.persona.draft; if (!draft.petName.trim() || !draft.ownerName.trim()) { setSession('persona', draftSaveFailed(sessions.persona, '名字和称呼不能为空')); renderPersona(); return; } const epoch = startSessionSave('persona'); if (epoch == null) return; renderPersona(); try { const payload = { preset: draft.preset, petName: draft.petName.trim(), ownerName: draft.ownerName.trim(), customPrompt: draft.customPrompt, teaseLevel: draft.teaseLevel, chatFrequency: draft.chatFrequency, companionEnabled: draft.companionEnabled }; const next = await sendCommand('persona:update', payload); if (!isCurrentSave('persona', epoch)) return; sessions.persona = draftSaveSucceeded(sessions.persona, payload); reportDirty(); render(next); } catch { if (!isCurrentSave('persona', epoch)) return; setSession('persona', draftSaveFailed(sessions.persona, '保存失败，请重试')); renderPersona(); } };

$('#editSettings').onclick = () => startEditing('settings'); $('#cancelSettings').onclick = () => cancelEditing('settings');
[['#voiceMode', 'voiceMode', 'value'], ['#volume', 'volume', 'number'], ['#ttsEngine', 'ttsEngine', 'value'], ['#edgeTtsVoice', 'edgeTtsVoice', 'value'], ['#ttsVoiceName', 'ttsVoiceName', 'value'], ['#aiCopyEnabled', 'aiCopyEnabled', 'checked'], ['#interactions', 'interactions', 'checked'], ['#launchAtLogin', 'launchAtLogin', 'checked'], ['#aiApiKey', 'aiApiKey', 'value']].forEach(([selector, key, mode]) => $(selector).addEventListener('input', (event) => { editSession('settings', { [key]: mode === 'checked' ? event.target.checked : mode === 'number' ? Number(event.target.value) : event.target.value }); if (key === 'volume') $('#volumeOutput').textContent = `${Math.round(Number(event.target.value) * 100)}%`; }));
$('#saveSettings').onclick = async () => { const epoch = startSessionSave('settings'); if (epoch == null) return; const draft = sessions.settings.draft; renderSettings(); try { if (draft.aiApiKey.trim()) await api.setAiKey(draft.aiApiKey.trim()); const payload = { voiceMode: draft.voiceMode, volume: draft.volume, ttsEngine: draft.ttsEngine, edgeTtsVoice: draft.edgeTtsVoice, ttsVoiceName: draft.ttsVoiceName, aiCopyEnabled: draft.aiCopyEnabled, interactions: draft.interactions, launchAtLogin: draft.launchAtLogin }; const next = await sendCommand('settings:update', payload); if (!isCurrentSave('settings', epoch)) return; sessions.settings = draftSaveSucceeded(sessions.settings, { ...draft, ...payload, aiApiKey: '', aiKeyConfigured: draft.aiKeyConfigured || Boolean(draft.aiApiKey.trim()) }); editing.settings = false; reportDirty(); render(next); } catch { if (!isCurrentSave('settings', epoch)) return; setSession('settings', draftSaveFailed(sessions.settings, '保存失败，请重试')); renderSettings(); } };
$('#testAi').onclick = async () => { aiTesting = true; renderSettings(); try { render(await sendCommand('ai:test')); } finally { aiTesting = false; renderSettings(); } };

document.addEventListener('focusin', (event) => { if (isTypingControl(event.target)) void suppressionController.setDesired('typing', true); });
document.addEventListener('focusout', () => setTimeout(() => void suppressionController.setDesired('typing', isTypingControl(document.activeElement)), 0));
api.onDiscardDrafts?.(() => resetAllDrafts());
api.onControlFocus?.((request) => { if (request?.focus === 'todo-entry') globalThis.requestAnimationFrame(() => $('#todoTitle').focus()); if (request?.focus === 'break-chooser' && state?.breakContinuation?.actions.choose) { breakChooserOpen = true; renderBreakContinuation(); globalThis.requestAnimationFrame(() => $('#breakChooser button')?.focus()); } });
globalThis.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoiceOptions);

async function initialize() { api.onState(render); render(await api.getState()); refreshVoiceOptions(); }
initialize();
setInterval(renderTimerClock, 250);
