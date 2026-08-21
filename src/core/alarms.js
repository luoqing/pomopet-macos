const MINUTE = 60_000;
const occurrenceId = (alarmId, dueAt, suffix = '') => `${alarmId}:${dueAt}${suffix}`;

export class OccurrenceLedger {
  constructor(entries = {}) { this.entries = { ...entries }; }
  claim(id, at) { if (this.entries[id]) return false; this.entries[id] = at; return true; }
  prune(before) { for (const [id, at] of Object.entries(this.entries)) if (at < before) delete this.entries[id]; }
  snapshot() { return { ...this.entries }; }
}

export const nextRepeatingOccurrence = (alarm, after) => {
  const [hour, minute] = alarm.time.split(':').map(Number);
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + dayOffset);
    candidate.setHours(hour, minute, 0, 0);
    if (alarm.weekdays.includes(candidate.getDay()) && candidate.getTime() > after) return candidate.getTime();
  }
  return null;
};

export class AlarmScheduler {
  constructor(clock, alarms = [], ledger = new OccurrenceLedger()) { this.clock = clock; this.alarms = structuredClone(alarms); this.ledger = ledger; }
  add(input) {
    const alarm = { id: input.id || `alarm-${this.clock.now()}-${Math.random().toString(36).slice(2, 7)}`, label: input.label.trim() || '该休息一下啦',
      type: input.type, at: input.at ?? null, time: input.time ?? null, weekdays: input.weekdays ?? [], enabled: input.enabled ?? true, snoozes: [] };
    this.alarms.push(alarm); return structuredClone(alarm);
  }
  update(id, patch) { const index = this.alarms.findIndex((a) => a.id === id); if (index < 0) return null; this.alarms[index] = { ...this.alarms[index], ...structuredClone(patch) }; return structuredClone(this.alarms[index]); }
  remove(id) { this.alarms = this.alarms.filter((a) => a.id !== id); }
  setEnabled(id, enabled) { return this.update(id, { enabled }); }
  due({ graceMs = 15 * MINUTE } = {}) {
    const now = this.clock.now(); const events = [];
    for (const alarm of this.alarms) {
      if (!alarm.enabled) continue;
      const candidates = [];
      if (alarm.type === 'once' && alarm.at <= now) candidates.push({ dueAt: alarm.at, id: occurrenceId(alarm.id, alarm.at) });
      if (alarm.type === 'weekly') {
        const since = now - graceMs - MINUTE;
        let dueAt = nextRepeatingOccurrence(alarm, since);
        while (dueAt && dueAt <= now) { candidates.push({ dueAt, id: occurrenceId(alarm.id, dueAt) }); dueAt = nextRepeatingOccurrence(alarm, dueAt); }
      }
      for (const snooze of alarm.snoozes || []) if (!snooze.dismissed && snooze.dueAt <= now) candidates.push(snooze);
      for (const candidate of candidates) {
        if (now - candidate.dueAt > graceMs || !this.ledger.claim(candidate.id, now)) continue;
        events.push({ type: 'alarm-fired', alarmId: alarm.id, occurrenceId: candidate.id, dueAt: candidate.dueAt, label: alarm.label });
        if (alarm.type === 'once' && candidate.dueAt === alarm.at) alarm.enabled = false;
        if (candidate.id.includes(':snooze:')) candidate.dismissed = true;
      }
    }
    return events.sort((a, b) => a.dueAt - b.dueAt);
  }
  snooze(alarmId, originalOccurrenceId, minutes = 10) {
    const alarm = this.alarms.find((a) => a.id === alarmId); if (!alarm) return null;
    const dueAt = this.clock.now() + minutes * MINUTE;
    const snooze = { id: occurrenceId(alarmId, dueAt, `:snooze:${originalOccurrenceId}`), dueAt, dismissed: false };
    alarm.snoozes = [...(alarm.snoozes || []), snooze]; return structuredClone(snooze);
  }
  dismiss(alarmId, occurrence) {
    const alarm = this.alarms.find((a) => a.id === alarmId); if (!alarm) return;
    const snooze = (alarm.snoozes || []).find((item) => item.id === occurrence); if (snooze) snooze.dismissed = true;
  }
  nextFor(alarm, after = this.clock.now()) { if (!alarm.enabled) return null; return alarm.type === 'once' ? alarm.at : nextRepeatingOccurrence(alarm, after); }
  snapshot() { return { alarms: structuredClone(this.alarms), ledger: this.ledger.snapshot() }; }
}
