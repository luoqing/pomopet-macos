import { BrowserVoicePlayer } from './voice-player.js';
const api = window.pomopet; const voicePlayer = new BrowserVoicePlayer();
const stage = document.querySelector('#petStage'); const speech = document.querySelector('#speech'); const menu = document.querySelector('#quickMenu');
let state; let active; let dragStart; let dragged = false; let visualTimer;
const labels = { focus: '陪你专注', reward: '番茄摘到啦', break: '该休息啦', alarm: '闹钟到点', offwork: '今天收工', annoyed: '末末有点鼓', interactionPet: '摸摸头', interactionFeed: '开饭啦', interactionBall: '去捡球', comfort: '抱一会儿' };

function baseState() { return state?.timer?.status === 'running' ? (state.timer.phase === 'focus' ? 'focus' : 'break') : 'idle'; }
function show(event) {
  active = event; clearTimeout(visualTimer); stage.dataset.state = event.kind; speech.classList.remove('hidden');
  document.querySelector('#speechLabel').textContent = labels[event.kind] || '末末想说'; document.querySelector('#speechText').textContent = (event.label ? event.label + '：' : '') + event.text;
  document.querySelector('#speechActions').classList.toggle('hidden', event.kind !== 'alarm');
  playVoice(event); visualTimer = setTimeout(() => { speech.classList.add('hidden'); stage.dataset.state = baseState(); active = null; }, event.duration || 10_000);
}
function playVoice(event) {
  if (!event.voice || state?.settings?.voiceMode === 'off') return;
  voicePlayer.enqueue({ id: event.voice, priority: event.priority, volume: state.settings.volume });
}
api.onState((next) => { state = next; if (!active) stage.dataset.state = baseState(); }); api.onPresentation(show);
document.querySelector('#petMenu').onclick = () => menu.classList.toggle('hidden'); document.querySelector('#openControl').onclick = () => api.showControl(); document.querySelector('#hidePet').onclick = () => api.hidePet();
document.querySelectorAll('[data-interaction]').forEach((button) => button.onclick = () => { menu.classList.add('hidden'); api.command('interaction', { kind: button.dataset.interaction }); });
document.querySelector('#snoozeAlarm').onclick = () => { if (active?.actions) api.command('alarm:snooze', { ...active.actions, minutes: 10 }); speech.classList.add('hidden'); };
document.querySelector('#dismissAlarm').onclick = () => { if (active?.actions) api.command('alarm:dismiss', active.actions); speech.classList.add('hidden'); };
document.querySelector('#petHotspot').onpointerdown = (event) => { dragStart = { x: event.screenX, y: event.screenY }; dragged = false; event.currentTarget.setPointerCapture(event.pointerId); };
document.querySelector('#petHotspot').onpointermove = (event) => { if (!dragStart) return; const delta = { x: event.screenX - dragStart.x, y: event.screenY - dragStart.y }; if (Math.abs(delta.x) + Math.abs(delta.y) > 3) dragged = true; api.dragPet(delta); dragStart = { x: event.screenX, y: event.screenY }; };
document.querySelector('#petHotspot').onpointerup = () => { dragStart = null; if (!dragged && state.settings.interactions) api.command('interaction', { kind: 'interactionPet' }); };
async function initialize() { state = await api.getState(); stage.dataset.state = baseState(); }
initialize();
