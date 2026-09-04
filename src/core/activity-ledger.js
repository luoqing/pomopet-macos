import { localDayKey } from './time.js';

export const createActivityState = () => ({ schemaVersion: 1, days: {}, appliedEventIds: {} });

const clone = (value) => structuredClone(value);
const validTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
const dayStart = (timestamp) => { const value = new Date(timestamp); value.setHours(0, 0, 0, 0); return value.getTime(); };
const nextDayStart = (timestamp) => { const value = new Date(dayStart(timestamp)); value.setDate(value.getDate() + 1); return value.getTime(); };
const atLocalTime = (timestamp, value, fallback = '10:00') => {
  const source = validTime(value) ? value : fallback;
  const [hour, minute] = source.split(':').map(Number);
  const date = new Date(timestamp); date.setHours(hour, minute, 0, 0); return date.getTime();
};

function normalizedExclusions(timestamp, exclusions = []) {
  const ranges = exclusions
    .filter(({ start, end }) => validTime(start) && validTime(end))
    .map(({ start, end, label = '排除时段' }) => ({ startedAt: atLocalTime(timestamp, start), endedAt: atLocalTime(timestamp, end), labels: [label] }))
    .filter(({ startedAt, endedAt }) => startedAt < endedAt)
    .sort((left, right) => left.startedAt - right.startedAt);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.startedAt <= previous.endedAt) {
      previous.endedAt = Math.max(previous.endedAt, range.endedAt);
      previous.labels.push(...range.labels);
    } else merged.push({ ...range });
  }
  return merged.map((range) => ({ ...range, label: [...new Set(range.labels)].join(' / ') }));
}

export class ActivityLedger {
  constructor(state = createActivityState()) {
    this.state = { ...createActivityState(), ...clone(state || {}), days: clone(state?.days || {}), appliedEventIds: clone(state?.appliedEventIds || {}) };
  }

  snapshot() { return clone(this.state); }

  ensureDay(timestamp, workRules = {}) {
    const date = localDayKey(timestamp);
    if (this.state.days[date]) return this.state.days[date];
    const day = { date, rangeStartAt: atLocalTime(timestamp, workRules.workStart), intervals: [], reminderOccurrences: [], workdayEvents: [] };
    for (const exclusion of normalizedExclusions(timestamp, workRules.exclusions)) {
      day.intervals.push({
        id: `excluded:${date}:${exclusion.startedAt}:${exclusion.endedAt}`, cycleId: null, kind: 'excluded', todoId: null,
        taskTitle: null, label: exclusion.label, plannedMs: null, startedAt: exclusion.startedAt, endedAt: exclusion.endedAt,
        segments: [{ startedAt: exclusion.startedAt, endedAt: exclusion.endedAt }], status: 'completed', completionReason: 'scheduled', unplacedActiveMs: 0
      });
    }
    this.state.days[date] = day;
    return day;
  }

  openInterval(input, workRules = {}) {
    if (!input?.id || !Number.isFinite(input.startedAt)) return null;
    const existing = this.#findInterval(input.id);
    if (existing) return clone(existing.interval);
    const day = this.ensureDay(input.startedAt, workRules);
    const interval = {
      id: `${input.id}:${day.date}:${input.kind || 'focus'}`, sourceId: input.id, cycleId: input.cycleId || input.id,
      kind: input.kind || 'focus', todoId: input.todoId || null, taskTitle: input.taskTitle || '', label: input.label || null,
      plannedMs: Number(input.plannedMs) || null, startedAt: input.startedAt, endedAt: null,
      segments: [{ startedAt: input.startedAt, endedAt: null }], status: 'running', completionReason: null,
      unplacedActiveMs: Math.max(0, Number(input.unplacedActiveMs) || 0)
    };
    day.intervals.push(interval);
    return clone(interval);
  }

  pauseInterval(id, at) {
    const found = this.#findInterval(id); if (!found || !Number.isFinite(at)) return false;
    this.#closeOpenSegment(found.interval, at); found.interval.status = 'paused'; return true;
  }

  resumeInterval(id, at) {
    const found = this.#findInterval(id); if (!found || !Number.isFinite(at) || found.interval.status !== 'paused') return false;
    found.interval.segments.push({ startedAt: at, endedAt: null }); found.interval.status = 'running'; return true;
  }

