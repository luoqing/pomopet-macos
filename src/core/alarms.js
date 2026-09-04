const MINUTE = 60_000;
const occurrenceId = (alarmId, dueAt, suffix = '') => `${alarmId}:${dueAt}${suffix}`;
const recurringTypes = new Set(['weekly', 'interval']);
const scheduleFields = ['type', 'time', 'weekdays', 'startTime', 'endTime', 'intervalMinutes'];
const intervalValues = new Set([15, 30, 45, 60, 90, 120]);
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class OccurrenceLedger {
  constructor(entries = {}) { this.entries = { ...entries }; }
  has(id) { return Object.hasOwn(this.entries, id); }
  claim(id, at) { if (this.has(id)) return false; this.entries[id] = at; return true; }
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

export const nextIntervalOccurrence = (alarm, after) => {
  const start = typeof alarm?.startTime === 'string' ? alarm.startTime.match(timePattern) : null;
  const end = typeof alarm?.endTime === 'string' ? alarm.endTime.match(timePattern) : null;
  const weekdays = Array.isArray(alarm?.weekdays)
    ? alarm.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  if (!start || !end || !intervalValues.has(alarm?.intervalMinutes) || !weekdays.length) return null;
  const startHour = Number(start[1]); const startMinute = Number(start[2]);
  const endHour = Number(end[1]); const endMinute = Number(end[2]);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const intervalMinutes = alarm.intervalMinutes;
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    if (!weekdays.includes(day.getDay())) continue;
    const candidates = [];
    for (let minute = startMinutes; minute <= endMinutes; minute += intervalMinutes) {
      const candidate = new Date(day);
      candidate.setMinutes(minute);
      if (candidate.getDate() !== day.getDate() || candidate.getHours() * 60 + candidate.getMinutes() !== minute) continue;
      candidates.push(candidate.getTime());
    }
    const next = [...new Set(candidates)].sort((a, b) => a - b).find((candidate) => candidate > after);
    if (next !== undefined) return next;
  }
  return null;
};

