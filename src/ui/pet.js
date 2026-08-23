import { BrowserVoicePlayer } from './voice-player.js';
import { companionAnimationSrc } from './asset-paths.js';

const api = window.pomopet || createBrowserBridge();
const voicePlayer = new BrowserVoicePlayer();
const stage = document.querySelector('#petStage');
const petArt = document.querySelector('#petArt');
const speech = document.querySelector('#speech');
const menu = document.querySelector('#quickMenu');
let state;
let active;
let dragStart;
let dragged = false;
let visualTimer;
let motionTimer;

const labels = {
  focus: '陪你专注', reward: '番茄摘到啦', break: '该休息啦', alarm: '闹钟到点',
  water: '喝水时间', offwork: '今天收工', fainted: '末末已躺平', annoyed: '末末有点鼓',
  interactionPet: '摸摸头', interactionFeed: '开饭啦', interactionBall: '去抢球', comfort: '挠肚皮'
};
const poses = {
  idle: 'focus', focus: 'focus', reward: 'reward', break: 'ball', alarm: 'annoyed', water: 'water',
  offwork: 'sleepy', fainted: 'fainted', annoyed: 'annoyed', interactionPet: 'pet',
  interactionFeed: 'feed', interactionBall: 'ball', comfort: 'comfort'
};
function createBrowserBridge() {
  const demo = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
  const stateListeners = [];
  const presentationListeners = [];
  return {
    getState: async () => demo,
    onState: (callback) => { stateListeners.push(callback); callback(demo); },
    onPresentation: (callback) => presentationListeners.push(callback),
    command: async (name, payload = {}) => {
      if (name === 'interaction') presentationListeners.forEach((callback) => callback({ kind: payload.kind, text: '好呀，陪我玩一小会儿。', duration: 12_000, priority: 100 }));
      return demo;
    },
    showControl: () => {}, hidePet: () => {}, dragPet: () => {}
  };
}

function baseState() {
  return state?.timer?.status === 'running' ? (state.timer.phase === 'focus' ? 'focus' : 'break') : 'idle';
}

function setVisualState(kind) {
  const visual = poses[kind] ? kind : 'idle';
  stage.dataset.state = visual;
  petArt.src = companionAnimationSrc(poses[visual]);
}

function show(event) {
  active = event;
  clearTimeout(visualTimer);
  setVisualState(event.kind);
  speech.classList.remove('hidden');
  document.querySelector('#speechLabel').textContent = labels[event.kind] || '末末想说';
  document.querySelector('#speechText').textContent = (event.label ? `${event.label}：` : '') + event.text;
  const hasReminderActions = Boolean(event.actions?.alarmId || event.actions?.offwork);
  document.querySelector('#speechActions').classList.toggle('hidden', !hasReminderActions);
  document.querySelector('#snoozeReminder').textContent = event.actions?.offwork ? '再忙 10 分钟' : '再睡 10 分钟';
  document.querySelector('#dismissReminder').textContent = event.actions?.offwork ? '今天收工了' : '知道啦';
  playVoice(event);
  visualTimer = setTimeout(() => {
    speech.classList.add('hidden');
    setVisualState(baseState());
    active = null;
  }, event.duration || 10_000);
}

function playVoice(event) {
  const critical = event.category === 'alarm' || ['offwork', 'fainted', 'annoyed'].includes(event.kind);
  if (!event.voice || (state?.settings?.voiceMode === 'off' && !critical)) return;
  voicePlayer.enqueue({ id: event.voice, priority: event.priority, volume: state.settings.volume });
}

function closeActivePresentation() {
  clearTimeout(visualTimer);
  active = null;
  speech.classList.add('hidden');
  setVisualState(baseState());
}

function nudgePet() {
  if (active || dragStart || !menu.classList.contains('hidden')) return;
  const focusMode = state?.timer?.status === 'running' && state.timer.phase === 'focus';
  const step = focusMode ? 8 : 18;
  const delta = { x: Math.round((Math.random() - 0.5) * step), y: Math.round((Math.random() - 0.65) * step) };
  if (Math.abs(delta.x) + Math.abs(delta.y) < 4) return;
  stage.dataset.motion = 'wander';
  api.dragPet(delta);
  clearTimeout(motionTimer);
  motionTimer = setTimeout(() => { delete stage.dataset.motion; }, 900);
}

api.onState((next) => { state = next; if (!active) setVisualState(baseState()); });
api.onPresentation(show);
document.querySelector('#petMenu').onclick = () => menu.classList.toggle('hidden');
document.querySelector('#openControl').onclick = () => api.showControl();
document.querySelector('#hidePet').onclick = () => api.hidePet();
document.querySelectorAll('[data-interaction]').forEach((button) => {
  button.onclick = () => { menu.classList.add('hidden'); api.command('interaction', { kind: button.dataset.interaction }); };
});
document.querySelector('#snoozeReminder').onclick = () => {
  if (active?.actions?.alarmId) api.command('alarm:snooze', { ...active.actions, minutes: 10 });
  if (active?.actions?.offwork) api.command('offwork:snooze');
  closeActivePresentation();
};
document.querySelector('#dismissReminder').onclick = () => {
  if (active?.actions?.alarmId) api.command('alarm:dismiss', active.actions);
  if (active?.actions?.offwork) api.command('offwork:dismiss');
  closeActivePresentation();
};
document.querySelector('#petHotspot').onpointerdown = (event) => {
  dragStart = { x: event.screenX, y: event.screenY };
  dragged = false;
  event.currentTarget.setPointerCapture(event.pointerId);
};
document.querySelector('#petHotspot').onpointermove = (event) => {
  if (!dragStart) return;
  const delta = { x: event.screenX - dragStart.x, y: event.screenY - dragStart.y };
  if (Math.abs(delta.x) + Math.abs(delta.y) > 3) dragged = true;
  api.dragPet(delta);
  dragStart = { x: event.screenX, y: event.screenY };
};
document.querySelector('#petHotspot').onpointerup = () => {
  dragStart = null;
  if (!dragged && state.settings.interactions) api.command('interaction', { kind: 'interactionPet' });
};

async function initialize() {
  state = await api.getState();
  setVisualState(baseState());
  setInterval(nudgePet, 4_500);
}

initialize();
