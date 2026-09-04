import { localDayKey } from './time.js';

const SECOND = 1000;
const newId = (now) => `focus-${now}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeMinutes = (value, fallback, maximum) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(1, numeric)) : fallback;
};

export const createTimerState = () => ({
  status: 'idle', phase: 'focus', sessionId: null, task: '', todoId: null,
  focusMs: 25 * 60 * SECOND, breakMs: 5 * 60 * SECOND,
  startedAt: null, targetAt: null, remainingMs: 25 * 60 * SECOND,
  phaseStartedAt: null, activeSegments: [], unplacedActiveMs: 0,
  completionClaimed: false, completedByDay: {}, pendingBreakChoice: null
});

export class TimerEngine {
  constructor(clock, state = createTimerState()) {
    this.clock = clock;
    const restored = structuredClone(state);
    const hasSegments = Array.isArray(restored.activeSegments);
    this.state = {
      ...createTimerState(), ...restored,
      completedByDay: structuredClone(restored.completedByDay || {}),
      activeSegments: hasSegments ? restored.activeSegments : [],
      unplacedActiveMs: hasSegments ? Math.max(0, Number(restored.unplacedActiveMs) || 0) : this.#legacyElapsed(restored)
    };
  }

  snapshot() { return structuredClone(this.state); }

  start({ task = '', todoId = null, focusMinutes = 25, breakMinutes = 5 } = {}) {
    if (!['idle', 'stopped'].includes(this.state.status)) throw new Error('timer_already_running');
    const now = this.clock.now();
    const normalizedFocus = normalizeMinutes(focusMinutes, 25, 180);
    const normalizedBreak = normalizeMinutes(breakMinutes, 5, 60);
    const focusMs = normalizedFocus * 60 * SECOND;
    this.state = { ...this.state, status: 'running', phase: 'focus', sessionId: newId(now), task: task.trim(), todoId,
      focusMs, breakMs: normalizedBreak * 60 * SECOND, startedAt: now, targetAt: now + focusMs,
      remainingMs: focusMs, phaseStartedAt: now, activeSegments: [{ startedAt: now, endedAt: null }],
      unplacedActiveMs: 0, completionClaimed: false, pendingBreakChoice: null };
    return [{ type: 'focus-started', sessionId: this.state.sessionId }];
  }

  updateTask(task = '') {
    this.state = { ...this.state, task: String(task).trim() };
    return [];
  }

  pause() {
    if (this.state.status !== 'running') return [];
    const now = this.clock.now();
    this.state.remainingMs = Math.max(0, this.state.targetAt - now);
    this.#closeActiveSegment(now);
    this.state.targetAt = null;
    this.state.status = 'paused';
    return [{ type: 'timer-paused', phase: this.state.phase }];
  }

  resume() {
    if (this.state.status !== 'paused') return [];
    const now = this.clock.now();
    this.state.targetAt = now + this.state.remainingMs;
    this.state.activeSegments.push({ startedAt: now, endedAt: null });
    this.state.status = 'running';
    return [{ type: 'timer-resumed', phase: this.state.phase }];
  }

  stop() {
    if (!['running', 'paused'].includes(this.state.status)) return [];
    const now = this.clock.now();
    this.#closeActiveSegment(now);
    const phase = this.state.phase;
    const spentMs = this.#spentMs();
    const interval = this.#interval('stopped', 'stopped', now);
    this.state = { ...this.state, status: 'stopped', phase: 'focus', sessionId: null, todoId: null, targetAt: null,
      startedAt: null, phaseStartedAt: null, activeSegments: [], unplacedActiveMs: 0,
      remainingMs: this.state.focusMs, completionClaimed: false, pendingBreakChoice: null };
    return [{ type: 'timer-stopped', phase, spentMs, interval }];
  }

  complete() {
    if (this.state.phase !== 'focus' || !['running', 'paused'].includes(this.state.status)) return [];
    return this.#finishFocus(this.clock.now(), false, 'early');
  }

  endBreak() {
    if (this.state.phase !== 'break' || !['running', 'paused'].includes(this.state.status)) return [];
    return this.#finishBreak(this.clock.now(), 'early');
  }

  skipBreak() {
    if (this.state.phase !== 'break' || !['running', 'paused'].includes(this.state.status)) return [];
    const now = this.clock.now();
    this.#closeActiveSegment(now);
    const interval = this.#interval('stopped', 'stopped', now);
    this.#toIdle();
    return [{ type: 'break-skipped', interval }];
  }

  dismissBreakChoice() {
    this.state.pendingBreakChoice = null;
    return [];
  }

  tick({ recovery = false } = {}) {
    if (this.state.status !== 'running' || this.state.targetAt > this.clock.now()) return [];
    if (this.state.phase === 'focus') return this.#finishFocus(this.state.targetAt, recovery, 'natural');
    return this.#finishBreak(this.state.targetAt, 'natural');
  }

  remaining() {
    if (this.state.status === 'running') return Math.max(0, this.state.targetAt - this.clock.now());
    return this.state.remainingMs;
  }

  #finishFocus(completedAt, recovery, completionReason) {
    if (this.state.completionClaimed) return [];
    this.state.completionClaimed = true;
    this.#closeActiveSegment(completedAt);
    const day = localDayKey(completedAt);
    this.state.completedByDay[day] = (this.state.completedByDay[day] || 0) + 1;
    const lateMs = Math.max(0, this.clock.now() - completedAt);
    const celebrate = !recovery || lateMs <= 15 * 60 * SECOND;
    const spentMs = this.#spentMs();
    const interval = this.#interval('completed', completionReason, completedAt);
    const event = { type: 'focus-completed', sessionId: this.state.sessionId, todoId: this.state.todoId, task: this.state.task,
      spentMs, completedAt, completionReason, celebrate, recovered: recovery, interval };
    if (recovery) this.#toIdle();
    else {
      const now = this.clock.now();
      this.state.status = 'running'; this.state.phase = 'break'; this.state.startedAt = now; this.state.phaseStartedAt = now;
      this.state.targetAt = now + this.state.breakMs; this.state.remainingMs = this.state.breakMs;
      this.state.activeSegments = [{ startedAt: now, endedAt: null }]; this.state.unplacedActiveMs = 0;
    }
    return [event, ...(recovery ? [] : [{ type: 'break-started' }])];
  }

  #finishBreak(completedAt, completionReason) {
    this.#closeActiveSegment(completedAt);
    const interval = this.#interval('completed', completionReason, completedAt);
    const pendingBreakChoice = {
      previousTodoId: this.state.todoId,
      focusMinutes: this.state.focusMs / (60 * SECOND),
      breakMinutes: this.state.breakMs / (60 * SECOND),
      createdAt: this.clock.now()
    };
    this.#toIdle();
    this.state.pendingBreakChoice = pendingBreakChoice;
    return [{ type: 'break-completed', completionReason, interval }];
  }

  #closeActiveSegment(endedAt) {
    const segment = this.state.activeSegments.at(-1);
    if (segment && segment.endedAt == null) segment.endedAt = Math.max(segment.startedAt, endedAt);
  }

  #spentMs() {
    return this.state.unplacedActiveMs + this.state.activeSegments.reduce((total, segment) =>
      total + Math.max(0, Number(segment.endedAt ?? this.clock.now()) - Number(segment.startedAt)), 0);
  }

  #interval(status, completionReason, endedAt) {
    return {
      id: `${this.state.sessionId}:${this.state.phase}`,
      cycleId: this.state.sessionId,
      kind: this.state.phase,
      todoId: this.state.todoId,
      taskTitle: this.state.task,
      plannedMs: this.state.phase === 'focus' ? this.state.focusMs : this.state.breakMs,
      startedAt: this.state.phaseStartedAt ?? this.state.startedAt ?? endedAt,
      endedAt,
      segments: structuredClone(this.state.activeSegments),
      status,
      completionReason,
      unplacedActiveMs: this.state.unplacedActiveMs
    };
  }

  #legacyElapsed(state) {
    if (!['running', 'paused'].includes(state.status)) return 0;
    const total = state.phase === 'break' ? Number(state.breakMs) : Number(state.focusMs);
    const remaining = state.status === 'running' && Number.isFinite(Number(state.targetAt))
      ? Math.max(0, Number(state.targetAt) - this.clock.now())
      : Number(state.remainingMs) || 0;
    return Math.min(total, Math.max(0, total - remaining));
  }

  #toIdle() {
    this.state = { ...this.state, status: 'idle', phase: 'focus', sessionId: null, todoId: null, startedAt: null,
      targetAt: null, phaseStartedAt: null, activeSegments: [], unplacedActiveMs: 0,
      remainingMs: this.state.focusMs, completionClaimed: false };
  }
}
