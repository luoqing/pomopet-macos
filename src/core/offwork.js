import { localDayKey } from './time.js';

export const defaultOffwork = () => ({ enabled: true, workStart: '10:00', time: '18:30', latestTime: '22:30',
  exclusions: [{ start: '12:00', end: '14:00', label: '午休' }, { start: '18:00', end: '19:00', label: '晚餐' }],
  weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 10, escalateMinutes: 15, allowAnnoyed: true, dayState: {} });

function atTime(now, value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  const due = new Date(now); due.setHours(hour, minute, 0, 0); return due.getTime();
}

export class OffworkScheduler {
  constructor(clock, state = defaultOffwork()) { this.clock = clock; this.state = structuredClone(state); }
  tick() {
    if (!this.state.enabled) return []; const now = new Date(this.clock.now()); const day = localDayKey(now.getTime());
    if (!this.state.weekdays.includes(now.getDay())) return [];
    const dueAt = atTime(now, this.state.time); const latestAt = atTime(now, this.state.latestTime || '22:30');
    const record = this.state.dayState[day] || {}; if (record.dismissed || this.clock.now() < dueAt) return [];
    if (record.snoozedUntil && this.clock.now() < record.snoozedUntil) return [];
    if (this.clock.now() >= latestAt && !record.latestAt) {
      const occurrenceId = `${day}:${latestAt}:latest`;
      this.state.dayState[day] = { ...record, firstAt: record.firstAt || this.clock.now(), level: 2, latestAt: this.clock.now(), occurrenceId };
      return [{ type: 'offwork', level: 2, latest: true, day, occurrenceId }];
    }
    if (!record.firstAt) {
      const occurrenceAt = record.snoozedUntil || dueAt;
      const occurrenceId = `${day}:${occurrenceAt}:1`;
      this.state.dayState[day] = { firstAt: this.clock.now(), level: 1, occurrenceId };
      return [{ type: 'offwork', level: 1, day, occurrenceId }];
    }
    if (record.level === 1 && this.state.allowAnnoyed && this.clock.now() - record.firstAt >= this.state.escalateMinutes * 60_000) {
      record.level = 2;
      return [{ type: 'offwork', level: 2, day, occurrenceId: `${day}:${record.firstAt}:2` }];
    }
    return [];
  }
  snooze() {
    const day = localDayKey(this.clock.now()); const record = this.state.dayState[day] || {};
    const latestAt = atTime(this.clock.now(), this.state.latestTime || '22:30');
    record.snoozedUntil = Math.min(this.clock.now() + this.state.snoozeMinutes * 60_000, latestAt); delete record.firstAt; record.level = 0;
    this.state.dayState[day] = record;
    return { type: 'offwork_snoozed', occurredAt: this.clock.now(), snoozedUntil: record.snoozedUntil };
  }
  dismissToday() {
    const day = localDayKey(this.clock.now()); this.state.dayState[day] = { ...(this.state.dayState[day] || {}), dismissed: true };
    return { type: 'offwork_finished', occurredAt: this.clock.now() };
  }
  snapshot() { return structuredClone(this.state); }
}
