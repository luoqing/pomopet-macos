import { AlarmScheduler, OccurrenceLedger } from '../../core/alarms.js';
import { CopyPicker, COPY } from '../../core/copy.js';
import { OffworkScheduler, defaultOffwork } from '../../core/offwork.js';
import { PresentationQueue, PRIORITY } from '../../core/presentation.js';
import { SystemClock, localDayKey } from '../../core/time.js';
import { TimerEngine, createTimerState } from '../../core/timer.js';
import { TodoLedger, createTodoState } from '../../core/todos.js';
import { migrateTo016 } from '../../core/migrate.js';
import { FREQUENCIES, fallbackLine, normalizePersona } from '../../core/persona.js';
import { AiAlarmCopy, isSimilarLine } from './ai-copy.mjs';
import { ActivityLedger, createActivityState } from '../../core/activity-ledger.js';
import { reviewRecentDays } from '../../core/time-review.js';

const defaults = {
  timer: createTimerState(), todos: createTodoState(), alarms: [], ledger: {}, analytics: createActivityState(), copyLast: {}, offwork: defaultOffwork(),
  settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', muted: false, volume: 0.75, interactions: true, companionEnabled: true, launchAtLogin: false, aiCopyEnabled: false, aiApiKey: '', aiTone: 'random', voiceStyle: 'cute', ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', ttsVoiceName: '' },
  pet: { visible: true, position: null, displayMode: 'full' },
  companion: { nextAmbientAt: null, lastAmbientAt: null, recentLines: [] }
};
const PUBLIC_SETTING_KEYS = ['preset', 'customFocus', 'customBreak', 'voiceMode', 'muted', 'volume', 'interactions', 'companionEnabled', 'launchAtLogin', 'aiCopyEnabled', 'aiTone', 'voiceStyle', 'ttsEngine', 'edgeTtsVoice', 'ttsVoiceName'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class AppRuntime {
  constructor({ store, onState = () => {}, onPresentation = () => {}, onNotify = () => {}, clock = new SystemClock(), aiCopy = new AiAlarmCopy(), random = Math.random, aiDeadlineMs = 1_500 }) {
    this.store = store; this.onState = onState; this.onPresentation = onPresentation; this.onNotify = onNotify; this.clock = clock;
    this.aiCopy = aiCopy; this.random = random; this.aiDeadlineMs = aiDeadlineMs;
    this.presentations = new PresentationQueue({ now: () => this.clock.now() }); this.active = null; this.activeTimeout = null; this.dirty = false;
    this.suppressionSources = new Set();
    this.aiStatus = { status: 'builtin', sample: null, errorCode: null, checkedAt: null };
  }
  async init() {
    this.data = migrateTo016(await this.store.load(defaults), this.clock.now());
    this.data.settings = { ...defaults.settings, ...(this.data.settings || {}) };
    this.data.offwork = { ...defaultOffwork(), ...(this.data.offwork || {}) };
    const savedPet = this.data.pet || {};
    this.data.pet = { ...defaults.pet, ...savedPet };
    if (!['full', 'pet', 'timer', 'hidden'].includes(savedPet.displayMode)) this.data.pet.displayMode = savedPet.visible === false ? 'hidden' : 'full';
    this.data.pet.visible = this.data.pet.displayMode !== 'hidden';
    this.data.companion = { ...defaults.companion, ...(this.data.companion || {}) };
    this.data.companion.recentLines = (Array.isArray(this.data.companion.recentLines) ? this.data.companion.recentLines : [])
      .map((line) => String(line || '').trim().slice(0, 80)).filter(Boolean).slice(-8);
    this.data.persona = normalizePersona(this.data.persona);
    this.timer = new TimerEngine(this.clock, this.data.timer);
    this.todos = new TodoLedger(this.clock, this.data.todos);
    this.activity = new ActivityLedger(this.data.analytics);
    this.alarms = new AlarmScheduler(this.clock, this.data.alarms, new OccurrenceLedger(this.data.ledger));
    this.copy = new CopyPicker(this.data.copyLast, this.random); this.offwork = new OffworkScheduler(this.clock, this.data.offwork);
    await this.#handle(this.timer.tick({ recovery: true })); await this.persist(); this.emit();
  }
  view() {
    const timer = this.timer.snapshot();
    const day = localDayKey(this.clock.now());
    const todos = this.todos.snapshot();
    const settings = Object.fromEntries(PUBLIC_SETTING_KEYS.map((key) => [key, this.data.settings[key]]));
    settings.aiKeyConfigured = Boolean(String(this.data.settings.aiApiKey || '').trim());
    return { timer: { ...timer, remainingMs: this.timer.remaining(), todayCount: timer.completedByDay[localDayKey(this.clock.now())] || 0 },
      breakContinuation: this.#breakContinuation(),
      todos: { ...todos, items: todos.items.filter((item) => item.day === day) }, alarms: this.alarms.snapshot().alarms,
      review: reviewRecentDays({
        analytics: this.activity.snapshot(),
        now: this.clock.now(),
        currentTimer: timer,
        workStart: this.offwork.state.workStart
      }),
      offwork: this.offwork.snapshot(), settings, persona: this.data.persona, aiStatus: this.aiStatus, pet: this.data.pet, companion: this.data.companion, now: this.clock.now() };
  }
  emit() { this.onState(this.view()); }
  async tick() {
    await this.#handle([...this.timer.tick(), ...this.alarms.due(), ...this.offwork.tick(), ...this.#ambientDue()]);
    if (this.alarms.consumeDirty()) this.dirty = true;
    this.emit();
    if (this.dirty) await this.persist();
  }
  async command(name, payload = {}) {
    let events = [];
    if (name === 'timer:start') events = this.timer.start(payload);
    if (name === 'timer:pause') events = this.timer.pause();
    if (name === 'timer:resume') events = this.timer.resume();
    if (name === 'timer:stop') events = this.timer.stop();
    if (name === 'timer:complete') events = this.timer.complete();
    if (name === 'timer:endBreak') events = this.timer.endBreak();
    if (name === 'timer:skipBreak') events = this.timer.skipBreak();
    if (name === 'timer:updateTask') events = this.timer.updateTask(payload.task);
    if (name === 'break:continue') events = this.#continueBreak();
    if (name === 'break:switch') events = this.#switchBreak(payload.todoId);
    if (name === 'break:idle') {
      this.#requireBreakChoice();
      events = this.timer.dismissBreakChoice();
    }
    if (name === 'todo:add') this.todos.add(payload);
    if (name === 'todo:update') this.todos.update(payload.id, payload.patch);
    if (name === 'todo:remove') this.todos.remove(payload.id);
    if (name === 'todo:active') this.todos.activate(payload.id);
    if (name === 'todo:toggle') this.todos.toggle(payload.id, payload.done);
    if (name === 'todo:start') {
      const todo = this.todos.unfinishedItem(payload.id);
      if (!todo) throw new Error('todo_unavailable');
      events = this.timer.start({ task: todo.title, todoId: todo.id, focusMinutes: payload.focusMinutes, breakMinutes: payload.breakMinutes });
      this.todos.activate(todo.id);
    }
    if (name === 'alarm:add') this.alarms.add(payload);
    if (name === 'alarm:update') this.alarms.update(payload.id, payload.patch);
    if (name === 'alarm:remove') this.alarms.remove(payload.id);
    if (name === 'alarm:enabled') this.alarms.setEnabled(payload.id, payload.enabled);
    if (name === 'alarm:snooze') {
      this.alarms.snooze(payload.alarmId, payload.occurrenceId, payload.minutes || 10);
      this.activity.respondReminder(payload.occurrenceId, { type: 'snoozed', respondedAt: this.clock.now(), snoozeMinutes: payload.minutes || 10 });
    }
    if (name === 'alarm:dismiss') {
      this.alarms.dismiss(payload.alarmId, payload.occurrenceId);
      this.activity.respondReminder(payload.occurrenceId, { type: 'dismissed', respondedAt: this.clock.now() });
    }
    if (name === 'offwork:update') {
      const day = localDayKey(this.clock.now());
      const patch = this.#normalizeOffworkPatch(payload);
      const next = { ...this.offwork.state, ...patch, dayState: { ...(this.offwork.state.dayState || {}) } };
      if (Object.hasOwn(patch, 'time') && patch.time !== this.offwork.state.time) delete next.dayState[day];
      this.offwork.state = next;
    }
    if (name === 'offwork:snooze') {
      const event = this.offwork.snooze();
      this.activity.recordWorkdayEvent({ ...event, id: `offwork:snooze:${event.occurredAt}`, note: String(payload.note || '').trim() }, this.offwork.state);
    }
    if (name === 'offwork:dismiss') {
      const event = this.offwork.dismissToday();
      this.activity.recordWorkdayEvent({ ...event, id: `offwork:finish:${event.occurredAt}`, note: String(payload.note || '').trim() }, this.offwork.state);
    }
    if (name === 'settings:update') {
      const patch = Object.fromEntries(PUBLIC_SETTING_KEYS.filter((key) => Object.hasOwn(payload, key)).map((key) => [key, payload[key]]));
      this.data.settings = { ...this.data.settings, ...patch };
    }
    if (name === 'settings:mute') {
      if (typeof payload.muted !== 'boolean') throw new Error('invalid_muted_value');
      this.data.settings = { ...this.data.settings, muted: payload.muted };
    }
    if (name === 'persona:update') {
      if (Object.hasOwn(payload, 'companionEnabled')) this.data.settings.companionEnabled = Boolean(payload.companionEnabled);
      this.data.persona = normalizePersona({ ...this.data.persona, ...payload });
    }
    if (name === 'ai:test') await this.#testAi();
    if (name === 'companion:suppress') this.#setCompanionSuppressed(payload);
    if (name === 'pet:position') this.data.pet.position = payload;
    if (name === 'pet:visible') {
      this.data.pet.visible = Boolean(payload.visible);
      this.data.pet.displayMode = payload.visible ? 'full' : 'hidden';
    }
    if (name === 'pet:displayMode') {
      if (!['full', 'pet', 'timer', 'hidden'].includes(payload.mode)) throw new Error('invalid_pet_display_mode');
      this.data.pet.displayMode = payload.mode;
      this.data.pet.visible = payload.mode !== 'hidden';
    }
    if (name === 'interaction' && this.data.settings.interactions) this.#present({ category: payload.kind, kind: payload.kind, priority: PRIORITY.interaction, durableId: null, duration: 5_000 });
    await this.#handle(events); if (this.alarms.consumeDirty()) this.dirty = true; await this.persist(); this.emit(); return this.view();
  }
  async persist() {
    this.data.timer = this.timer.snapshot(); this.data.todos = this.todos.snapshot(); const alarms = this.alarms.snapshot(); this.data.alarms = alarms.alarms; this.data.ledger = alarms.ledger;
    this.data.analytics = this.activity.snapshot(); this.data.copyLast = this.copy.snapshot(); this.data.offwork = this.offwork.snapshot(); await this.store.save(this.data); this.dirty = false;
  }
  async setAiKey(value) {
    if (typeof value !== 'string' || value.length > 512) throw new Error('invalid_ai_key');
    this.data.settings.aiApiKey = value.trim();
    await this.persist();
    this.emit();
    return this.view();
  }
  async #handle(events) {
    for (const event of events) {
      if (event.type === 'focus-started') this.#present({ category: 'focusStart', kind: 'focus', priority: PRIORITY.ambient, durableId: null, duration: 6_000 });
      if (event.type === 'focus-completed') {
        this.activity.recordFinalizedInterval(event.interval, this.offwork.state);
        const todo = this.todos.recordFocus(event.todoId, event.spentMs, { completed: true, eventId: event.interval?.id });
        if (!event.celebrate) continue;
        const finalText = await this.#finalCopy('focusComplete', { task: this.timer.snapshot().task, todayCount: this.timer.snapshot().completedByDay[localDayKey(this.clock.now())] || 1 });
        this.#present({ category: 'focusComplete', kind: todo && todo.completedPomos > todo.estimatePomos ? 'annoyed' : 'reward', priority: PRIORITY.focusComplete, durableId: event.sessionId, duration: 12_000, expiresAt: this.clock.now() + 5 * 60_000, actions: { reward: true, rewardDelayMs: 3_200 }, textOverride: finalText, voiceText: finalText });
      }
      if (event.type === 'timer-stopped') {
        this.activity.recordFinalizedInterval(event.interval, this.offwork.state);
        if (event.phase === 'focus') this.todos.recordFocus(event.interval?.todoId, event.spentMs, { completed: false, eventId: event.interval?.id });
      }
      if (event.type === 'break-skipped') this.activity.recordFinalizedInterval(event.interval, this.offwork.state);
      if (event.type === 'break-started') this.#present({ category: 'break', kind: 'break', priority: PRIORITY.break, durableId: 'break:' + this.timer.state.sessionId, duration: 12_000 });
      if (event.type === 'break-completed') {
        this.activity.recordFinalizedInterval(event.interval, this.offwork.state);
        const initialContinuation = this.#breakContinuation();
        const finalText = await this.#finalCopy('breakComplete', { task: initialContinuation?.choices[0]?.title });
        const continuation = this.#breakContinuation();
        if (!continuation || continuation.createdAt !== initialContinuation?.createdAt) continue;
        this.#present({ category: 'breakComplete', kind: 'breakComplete', priority: PRIORITY.break,
          durableId: 'break-complete:' + continuation.createdAt, duration: 20_000,
          actions: { breakContinuation: true, canContinue: continuation.canContinue,
            recommendedTodoId: continuation.recommendedTodoId, choose: continuation.actions.choose, addTodo: continuation.actions.addTodo },
          textOverride: finalText, voiceText: finalText });
      }
      if (event.type === 'alarm-fired') {
        this.activity.recordReminder({
          occurrenceId: event.occurrenceId, alarmId: event.alarmId, reminderText: event.label,
          scheduledAt: event.dueAt, firedAt: this.clock.now(), muted: this.data.settings.muted,
          parentOccurrenceId: event.parentOccurrenceId || null
        }, this.offwork.state);
        const finalText = await this.#finalCopy('alarm', { label: event.label });
        const presentation = this.#present({ category: 'alarm', kind: event.pose || 'alarm', priority: PRIORITY.alarm, durableId: event.occurrenceId, occurredAt: event.dueAt, expiresAt: event.dueAt + 15 * 60_000, duration: 20_000, actions: { alarmId: event.alarmId, occurrenceId: event.occurrenceId }, label: event.label, textOverride: finalText, voiceText: finalText });
        if (presentation) this.onNotify({ category: 'alarm', occurrenceId: event.occurrenceId, title: 'Pomopet 闹钟 · ' + event.label, body: finalText });
      }
      if (event.type === 'offwork') {
        if (event.latest) this.activity.recordWorkdayEvent({ id: `offwork:latest:${event.day}`, type: 'latest_offwork_limit', occurredAt: this.clock.now() }, this.offwork.state);
        const kind = event.level === 1 ? (this.offwork.state.pose === 'fainted' ? 'fainted' : 'offwork') : 'angryStanding';
        const category = event.level === 1 ? 'offwork' : 'ignored';
        const presentation = this.#present({ category, kind,
          priority: this.offwork.state.blockMode ? PRIORITY.offworkBlocker : PRIORITY.offwork,
          durableId: 'offwork:' + event.occurrenceId, duration: 20_000,
          actions: { offwork: true, snoozeMinutes: this.offwork.state.snoozeMinutes } });
        if (presentation) this.onNotify({ category, occurrenceId: event.occurrenceId, title: 'Pomopet · 下班提醒', body: presentation.text });
      }
      if (event.type === 'ambient-companion') {
        const finalText = await this.#finalAmbientCopy(event.context);
        this.#present({ category: 'ambientCompanion', kind: event.kind, priority: PRIORITY.ambient, durableId: event.id, duration: 9_000, textOverride: finalText, voiceText: null });
      }
    }
    if (events.length) this.dirty = true;
  }
  #ambientDue() {
    if (!this.data.settings.companionEnabled || !['full', 'pet'].includes(this.data.pet.displayMode) || this.suppressionSources.size) return [];
    const now = this.clock.now();
    if (!this.data.companion.nextAmbientAt) this.#scheduleAmbient(...FREQUENCIES[this.data.persona.chatFrequency]);
    if (now < this.data.companion.nextAmbientAt) return [];
    const previousAt = this.data.companion.lastAmbientAt;
    this.data.companion.lastAmbientAt = now;
    this.#scheduleAmbient(...FREQUENCIES[this.data.persona.chatFrequency]);
    const kinds = ['pet', 'water', 'comfort'];
    const timer = this.timer.snapshot(); const hour = new Date(now).getHours();
    const timeOfDay = hour < 11 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : '晚上';
    const currentActivity = ['running', 'paused'].includes(timer.status)
      ? `${timer.phase === 'focus' ? '专注' : '休息'}${timer.task ? `：${timer.task}` : ''}`
      : '暂时没有计时任务';
    const petAction = kinds[Math.floor(this.#random() * kinds.length)];
    const plannedMs = timer.phase === 'break' ? timer.breakMs : timer.focusMs;
    const remainingMs = ['running', 'paused'].includes(timer.status) ? this.timer.remaining() : null;
    return [{ type: 'ambient-companion', id: 'ambient:' + now, kind: petAction,
      context: { currentActivity, timeOfDay, minutesSinceLastChat: previousAt ? Math.round((now - previousAt) / 60_000) : null,
        petAction, timerStatus: timer.status, timerPhase: timer.phase, task: timer.task || '',
        elapsedMinutes: remainingMs == null ? null : Math.max(0, Math.round((plannedMs - remainingMs) / 60_000)),
        remainingMinutes: remainingMs == null ? null : Math.max(0, Math.ceil(remainingMs / 60_000)) } }];
  }
  #scheduleAmbient(minMinutes, maxMinutes) {
    const span = Math.max(0, maxMinutes - minMinutes);
    this.data.companion.nextAmbientAt = this.clock.now() + Math.round((minMinutes + this.#random() * span) * 60_000);
    this.dirty = true;
  }
  async #finalCopy(scene, context = {}) {
    const fallback = fallbackLine(scene, { ...context, persona: this.data.persona }, this.random);
    if (!this.#aiConfigured()) return fallback;
    const outcome = await this.#aiOutcome(this.#aiArgs(scene, context));
    return outcome.text || fallback;
  }
  async #finalAmbientCopy(context = {}) {
    const recentLines = this.data.companion.recentLines;
    let avoid = [...recentLines];
    if (this.#aiConfigured()) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const outcome = await this.#aiOutcome(this.#aiArgs('ambientCompanion', { ...context, recentLines: avoid }));
        if (!outcome.text) break;
        if (!isSimilarLine(outcome.text, recentLines)) return this.#rememberAmbient(outcome.text);
        avoid = [...avoid, outcome.text].slice(-8);
      }
    }
    const personaFallback = fallbackLine('ambientCompanion', { ...context, persona: this.data.persona }, this.random);
    const candidates = [personaFallback, ...COPY.ambientCompanion.map((line) => line.text)];
    const fallback = candidates.find((line) => !isSimilarLine(line, recentLines)) || personaFallback;
    return this.#rememberAmbient(fallback);
  }
  #rememberAmbient(text) {
    this.data.companion.recentLines = [...this.data.companion.recentLines, text].slice(-8);
    this.dirty = true;
    return text;
  }
  #aiArgs(scene, context = {}) {
    return {
      apiKey: this.data.settings.aiApiKey, scene, tone: this.data.settings.aiTone || 'random', persona: this.data.persona, ...context
    };
  }
  #aiConfigured() { return Boolean(this.data.settings.aiCopyEnabled && String(this.data.settings.aiApiKey || '').trim()); }
  async #aiOutcome(args) {
    let timeoutId; let timedOut = false;
    const controller = new globalThis.AbortController();
    const request = Promise.resolve().then(async () => {
      try {
        if (typeof this.aiCopy.generateResult === 'function') return await this.aiCopy.generateResult({ ...args, signal: controller.signal });
        const text = await this.aiCopy.generate({ ...args, signal: controller.signal });
        return { text: text || null, errorCode: text ? null : 'empty_response' };
      } catch {
        return { text: null, errorCode: 'request_failed' };
      }
    });
    const timeout = new Promise((resolve) => { timeoutId = setTimeout(() => { timedOut = true; resolve({ text: null, errorCode: 'timeout' }); controller.abort(); }, this.aiDeadlineMs); });
    let outcome = await Promise.race([request, timeout]);
    clearTimeout(timeoutId);
    if (timedOut) outcome = { text: null, errorCode: 'timeout' };
    return outcome;
  }
  async #testAi() {
    const checkedAt = this.clock.now();
    if (!this.#aiConfigured()) {
      this.aiStatus = { status: 'builtin', sample: null, errorCode: null, checkedAt };
      return;
    }
    const outcome = await this.#aiOutcome(this.#aiArgs('ambientCompanion'));
    this.aiStatus = outcome.text
      ? { status: 'connected', sample: outcome.text, errorCode: null, checkedAt }
      : { status: 'failed', sample: null, errorCode: outcome.errorCode || 'request_failed', checkedAt };
  }
  #setCompanionSuppressed({ source, active }) {
    const key = String(source || '').trim();
    if (!key) return;
    const wasSuppressed = this.suppressionSources.size > 0;
    if (active) this.suppressionSources.add(key);
    else this.suppressionSources.delete(key);
    if (wasSuppressed && !this.suppressionSources.size) this.#scheduleAmbient(5, 10);
  }
  #breakContinuation() {
    const pending = this.timer.snapshot().pendingBreakChoice;
    if (!pending) return null;
    const choices = this.todos.orderedUnfinished({ preferredId: this.todos.snapshot().activeId }).map((todo) => structuredClone(todo));
    const canContinue = Boolean(this.todos.unfinishedItem(pending.previousTodoId));
    const recommendedTodoId = choices[0]?.id || null;
    return { ...pending, canContinue, recommendedTodoId, choices,
      actions: { continue: canContinue, choose: choices.length > 0, idle: true, addTodo: !canContinue && choices.length === 0 } };
  }
  #requireBreakChoice() {
    const pending = this.timer.snapshot().pendingBreakChoice;
    if (!pending) throw new Error('break_choice_required');
    return pending;
  }
  #continueBreak() {
    const pending = this.#requireBreakChoice();
    const todo = this.todos.unfinishedItem(pending.previousTodoId);
    if (!todo) throw new Error('todo_unavailable');
    return this.timer.start({ task: todo.title, todoId: todo.id, focusMinutes: pending.focusMinutes, breakMinutes: pending.breakMinutes });
  }
  #switchBreak(todoId) {
    const pending = this.#requireBreakChoice();
    const todo = this.todos.orderedUnfinished().find((item) => item.id === todoId);
    if (!todo) throw new Error('todo_unavailable');
    this.todos.activate(todo.id);
    return this.timer.start({ task: todo.title, todoId: todo.id, focusMinutes: pending.focusMinutes, breakMinutes: pending.breakMinutes });
  }
  #random() {
    const value = Number(this.random());
    return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
  }
  #normalizeOffworkPatch(payload) {
    const patch = { ...payload };
    for (const key of ['workStart', 'time', 'latestTime']) {
      if (!Object.hasOwn(patch, key)) continue;
      const match = String(patch[key] || '').match(TIME_PATTERN);
      patch[key] = match ? `${match[1]}:${match[2]}` : this.offwork.state[key];
    }
    if (Object.hasOwn(patch, 'exclusions')) patch.exclusions = (Array.isArray(patch.exclusions) ? patch.exclusions : [])
      .filter((item) => TIME_PATTERN.test(String(item?.start || '')) && TIME_PATTERN.test(String(item?.end || '')) && item.start < item.end)
      .map((item) => ({ start: item.start, end: item.end, label: String(item.label || '排除时段').slice(0, 20) }));
    if (Object.hasOwn(patch, 'enabled')) patch.enabled = Boolean(patch.enabled);
    if (Object.hasOwn(patch, 'blockMode')) patch.blockMode = Boolean(patch.blockMode);
    if (Object.hasOwn(patch, 'escalateMinutes')) patch.escalateMinutes = Math.min(120, Math.max(5, Number(patch.escalateMinutes) || this.offwork.state.escalateMinutes));
    if (Object.hasOwn(patch, 'snoozeMinutes')) patch.snoozeMinutes = Math.min(120, Math.max(5, Number(patch.snoozeMinutes) || this.offwork.state.snoozeMinutes));
    if (Object.hasOwn(patch, 'weekdays')) {
      const days = [...new Set((patch.weekdays || []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
      patch.weekdays = days.length ? days : this.offwork.state.weekdays;
    }
    return patch;
  }
  #present(input) {
    const { textOverride, ...rest } = input;
    const line = textOverride ? { text: textOverride, emotion: 'cute' } : this.copy.pick(input.category);
    if (rest.voiceText) line.voice = null;
    const presentation = { ...rest, ...line, voiceText: rest.voiceText || null, createdAt: this.clock.now() };
    const result = this.presentations.enqueue(presentation); if (!result.accepted) return null;
    if (!this.active || result.interrupted) this.#showCurrent();
    return presentation;
  }
  #showCurrent() {
    clearTimeout(this.activeTimeout); this.active = this.presentations.current; if (!this.active) return;
    this.onPresentation(this.active); this.activeTimeout = setTimeout(() => { this.presentations.complete(); this.active = null; this.#showCurrent(); }, this.active.duration);
  }
}
