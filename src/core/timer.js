import { localDayKey } from './time.js';

const SECOND = 1000;
const newId = (now) => `focus-${now}-${Math.random().toString(36).slice(2, 8)}`;

export const createTimerState = () => ({
  status: 'idle', phase: 'focus', sessionId: null, task: '',
  focusMs: 25 * 60 * SECOND, breakMs: 5 * 60 * SECOND,
  startedAt: null, targetAt: null, remainingMs: 25 * 60 * SECOND,
  completionClaimed: false, completedByDay: {}
});

export class TimerEngine {
  constructor(clock, state = createTimerState()) { this.clock = clock; this.state = structuredClone(state); }

  snapshot() { return structuredClone(this.state); }

  start({ task = '', focusMinutes = 25, breakMinutes = 5 } = {}) {
    if (!['idle', 'stopped'].includes(this.state.status)) throw new Error('timer_already_running');
    const now = this.clock.now();
    const focusMs = Math.max(1, focusMinutes) * 60 * SECOND;
    this.state = { ...this.state, status: 'running', phase: 'focus', sessionId: newId(now), task: task.trim(),
      focusMs, breakMs: Math.max(1, breakMinutes) * 60 * SECOND, startedAt: now, targetAt: now + focusMs,
      remainingMs: focusMs, completionClaimed: false };
    return [{ type: 'focus-started', sessionId: this.state.sessionId }];
  }

  pause() {
    if (this.state.status !== 'running') return [];
    this.state.remainingMs = Math.max(0, this.state.targetAt - this.clock.now());
    this.state.targetAt = null;
    this.state.status = 'paused';
    return [{ type: 'timer-paused', phase: this.state.phase }];
  }

  resume() {
    if (this.state.status !== 'paused') return [];
    this.state.targetAt = this.clock.now() + this.state.remainingMs;
    this.state.status = 'running';
    return [{ type: 'timer-resumed', phase: this.state.phase }];
  }

  stop() {
    if (this.state.status === 'idle') return [];
    this.state = { ...this.state, status: 'stopped', phase: 'focus', sessionId: null, targetAt: null,
      startedAt: null, remainingMs: this.state.focusMs, completionClaimed: false };
    return [{ type: 'timer-stopped' }];
  }

  complete() {
    if (this.state.phase !== 'focus' || !['running', 'paused'].includes(this.state.status)) return [];
    return this.#finishFocus(this.clock.now(), false);
  }

  skipBreak() {
    if (this.state.phase !== 'break') return [];
    this.#toIdle();
    return [{ type: 'break-skipped' }];
  }

  tick({ recovery = false } = {}) {
    if (this.state.status !== 'running' || this.state.targetAt > this.clock.now()) return [];
    if (this.state.phase === 'focus') return this.#finishFocus(this.state.targetAt, recovery);
    this.#toIdle();
    return [{ type: 'break-completed' }];
  }

  remaining() {
    if (this.state.status === 'running') return Math.max(0, this.state.targetAt - this.clock.now());
    return this.state.remainingMs;
  }

  #finishFocus(completedAt, recovery) {
    if (this.state.completionClaimed) return [];
    this.state.completionClaimed = true;
    const day = localDayKey(completedAt);
    this.state.completedByDay[day] = (this.state.completedByDay[day] || 0) + 1;
    const lateMs = Math.max(0, this.clock.now() - completedAt);
    const celebrate = !recovery || lateMs <= 15 * 60 * SECOND;
    const event = { type: 'focus-completed', sessionId: this.state.sessionId, completedAt, celebrate, recovered: recovery };
    if (recovery) this.#toIdle();
    else {
      this.state.status = 'running'; this.state.phase = 'break'; this.state.startedAt = this.clock.now();
      this.state.targetAt = this.clock.now() + this.state.breakMs; this.state.remainingMs = this.state.breakMs;
    }
    return [event, ...(recovery ? [] : [{ type: 'break-started' }])];
  }

  #toIdle() {
    this.state = { ...this.state, status: 'idle', phase: 'focus', sessionId: null, startedAt: null,
      targetAt: null, remainingMs: this.state.focusMs, completionClaimed: false };
  }
}
