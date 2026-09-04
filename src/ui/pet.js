import { BrowserVoicePlayer } from './voice-player.js';
import { companionAnimationSrc } from './asset-paths.js';
import { PET_POSE_ASSETS, PET_POSE_LABELS } from './pet-poses.js';

const api = window.pomopet || createBrowserBridge();
const voicePlayer = new BrowserVoicePlayer();
const stage = document.querySelector('#petStage');
const petArt = document.querySelector('#petArt');
const speech = document.querySelector('#speech');
const petTimer = document.querySelector('#petTimer');
const menu = document.querySelector('#quickMenu');
let state;
let active;
let clockSkewMs = 0;
let dragStart;
let visualTimer;
let rewardTimer;
let menuTimer;
let toastTimer;
let voiceRequestId = 0;
let suppressHotspotTapUntil = 0;
const animationCache = new Map();
const MENU_PREVIEW_DURATION = 5_000;

const labels = {
  focus: '陪你专注', reward: '番茄摘到啦', break: '该休息啦', breakComplete: '休息结束啦', alarm: '闹钟到点',
  water: '喝水时间', offwork: '今天收工', fainted: '末末已躺平', annoyed: '末末有点鼓',
  interactionPet: '摸摸头', interactionFeed: '开饭啦', interactionBall: '去抢球', comfort: '挠肚皮',
  ...PET_POSE_LABELS
};
const poses = {
  ...PET_POSE_ASSETS,
  idle: 'focus', focus: 'focus', reward: 'reward', break: 'ball', breakComplete: 'focus', alarm: 'annoyed', water: 'water',
  offwork: 'sleepy', fainted: 'fainted', annoyed: 'annoyed', interactionPet: 'pet',
  interactionFeed: 'feed', interactionBall: 'ball', comfort: 'comfort'
};
const voiceStyles = {
  cute: { rate: 1.08, pitch: 1.25 },
  comfort: { rate: 0.92, pitch: 1.05 },
  sarcastic: { rate: 1.02, pitch: 0.96 },
  sleepy: { rate: 0.82, pitch: 0.9 }
};
const menuPreviewCopy = {
  focus: '你忙你的，我安静陪着。',
  reward: '今天也有在好好推进，值得夸。',
  ball: '球来了！我冲！你负责夸，不许省略形容词。',
  sleepy: '眼皮开始打架了，我先趴一会儿。',
  fainted: '已躺平。今天的电量暂时告急。',
  annoyed: '哼，末末现在有一点点气鼓鼓。',
  pet: '摸到头顶那撮毛了吗？那里今天负责接收好运。',
  feed: '嗷呜！饼干到账，陪伴服务立刻续费。',
  comfort: '哈哈别挠啦……可以再挠三秒。',
  water: '喝口水吧，脑袋也需要补充水分。',
  aggrieved: '我没有委屈，只是眼睛刚好想下雨。',
  angryStanding: '我都气得跺脚了，你最好来哄一下。'
};
const menuPreviewLabels = { ball: '去抢球', pet: '摸摸头', feed: '开饭啦', comfort: '挠肚皮' };
function createBrowserBridge() {
  const demo = { timer: { status: 'idle', phase: 'focus' }, pet: { displayMode: 'full' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
  const stateListeners = [];
  const presentationListeners = [];
  return {
    getState: async () => demo,
    onState: (callback) => { stateListeners.push(callback); callback(demo); },
    onPresentation: (callback) => presentationListeners.push(callback),
    command: async (name, payload = {}) => {
      if (name === 'interaction') presentationListeners.forEach((callback) => callback({ kind: payload.kind, text: '好呀，陪我玩一小会儿。', duration: MENU_PREVIEW_DURATION, priority: 100 }));
      if (name === 'settings:mute') {
        demo.settings.muted = Boolean(payload.muted);
        stateListeners.forEach((callback) => callback(structuredClone(demo)));
      }
      if (name === 'pet:displayMode') {
        demo.pet.displayMode = payload.mode;
        stateListeners.forEach((callback) => callback(structuredClone(demo)));
      }
      return demo;
    },
    synthesizeSpeech: async () => null,
    setPetSpeaking: () => {},
    showControl: () => {}, hidePet: () => {}, dragPet: () => {}
  };
}

function baseState() {
  return state?.timer?.status === 'running' ? (state.timer.phase === 'focus' ? 'focus' : 'break') : 'idle';
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function timerRemaining(timer) {
  if (timer.status === 'running' && Number.isFinite(timer.targetAt)) return Math.max(0, timer.targetAt - (Date.now() - clockSkewMs));
  return Math.max(0, Number(timer.remainingMs) || 0);
}

function renderPetTimer() {
  const timer = state?.timer;
  const mode = state?.pet?.displayMode || 'full';
  const visible = ['full', 'timer'].includes(mode) && !active && timer && ['running', 'paused'].includes(timer.status) && ['focus', 'break'].includes(timer.phase);
  petTimer.classList.toggle('hidden', !visible);
  if (!visible) return;
  const remainingMs = timerRemaining(timer);
  const focus = timer.phase === 'focus';
  document.querySelector('#petTimerPhase').textContent = timer.status === 'paused'
    ? (focus ? '专注暂停' : '休息暂停')
    : (focus && remainingMs <= 5 * 60_000 ? '最后冲刺' : focus ? '专注中' : '休息中');
  document.querySelector('#petTimerTask').textContent = focus ? (String(timer.task || '').trim() || '这颗番茄') : '起来活动一下';
  document.querySelector('#petTimerTime').textContent = formatCountdown(remainingMs);
  const totalMs = Number(focus ? timer.focusMs : timer.breakMs);
  const progress = Number.isFinite(totalMs) && totalMs > 0 ? Math.min(100, Math.max(0, (totalMs - remainingMs) / totalMs * 100)) : 0;
  document.querySelector('#petTimerProgress').style.width = `${progress}%`;
  document.querySelector('#petTimerPause').textContent = timer.status === 'paused' ? '继续' : '暂停';
  document.querySelector('#petTimerFinish').textContent = focus ? '提前完成' : '结束休息';
  petTimer.dataset.phase = focus ? (remainingMs <= 5 * 60_000 ? 'urgent' : 'focus') : 'break';
  petTimer.dataset.paused = String(timer.status === 'paused');
}

function renderDesktopDisplay() {
  const mode = state?.pet?.displayMode || 'full';
  const showPet = Boolean(active) || ['full', 'pet'].includes(mode);
  stage.dataset.displayMode = mode;
  stage.classList.toggle('is-presenting', Boolean(active));
  petArt.classList.toggle('hidden', !showPet);
  document.querySelector('.sparkles').classList.toggle('hidden', !showPet);
  document.querySelector('#petHotspot').classList.toggle('hidden', !showPet);
  syncDisplayModeButtons();
}

function setVisualState(kind) {
  const visual = poses[kind] ? kind : 'idle';
  const asset = poses[visual];
  stage.dataset.state = visual;
  petArt.src = animationCache.get(asset)?.src || companionAnimationSrc(asset);
}

function preloadAnimations() {
  for (const asset of new Set(Object.values(PET_POSE_ASSETS))) {
    const image = new globalThis.Image();
    image.decoding = 'async';
    image.src = companionAnimationSrc(asset);
    animationCache.set(asset, image);
  }
}

function previewPose(kind, { bubble = true } = {}) {
  if (!bubble) {
    clearTimeout(visualTimer);
    active = { kind, optimistic: true };
    api.setPetSpeaking?.({ visible: true, height: 280 });
    renderDesktopDisplay();
    renderPetTimer();
    setVisualState(kind);
    visualTimer = setTimeout(() => {
      if (active?.optimistic) {
        active = null;
        setVisualState(baseState());
        renderDesktopDisplay();
        renderPetTimer();
        api.setPetSpeaking?.({ visible: false, restoreDisplay: true });
      }
    }, MENU_PREVIEW_DURATION);
    return;
  }
  show({
    kind,
    displayLabel: menuPreviewLabels[kind],
    text: menuPreviewCopy[kind] || '末末换了个姿势陪你。',
    duration: MENU_PREVIEW_DURATION,
    priority: 0
  });
}

function fitSpeechAbovePet(event) {
  globalThis.requestAnimationFrame(() => {
    if (active !== event) return;
    api.setPetSpeaking?.({ visible: true, height: speech.getBoundingClientRect().height + 205 });
  });
}

function renderBreakActions(actions, visible) {
  document.querySelector('#breakPrimary').classList.toggle('hidden', !visible);
  const canChoose = actions?.choose ?? Boolean(actions?.recommendedTodoId);
  document.querySelector('#breakChoose').classList.toggle('hidden', !visible || !canChoose);
  document.querySelector('#breakIdle').classList.toggle('hidden', !visible);
  document.querySelector('#breakPrimary').textContent = actions?.canContinue
    ? '继续刚才的任务'
    : actions?.recommendedTodoId ? '开始推荐任务' : '添加下一件事';
}

function show(event) {
  active = event;
  renderDesktopDisplay();
  renderPetTimer();
  const requestId = ++voiceRequestId;
  voicePlayer.interruptBelow(event.priority);
  clearTimeout(visualTimer);
  clearTimeout(rewardTimer);
  setVisualState(event.kind);
  speech.classList.remove('hidden');
  document.querySelector('#speechLabel').textContent = event.displayLabel || labels[event.kind] || '末末想说';
  document.querySelector('#speechText').textContent = (event.label ? `${event.label}：` : '') + event.text;
  const hasReminderActions = Boolean(event.actions?.alarmId || event.actions?.offwork);
  const hasRewardActions = Boolean(event.actions?.reward && state?.settings?.interactions !== false);
  const hasBreakActions = Boolean(event.actions?.breakContinuation);
  const rewardDelayMs = hasRewardActions ? Number(event.actions.rewardDelayMs || 0) : 0;
  const showRewards = hasRewardActions && rewardDelayMs <= 0;
  document.querySelector('#speechActions').classList.toggle('hidden', !hasReminderActions && !showRewards && !hasBreakActions);
  document.querySelector('#snoozeReminder').classList.toggle('hidden', !hasReminderActions);
  document.querySelector('#dismissReminder').classList.toggle('hidden', !hasReminderActions);
  document.querySelector('#rewardFeed').classList.toggle('hidden', !showRewards);
  document.querySelector('#rewardPlay').classList.toggle('hidden', !showRewards);
  renderBreakActions(event.actions, hasBreakActions);
  const snoozeMinutes = Math.max(1, Number(event.actions?.snoozeMinutes) || 10);
  document.querySelector('#snoozeReminder').textContent = event.actions?.offwork ? `再忙 ${snoozeMinutes} 分钟` : '10 分钟后提醒';
  document.querySelector('#dismissReminder').textContent = event.actions?.offwork ? '今天收工了' : '知道啦';
  fitSpeechAbovePet(event);
  playVoice(event, requestId);
  if (hasRewardActions && rewardDelayMs > 0) {
    rewardTimer = setTimeout(() => {
      if (active !== event) return;
      document.querySelector('#speechActions').classList.remove('hidden');
      document.querySelector('#rewardFeed').classList.remove('hidden');
      document.querySelector('#rewardPlay').classList.remove('hidden');
      fitSpeechAbovePet(event);
    }, rewardDelayMs);
  }
  visualTimer = setTimeout(() => {
    speech.classList.add('hidden');
    api.setPetSpeaking?.({ visible: false, restoreDisplay: true });
    setVisualState(baseState());
    active = null;
    renderDesktopDisplay();
    renderPetTimer();
  }, event.duration || 10_000);
}

async function playVoice(event, requestId) {
  const settings = state?.settings || {};
  const critical = ['alarm', 'focusComplete', 'breakComplete', 'offwork', 'ignored'].includes(event.category)
    || ['offwork', 'fainted', 'annoyed', 'angryStanding'].includes(event.kind);
  if (settings.muted || settings.voiceMode === 'off') return;
  if (settings.voiceMode === 'key' && !critical) return;
  const voiceText = event.voiceText || (settings.voiceMode === 'all' ? event.text : null);
  if (voiceText) {
    const style = voiceStyles[settings.voiceStyle] || voiceStyles.cute;
    if (settings.ttsEngine !== 'system' && api.synthesizeSpeech) {
      try {
        const generated = await api.synthesizeSpeech({ text: voiceText, style: settings.voiceStyle || 'cute', voice: settings.edgeTtsVoice || '' });
        if (voiceRequestId !== requestId || active !== event) return;
        if (generated?.url) {
          voicePlayer.enqueueUrl({ url: generated.url, priority: event.priority, volume: settings.volume ?? 0.75 });
          return;
        }
      } catch (error) {
        console.warn('Pomopet Edge TTS failed, falling back to system voice.', error);
      }
      if (voiceRequestId !== requestId || active !== event) return;
    }
    const spoken = voicePlayer.speakText({ text: voiceText, priority: event.priority, volume: settings.volume ?? 0.75, voiceName: settings.ttsVoiceName || '', ...style });
    if (!spoken) console.warn('Pomopet could not use system TTS for reminder text.');
    return;
  }
  if (!event.voice) return;
  voicePlayer.enqueue({ id: event.voice, priority: event.priority, volume: settings.volume ?? 0.75 });
}

function closeActivePresentation({ restoreDisplay = true } = {}) {
  clearTimeout(visualTimer);
  clearTimeout(rewardTimer);
  active = null;
  voiceRequestId += 1;
  speech.classList.add('hidden');
  if (restoreDisplay) api.setPetSpeaking?.({ visible: false, restoreDisplay: true });
  setVisualState(baseState());
  renderDesktopDisplay();
  renderPetTimer();
}

function closeMenu() {
  clearTimeout(menuTimer);
  menu.classList.add('hidden');
  api.setPetSpeaking?.({ visible: false, restoreDisplay: true });
}

function suppressHotspotTap(delay = 500) {
  suppressHotspotTapUntil = Date.now() + delay;
  dragStart = null;
}

function scheduleMenuClose(delay = 4_000) {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(closeMenu, delay);
}

function openMenu() {
  syncMuteButton();
  syncDisplayModeButtons();
  api.setPetSpeaking?.({ visible: true, height: 280 });
  menu.classList.remove('hidden');
  scheduleMenuClose();
}

function toggleMenu() {
  if (menu.classList.contains('hidden')) openMenu();
  else closeMenu();
}

function syncMuteButton() {
  const muted = Boolean(state?.settings?.muted);
  const button = document.querySelector('#toggleMute');
  button.classList.toggle('is-muted', muted);
  button.setAttribute('aria-label', muted ? '取消静音' : '静音');
  button.querySelector('.mute-icon').textContent = muted ? '🔊' : '🔇';
  button.querySelector('.mute-label').textContent = muted ? '取消静音' : '静音';
  button.querySelector('.mute-state').textContent = muted ? '已静音' : '声音开';
}

function syncDisplayModeButtons() {
  const mode = state?.pet?.displayMode || 'full';
  document.querySelectorAll('.display-modes button[data-display-mode]').forEach((button) => {
    const selected = button.dataset.displayMode === mode;
    button.setAttribute('aria-checked', String(selected));
    button.classList.toggle('selected', selected);
  });
}

function showMuteToast(muted) {
  const toast = document.querySelector('#petToast');
  clearTimeout(toastTimer);
  toast.textContent = muted ? '已静音，末末会用气泡陪你' : '声音回来啦';
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2_000);
}

function stopVoiceForMute() {
  voiceRequestId += 1;
  voicePlayer.interruptBelow(Number.POSITIVE_INFINITY);
}

api.onState((next) => {
  const becameMuted = next?.settings?.muted && !state?.settings?.muted;
  if (Number.isFinite(next?.now)) clockSkewMs = Date.now() - next.now;
  state = next;
  if (becameMuted) stopVoiceForMute();
  syncMuteButton();
  renderDesktopDisplay();
  if (active?.actions?.breakContinuation) {
    const continuation = state.breakContinuation;
    if (!continuation) closeActivePresentation();
    else {
      active.actions = { ...active.actions, canContinue: continuation.canContinue,
        recommendedTodoId: continuation.recommendedTodoId, choose: continuation.actions.choose, addTodo: continuation.actions.addTodo };
      renderBreakActions(active.actions, true);
      fitSpeechAbovePet(active);
    }
  }
  if (!active) setVisualState(baseState());
  renderPetTimer();
});
api.onPresentation(show);
document.querySelector('#petMenu').onpointerdown = (event) => {
  event.preventDefault();
  event.stopPropagation();
  suppressHotspotTap();
  toggleMenu();
};
stage.oncontextmenu = (event) => {
  event.preventDefault();
  event.stopPropagation();
  suppressHotspotTap();
  openMenu();
};
stage.onpointerdown = (event) => {
  if (event.button === 2) return;
  if (!menu.classList.contains('hidden') && !menu.contains(event.target) && event.target.id !== 'petMenu') closeMenu();
};
menu.onpointerenter = () => clearTimeout(menuTimer);
menu.onpointerleave = () => scheduleMenuClose(700);
menu.onpointermove = () => scheduleMenuClose();
menu.oncontextmenu = (event) => {
  event.preventDefault();
  event.stopPropagation();
};
menu.onpointerdown = (event) => {
  event.stopPropagation();
  scheduleMenuClose();
};
function bindQuickButton(selector, action) {
  document.querySelector(selector).onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressHotspotTap();
    closeMenu();
    action(event.currentTarget);
  };
}
bindQuickButton('#openControl', () => api.showControl());
document.querySelectorAll('.display-modes button[data-display-mode]').forEach((button) => bindQuickButton(`.display-modes button[data-display-mode="${button.dataset.displayMode}"]`, async () => {
  try {
    state = await api.command('pet:displayMode', { mode: button.dataset.displayMode });
    renderDesktopDisplay();
    renderPetTimer();
  } catch (error) {
    console.warn('Pomopet could not change desktop display mode.', error);
  }
}));
bindQuickButton('#toggleMute', async () => {
  const muted = !state?.settings?.muted;
  if (muted) stopVoiceForMute();
  try {
    state = await api.command('settings:mute', { muted });
    syncMuteButton();
    showMuteToast(muted);
  } catch (error) {
    console.warn('Pomopet could not change mute state.', error);
  }
});
document.querySelectorAll('[data-interaction]').forEach((button) => {
  button.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressHotspotTap();
    closeMenu();
    const pose = button.dataset.pose || button.dataset.interaction;
    const interaction = button.dataset.interaction;
    previewPose(pose);
    if (interaction && state?.settings?.interactions) api.command('interaction', { kind: interaction });
  };
});
document.querySelectorAll('[data-pose]:not([data-interaction])').forEach((button) => {
  button.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressHotspotTap();
    closeMenu();
    previewPose(button.dataset.pose);
  };
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
function rewardPet(kind, pose) {
  closeActivePresentation({ restoreDisplay: false });
  previewPose(pose, { bubble: false });
  api.command('interaction', { kind });
}
document.querySelector('#rewardFeed').onclick = () => rewardPet('interactionFeed', 'feed');
document.querySelector('#rewardPlay').onclick = () => rewardPet('interactionBall', 'ball');
async function runBreakCommand(name, payload) {
  try {
    state = await api.command(name, payload);
    closeActivePresentation();
  } catch (error) {
    console.warn('Pomopet could not resolve the break choice.', error);
  }
}
document.querySelector('#breakPrimary').onclick = () => {
  if (active?.actions?.canContinue) return runBreakCommand('break:continue');
  if (active?.actions?.recommendedTodoId) return runBreakCommand('break:switch', { todoId: active.actions.recommendedTodoId });
  api.showControl({ focus: 'todo-entry' });
  closeActivePresentation();
};
document.querySelector('#breakChoose').onclick = () => {
  api.showControl({ focus: 'break-chooser' });
  closeActivePresentation();
};
document.querySelector('#breakIdle').onclick = () => runBreakCommand('break:idle');
async function runTimerCommand(name) {
  try { state = await api.command(name); renderPetTimer(); }
  catch (error) { console.warn('Pomopet could not update the timer.', error); }
}
document.querySelector('#petTimerPause').onclick = () => runTimerCommand(state?.timer?.status === 'paused' ? 'timer:resume' : 'timer:pause');
document.querySelector('#petTimerFinish').onclick = () => runTimerCommand(state?.timer?.phase === 'break' ? 'timer:endBreak' : 'timer:complete');
document.querySelector('#petTimerStop').onclick = () => runTimerCommand('timer:stop');
document.querySelector('#petHotspot').onpointerdown = (event) => {
  if (!menu.classList.contains('hidden') || Date.now() < suppressHotspotTapUntil) return;
  dragStart = { x: event.screenX, y: event.screenY };
  event.currentTarget.setPointerCapture(event.pointerId);
};
document.querySelector('#petHotspot').onpointermove = (event) => {
  if (!dragStart) return;
  const delta = { x: event.screenX - dragStart.x, y: event.screenY - dragStart.y };
  api.dragPet(delta);
  dragStart = { x: event.screenX, y: event.screenY };
};
document.querySelector('#petHotspot').onpointerup = () => {
  dragStart = null;
};

async function initialize() {
  preloadAnimations();
  state = await api.getState();
  if (Number.isFinite(state?.now)) clockSkewMs = Date.now() - state.now;
  setVisualState(baseState());
  renderPetTimer();
}

initialize();
setInterval(renderPetTimer, 250);