  finishInterval(id, { endedAt, status = 'completed', completionReason = 'natural', unplacedActiveMs } = {}) {
    const found = this.#findInterval(id); if (!found || !Number.isFinite(endedAt) || ['completed', 'stopped'].includes(found.interval.status)) return false;
    const source = clone(found.interval); this.#closeOpenSegment(source, endedAt);
    source.endedAt = endedAt; source.status = status; source.completionReason = completionReason;
    if (unplacedActiveMs !== undefined) source.unplacedActiveMs = Math.max(0, Number(unplacedActiveMs) || 0);
    this.#removeCycle(source.cycleId, source.kind);
    this.#storeFragments(source);
    return true;
  }

  recordFinalizedInterval(input, workRules = {}) {
    if (!input?.id || !Number.isFinite(input.endedAt) || this.state.appliedEventIds[input.id]) return false;
    const source = {
      ...clone(input),
      sourceId: input.id,
      cycleId: input.cycleId || input.id,
      segments: clone(input.segments || []),
      unplacedActiveMs: Math.max(0, Number(input.unplacedActiveMs) || 0)
    };
    this.#removeCycle(source.cycleId, source.kind);
    this.#storeFragments(source, workRules);
    this.state.appliedEventIds[input.id] = input.endedAt;
    return true;
  }

  recordReminder(input, workRules = {}) {
    if (!input?.occurrenceId || !Number.isFinite(input.firedAt) || this.#findReminder(input.occurrenceId)) return false;
    const day = this.ensureDay(input.firedAt, workRules);
    day.reminderOccurrences.push({
      occurrenceId: input.occurrenceId, alarmId: input.alarmId || null, reminderText: String(input.reminderText || ''),
      scheduledAt: Number(input.scheduledAt) || input.firedAt, firedAt: input.firedAt, muted: Boolean(input.muted),
      response: null, parentOccurrenceId: input.parentOccurrenceId || null
    });
    return true;
  }

  respondReminder(occurrenceId, response) {
    const found = this.#findReminder(occurrenceId);
    if (!found || found.response) return false;
    found.response = clone(response); return true;
  }

  recordWorkdayEvent(input, workRules = {}) {
    if (!input?.id || !Number.isFinite(input.occurredAt) || this.state.appliedEventIds[input.id]) return false;
    const day = this.ensureDay(input.occurredAt, workRules);
    day.workdayEvents.push(clone(input)); this.state.appliedEventIds[input.id] = input.occurredAt; return true;
  }

  #findInterval(id) {
    for (const day of Object.values(this.state.days)) {
      const interval = day.intervals.find((entry) => entry.sourceId === id || entry.id === id);
      if (interval) return { day, interval };
    }
    return null;
  }

  #findReminder(id) {
    for (const day of Object.values(this.state.days)) {
      const reminder = day.reminderOccurrences.find((entry) => entry.occurrenceId === id);
      if (reminder) return reminder;
    }
    return null;
  }

  #closeOpenSegment(interval, at) {
    const segment = interval.segments.at(-1);
    if (segment && segment.endedAt == null) segment.endedAt = Math.max(segment.startedAt, at);
  }

  #removeCycle(cycleId, kind) {
    for (const day of Object.values(this.state.days)) day.intervals = day.intervals.filter((entry) => entry.kind === 'excluded' || entry.cycleId !== cycleId || entry.kind !== kind);
  }

  #storeFragments(source, workRules = {}) {
    const byDay = new Map();
    for (const segment of source.segments.filter((entry) => Number.isFinite(entry.endedAt) && entry.endedAt >= entry.startedAt)) {
      let cursor = segment.startedAt;
      while (cursor < segment.endedAt) {
        const boundary = nextDayStart(cursor); const end = Math.min(boundary, segment.endedAt); const key = localDayKey(cursor);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push({ startedAt: cursor, endedAt: end }); cursor = end;
      }
    }
    const finalDay = localDayKey(source.endedAt);
    if (!byDay.size || (source.unplacedActiveMs && !byDay.has(finalDay))) byDay.set(finalDay, []);
    const keys = [...byDay.keys()].sort();
    keys.forEach((key, index) => {
      const segments = byDay.get(key); const terminal = index === keys.length - 1;
      const anchor = segments[0]?.startedAt ?? source.endedAt; const day = this.ensureDay(anchor, workRules);
      day.intervals.push({ ...source, id: `${source.sourceId}:${key}:${source.kind}`, startedAt: segments[0]?.startedAt ?? source.endedAt,
        endedAt: segments.at(-1)?.endedAt ?? source.endedAt, segments, status: terminal ? source.status : 'split',
        completionReason: terminal ? source.completionReason : null, unplacedActiveMs: terminal ? source.unplacedActiveMs : 0 });
    });
  }
}
