import { companionPoseSrc } from './asset-paths.js';

const api = window.pomopet || createBrowserBridge();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let state; let selectedPreset = '25/5';
let previewTimer;
let clockSkewMs = 0;
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const interactionPoses = { interactionPet: 'pet', interactionFeed: 'feed', interactionBall: 'ball', comfort: 'pet' };

function createBrowserBridge() {
  const demo = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0 }, alarms: [], offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', snoozeMinutes: 15, escalateMinutes: 15, allowAnnoyed: true }, settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: .75, interactions: true, launchAtLogin: false } };
  return { getState: async () => demo, command: async (name, payload) => {
    demo.now = Date.now();
    if (name === 'timer:start') { demo.timer.status = 'running'; demo.timer.remainingMs = payload.focusMinutes * 60_000; demo.timer.targetAt = demo.now + demo.timer.remainingMs; }
    if (name === 'timer:pause') { demo.timer.remainingMs = Math.max(0, demo.timer.targetAt - demo.now); demo.timer.targetAt = null; demo.timer.status = 'paused'; }
    if (name === 'timer:resume') { demo.timer.targetAt = demo.now + demo.timer.remainingMs; demo.timer.status = 'running'; }
    if (name === 'alarm:add') demo.alarms.push({ ...payload, id: 'browser-alarm-' + Date.now(), snoozes: [] });
    return demo;
  }, onState: () => {}, showControl: () => {} };
}
const format = (ms) => { const seconds = Math.ceil(ms / 1000); return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); };
const displayRemaining = (timer) => timer.status === 'running' && timer.targetAt ? Math.max(0, timer.targetAt - (Date.now() - clockSkewMs)) : timer.remainingMs;
const dateInput = (timestamp) => { const d = new Date(timestamp); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); };
const recurrence = (alarm) => alarm.type === 'once' ? new Date(alarm.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : alarm.weekdays.map((d) => '周' + weekdays[d]).join('、');

function render(next) {
  state = next; clockSkewMs = Date.now() - (state.now || Date.now()); const timer = state.timer; $('#clock').textContent = format(displayRemaining(timer));
  $('#todayCount').textContent = timer.todayCount; $('#task').value = timer.task || $('#task').value;
  $('#phase').textContent = timer.status === 'idle' || timer.status === 'stopped' ? '准备专注' : timer.phase === 'break' ? '休息一下' : timer.status === 'paused' ? '暂停中' : '末末陪你专注中';
  $('#mainAction').textContent = timer.status === 'paused' ? '继续' : timer.status === 'running' ? '暂停' : '开始专注';
  $('#complete').classList.toggle('hidden', timer.phase !== 'focus' || !['running', 'paused'].includes(timer.status));
  $('#stop').classList.toggle('hidden', !['running', 'paused'].includes(timer.status));
  selectedPreset = state.settings.preset || selectedPreset; $$('#presets button').forEach((b) => b.classList.toggle('selected', b.dataset.preset === selectedPreset));
  $('#customTime').classList.toggle('hidden', selectedPreset !== 'custom');
  if (document.activeElement !== $('#focusMinutes')) $('#focusMinutes').value = state.settings.customFocus || 25;
  if (document.activeElement !== $('#breakMinutes')) $('#breakMinutes').value = state.settings.customBreak || 5;
  renderAlarms(); renderSettings();
}

function renderAlarms() {
  $('#alarmList').innerHTML = state.alarms.length ? state.alarms.map((alarm) => {
    const expired = alarm.type === 'once' && alarm.at <= state.now;
    const timing = (expired ? '已响过 · ' : '') + recurrence(alarm);
    return '<article class="alarm-item"><input class="alarm-enabled" data-id="' + alarm.id + '" type="checkbox" ' + (alarm.enabled ? 'checked' : '') + (expired ? ' disabled title="请先编辑为未来时间"' : '') + '><div class="alarm-meta"><strong>' + escapeHtml(alarm.label) + '</strong><small>' + timing + '</small></div><div class="alarm-tools"><button data-edit="' + alarm.id + '">编辑</button><button data-delete="' + alarm.id + '">删除</button></div></article>';
  }).join('') : '<div class="empty">还没有闹钟。末末目前只负责准时可爱。</div>';
  $$('.alarm-enabled').forEach((input) => input.onchange = () => command('alarm:enabled', { id: input.dataset.id, enabled: input.checked }));
  $$('[data-delete]').forEach((button) => button.onclick = () => command('alarm:remove', { id: button.dataset.delete }));
  $$('[data-edit]').forEach((button) => button.onclick = () => openAlarmForm(state.alarms.find((a) => a.id === button.dataset.edit)));
}

function renderSettings() {
  const off = state.offwork; $('#offworkEnabled').checked = off.enabled; $('#offworkTime').value = off.time; $('#offworkPose').value = off.pose || 'sleepy'; $('#escalateMinutes').value = off.escalateMinutes; $('#offworkSnooze').value = off.snoozeMinutes;
  $('#offworkDays').innerHTML = weekdays.map((label, day) => '<button data-day="' + day + '" class="' + (off.weekdays.includes(day) ? 'on' : '') + '">' + label + '</button>').join('');
  $('#offworkDays').querySelectorAll('button').forEach((b) => b.onclick = () => b.classList.toggle('on'));
  $('#voiceMode').value = state.settings.voiceMode; $('#volume').value = state.settings.volume; $('#interactions').checked = state.settings.interactions; $('#launchAtLogin').checked = state.settings.launchAtLogin;
}

function openAlarmForm(alarm = null) {
  const isWeekly = alarm?.type === 'weekly'; const form = $('#alarmForm'); form.classList.remove('hidden');
  form.innerHTML = '<input id="alarmLabel" maxlength="30" placeholder="提醒标签" value="' + escapeHtml(alarm?.label || '') + '"><select id="alarmType"><option value="once">一次性</option><option value="weekly">每周重复</option></select><input id="alarmWhen" type="' + (isWeekly ? 'time' : 'datetime-local') + '" value="' + (isWeekly ? alarm.time : dateInput(alarm?.at || Date.now() + 3_600_000)) + '"><button class="primary" id="saveAlarm">保存</button><div class="weekday-row ' + (isWeekly ? '' : 'hidden') + '" id="alarmDays">' + weekdays.map((d, day) => '<button type="button" data-day="' + day + '" class="' + ((alarm?.weekdays || [1,2,3,4,5]).includes(day) ? 'on' : '') + '">' + d + '</button>').join('') + '</div>';
  $('#alarmType').value = alarm?.type || 'once'; $('#alarmDays').querySelectorAll('button').forEach((b) => b.onclick = () => b.classList.toggle('on'));
  $('#alarmType').onchange = () => openAlarmForm({ ...alarm, label: $('#alarmLabel').value, type: $('#alarmType').value, at: Date.now() + 3_600_000, time: '09:00', weekdays: [1,2,3,4,5] });
  $('#saveAlarm').onclick = async () => { const type = $('#alarmType').value; const payload = { label: $('#alarmLabel').value, type, enabled: true, at: type === 'once' ? new Date($('#alarmWhen').value).getTime() : null, time: type === 'weekly' ? $('#alarmWhen').value : null, weekdays: type === 'weekly' ? $$('#alarmDays .on').map((b) => Number(b.dataset.day)) : [] }; await command(alarm?.id ? 'alarm:update' : 'alarm:add', alarm?.id ? { id: alarm.id, patch: payload } : payload); form.classList.add('hidden'); };
}
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value; return span.innerHTML; }
async function command(name, payload) {
  try {
    render(await api.command(name, payload));
  } catch (error) {
    const message = error?.message || 'unknown_error';
    $('#timerHint').textContent = '末末刚才没接住这个指令：' + message;
    throw error;
  }
}