export class AlarmScheduler {
  constructor(clock, alarms = [], ledger = new OccurrenceLedger()) { this.clock = clock; this.alarms = structuredClone(alarms); this.ledger = ledger; this.dirty = false; }
  add(input) {
    const enabled = input.enabled ?? true;
    const alarm = { id: input.id || `alarm-${this.clock.now()}-${Math.random().toString(36).slice(2, 7)}`, label: input.label.trim() || '该休息一下啦',
      type: input.type, at: input.at ?? null, time: input.time ?? null, weekdays: input.weekdays ?? [], startTime: input.startTime ?? null,
      endTime: input.endTime ?? null, intervalMinutes: input.intervalMinutes ?? null, pose: input.pose || 'alarm', enabled, snoozes: [],
      activeFrom: recurringTypes.has(input.type) && enabled ? this.clock.now() : null };
    this.alarms.push(alarm); this.dirty = true; return structuredClone(alarm);
  }
  update(id, patch) {
    const index = this.alarms.findIndex((a) => a.id === id); if (index < 0) return null;
    const previous = this.alarms[index]; const next = { ...previous, ...structuredClone(patch) };
    if (patch.enabled === false) next.snoozes = [];
    const scheduleChanged = scheduleFields.some((field) => Object.hasOwn(patch, field));
    if (recurringTypes.has(next.type) && (scheduleChanged || (patch.enabled === true && !previous.enabled))) next.activeFrom = this.clock.now();
    this.alarms[index] = next;
    this.dirty = true; return structuredClone(this.alarms[index]);
  }
  remove(id) { const next = this.alarms.filter((a) => a.id !== id); if (next.length !== this.alarms.length) this.dirty = true; this.alarms = next; }
  setEnabled(id, enabled) {
    const alarm = this.alarms.find((item) => item.id === id); if (!alarm) return null;
    if (enabled && alarm.type === 'once' && alarm.at <= this.clock.now()) return structuredClone(alarm);
    if (enabled && !alarm.enabled && recurringTypes.has(alarm.type)) alarm.activeFrom = this.clock.now();
    alarm.enabled = enabled; if (!enabled) alarm.snoozes = [];
    this.dirty = true;
    return structuredClone(alarm);
  }
  due({ graceMs = 15 * MINUTE } = {}) {
    const now = this.clock.now(); const events = [];
    for (const alarm of this.alarms) {
      const regularCandidates = [];
      if (alarm.enabled && alarm.type === 'once' && alarm.at <= now) {
        if (now - alarm.at > graceMs) { alarm.enabled = false; this.dirty = true; }
        else regularCandidates.push({ dueAt: alarm.at, id: occurrenceId(alarm.id, alarm.at) });
      }
      if (alarm.enabled && alarm.type === 'weekly') {
        const since = now - graceMs - 1;
        let dueAt = nextRepeatingOccurrence(alarm, since);
        while (dueAt && dueAt <= now) {
          if (alarm.activeFrom == null || dueAt > alarm.activeFrom) regularCandidates.push({ dueAt, id: occurrenceId(alarm.id, dueAt) });
          dueAt = nextRepeatingOccurrence(alarm, dueAt);
        }
      }
      if (alarm.enabled && alarm.type === 'interval') {
        const since = now - graceMs - 1;
        let dueAt = nextIntervalOccurrence(alarm, since);
        while (dueAt && dueAt <= now) {
          if (alarm.activeFrom == null || dueAt > alarm.activeFrom) regularCandidates.push({ dueAt, id: occurrenceId(alarm.id, dueAt) });
          dueAt = nextIntervalOccurrence(alarm, dueAt);
        }
      }
      const snoozes = alarm.snoozes || [];
      alarm.snoozes = snoozes.filter((snooze) => !snooze.dismissed && (snooze.dueAt > now || now - snooze.dueAt <= graceMs));
      if (alarm.snoozes.length !== snoozes.length) this.dirty = true;
      const latestRegular = regularCandidates.sort((a, b) => b.dueAt - a.dueAt)[0];
      const dueSnoozes = alarm.snoozes.filter((snooze) => snooze.dueAt <= now).map((snooze) => ({ ...snooze, isSnooze: true }));
      const candidates = [...(latestRegular ? [latestRegular] : []), ...dueSnoozes].sort((a, b) => b.dueAt - a.dueAt);
      for (const candidate of candidates.filter((item) => !this.ledger.has(item.id))) {
        if (!this.ledger.claim(candidate.id, now)) continue;
        this.dirty = true;
        events.push({ type: 'alarm-fired', alarmId: alarm.id, occurrenceId: candidate.id, dueAt: candidate.dueAt, label: alarm.label,
          pose: alarm.pose || 'alarm', parentOccurrenceId: candidate.parentOccurrenceId || null });
        if (alarm.type === 'once' && candidate.dueAt === alarm.at) alarm.enabled = false;
        if (candidate.isSnooze) alarm.snoozes = alarm.snoozes.filter((snooze) => snooze.id !== candidate.id);
      }
    }
    return events.sort((a, b) => a.dueAt - b.dueAt);
  }
  snooze(alarmId, originalOccurrenceId, minutes = 10) {
    const alarm = this.alarms.find((a) => a.id === alarmId); if (!alarm) return null;
    const dueAt = this.clock.now() + minutes * MINUTE;
    const snooze = { id: occurrenceId(alarmId, dueAt, `:snooze:${originalOccurrenceId}`), dueAt, dismissed: false, parentOccurrenceId: originalOccurrenceId || null };
    alarm.snoozes = [...(alarm.snoozes || []), snooze]; this.dirty = true; return structuredClone(snooze);
  }
  dismiss(alarmId, occurrence) {
    const alarm = this.alarms.find((a) => a.id === alarmId); if (!alarm) return;
    const snoozes = alarm.snoozes || []; alarm.snoozes = snoozes.filter((item) => item.id !== occurrence);
    if (alarm.snoozes.length !== snoozes.length) this.dirty = true;
  }
  nextFor(alarm, after = this.clock.now()) { if (!alarm.enabled) return null; if (alarm.type === 'once') return alarm.at; return alarm.type === 'interval' ? nextIntervalOccurrence(alarm, after) : nextRepeatingOccurrence(alarm, after); }
  consumeDirty() { const dirty = this.dirty; this.dirty = false; return dirty; }
  snapshot() { return { alarms: structuredClone(this.alarms), ledger: this.ledger.snapshot() }; }
}
