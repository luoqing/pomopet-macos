import { localDayKey } from './time.js';

export const defaultOffwork = () => ({ enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', snoozeMinutes: 15, escalateMinutes: 15, allowAnnoyed: true, dayState: {} });

export class OffworkScheduler {
  constructor(clock, state = defaultOffwork()) { this.clock = clock; this.state = structuredClone(state); }
  tick() {
    if (!this.state.enabled) return []; const now = new Date(this.clock.now()); const day = localDayKey(now.getTime());
    if (!this.state.weekdays.includes(now.getDay())) return [];
    const [hour, minute] = this.state.time.split(':').map(Number); const due = new Date(now); due.setHours(hour, minute, 0, 0);
    const record = this.state.dayState[day] || {}; if (record.dismissed || now < due) return [];
    if (record.snoozedUntil && this.clock.now() < record.snoozedUntil) return [];
    if (!record.firstAt) { this.state.dayState[day] = { firstAt: this.clock.now(), level: 1 }; return [{ type: 'offwork', level: 1, day }]; }
    if (record.level === 1 && this.state.allowAnnoyed && this.clock.now() - record.firstAt >= this.state.escalateMinutes * 60_000) { record.level = 2; return [{ type: 'offwork', level: 2, day }]; }
    return [];
  }
  snooze() {
    const day = localDayKey(this.clock.now()); const record = this.state.dayState[day] || {};
    record.snoozedUntil = this.clock.now() + this.state.snoozeMinutes * 60_000; delete record.firstAt; record.level = 0;
    this.state.dayState[day] = record;
  }
  dismissToday() { const day = localDayKey(this.clock.now()); this.state.dayState[day] = { ...(this.state.dayState[day] || {}), dismissed: true }; }
  snapshot() { return structuredClone(this.state); }
}