$('#mainAction').onclick = async () => { const t = state.timer; if (t.status === 'running') return command('timer:pause'); if (t.status === 'paused') return command('timer:resume'); const preset = selectedPreset === '50/10' ? [50, 10] : selectedPreset === 'custom' ? [Number($('#focusMinutes').value), Number($('#breakMinutes').value)] : [25, 5]; if (selectedPreset === 'custom') await api.command('settings:update', { customFocus: preset[0], customBreak: preset[1] }); return command('timer:start', { task: $('#task').value, focusMinutes: preset[0], breakMinutes: preset[1] }); };
$('#complete').onclick = () => command('timer:complete'); $('#stop').onclick = () => command(state.timer.phase === 'break' ? 'timer:skipBreak' : 'timer:stop');
$$('#presets button').forEach((b) => b.onclick = async () => { selectedPreset = b.dataset.preset; await command('settings:update', { preset: selectedPreset }); });
$$('[data-interaction]').forEach((b) => b.onclick = () => {
  const kind = b.dataset.interaction; clearTimeout(previewTimer);
  $('#momoPreview').src = companionPoseSrc(interactionPoses[kind]);
  previewTimer = setTimeout(() => { $('#momoPreview').src = companionPoseSrc('focus'); }, 12_000);
  return command('interaction', { kind });
}); $('#showPet').onclick = () => command('pet:visible', { visible: true });
$$('.tabs button').forEach((b) => b.onclick = () => { $$('.tabs button').forEach((x) => x.classList.remove('active')); $$('.drawer').forEach((x) => x.classList.remove('active')); b.classList.add('active'); $('#' + b.dataset.tab + 'Panel').classList.add('active'); });
$('#newAlarm').onclick = () => openAlarmForm();
$('#saveOffwork').onclick = () => command('offwork:update', { enabled: $('#offworkEnabled').checked, time: $('#offworkTime').value, pose: $('#offworkPose').value, escalateMinutes: Number($('#escalateMinutes').value), snoozeMinutes: Number($('#offworkSnooze').value), weekdays: $$('#offworkDays .on').map((b) => Number(b.dataset.day)) });
$('#saveSettings').onclick = () => command('settings:update', { voiceMode: $('#voiceMode').value, volume: Number($('#volume').value), interactions: $('#interactions').checked, launchAtLogin: $('#launchAtLogin').checked });
async function initialize() { api.onState(render); render(await api.getState()); }
initialize();
setInterval(() => {
  if (!state?.timer) return;
  $('#clock').textContent = format(displayRemaining(state.timer));
}, 250);
