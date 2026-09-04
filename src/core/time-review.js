function localDayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayStart(dayKey) {
  return new Date(`${dayKey}T00:00:00`).getTime();
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedSegments(interval, rangeStart, rangeEnd) {
  return (interval.segments ?? []).flatMap((segment) => {
    const startedAt = clamp(Number(segment.startedAt), rangeStart, rangeEnd);
    const endedAt = clamp(Number(segment.endedAt), rangeStart, rangeEnd);
    return endedAt > startedAt ? [{ startedAt, endedAt }] : [];
  });
}

function overlapMs(left, right) {
  return Math.max(0, Math.min(left.endedAt, right.endedAt) - Math.max(left.startedAt, right.startedAt));
}

function resolveRangeEnd(day, now) {
  const finalEvents = (day.workdayEvents ?? []).filter((event) =>
    event.type === 'offwork_finished' || event.type === 'latest_offwork_limit');
  if (finalEvents.length) return Math.max(...finalEvents.map((event) => Number(event.occurredAt)));
  if (day.date === localDayKey(now)) return now;

  const intervalEnds = (day.intervals ?? []).flatMap((interval) =>
    (interval.segments ?? []).map((segment) => Number(segment.endedAt)).filter(Number.isFinite));
  const reminderTimes = (day.reminderOccurrences ?? []).map((item) => Number(item.firedAt)).filter(Number.isFinite);
  return Math.max(Number(day.rangeStartAt) || dayStart(day.date), ...intervalEnds, ...reminderTimes);
}

function currentIntervalForDay(currentTimer, dayKey, now) {
  if (!currentTimer || !['running', 'paused'].includes(currentTimer.status)) return null;
  const start = dayStart(dayKey);
  const end = start + 24 * 60 * 60 * 1000;
  if (Number(currentTimer.startedAt) >= end || now <= start) return null;
  return {
    id: `${currentTimer.sessionId ?? 'current'}:${currentTimer.phase}`,
    cycleId: currentTimer.sessionId ?? 'current',
    kind: currentTimer.phase,
    todoId: currentTimer.todoId ?? null,
    taskTitle: currentTimer.task ?? '',
    segments: (currentTimer.activeSegments ?? []).map((segment) => ({
      startedAt: segment.startedAt,
      endedAt: segment.endedAt ?? (currentTimer.status === 'running' ? now : segment.startedAt)
    })),
    startedAt: currentTimer.startedAt,
    endedAt: now,
    status: currentTimer.status,
    completionReason: null,
    unplacedActiveMs: localDayKey(now) === dayKey ? (Number(currentTimer.unplacedActiveMs) || 0) : 0,
    preview: true
  };
}

function classifyTimeline(intervals, rangeStart, rangeEnd) {
  const candidates = intervals.flatMap((interval) =>
    normalizedSegments(interval, rangeStart, rangeEnd).map((segment) => ({ ...segment, interval })));
  const boundaries = [...new Set([rangeStart, rangeEnd, ...candidates.flatMap((item) => [item.startedAt, item.endedAt])])]
    .sort((left, right) => left - right);
  const priority = { excluded: 3, focus: 2, break: 1 };
  const timeline = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startedAt = boundaries[index];
    const endedAt = boundaries[index + 1];
    if (endedAt <= startedAt) continue;
    const active = candidates
      .filter((item) => item.startedAt < endedAt && item.endedAt > startedAt)
      .sort((left, right) => (priority[right.interval.kind] ?? 0) - (priority[left.interval.kind] ?? 0));
    const interval = active[0]?.interval;
    timeline.push({
      startedAt,
      endedAt,
      kind: interval?.kind ?? 'unrecorded',
      todoId: interval?.todoId ?? null,
      taskTitle: interval?.taskTitle ?? ''
    });
  }
  return timeline;
}

function aggregateTasks(timeline, intervals) {
  const tasks = new Map();
  const add = (key, title, ms) => {
    if (!ms) return;
    const previous = tasks.get(key) ?? { key, title, ms: 0 };
    previous.ms += ms;
    tasks.set(key, previous);
  };
  for (const item of timeline.filter((entry) => entry.kind === 'focus')) {
    const key = item.todoId || 'unassigned';
    add(key, key === 'unassigned' ? '未关联任务' : (item.taskTitle || '未命名任务'), item.endedAt - item.startedAt);
  }
  for (const interval of intervals.filter((item) => item.kind === 'focus')) {
    const key = interval.todoId || 'unassigned';
    add(key, key === 'unassigned' ? '未关联任务' : (interval.taskTitle || '未命名任务'), Number(interval.unplacedActiveMs) || 0);
  }
  return [...tasks.values()].sort((left, right) => right.ms - left.ms);
}

export function reviewDay(sourceDay, { now = Date.now(), currentTimer = null } = {}) {
  const day = sourceDay ?? { date: localDayKey(now) };
  const rangeStartAt = Number(day.rangeStartAt) || dayStart(day.date);
  const current = currentIntervalForDay(currentTimer, day.date, now);
  const currentRangeEnd = current ? Math.min(now, dayStart(day.date) + 24 * 60 * 60 * 1000) : rangeStartAt;
  const rangeEndAt = Math.max(rangeStartAt, resolveRangeEnd(day, now), currentRangeEnd);
  const intervals = [...(day.intervals ?? []), ...(current ? [current] : [])];
  const timeline = classifyTimeline(intervals, rangeStartAt, rangeEndAt);
  const sum = (kind) => timeline
    .filter((item) => item.kind === kind)
    .reduce((total, item) => total + item.endedAt - item.startedAt, 0);
  const unplacedMs = intervals.reduce((total, interval) => total + (Number(interval.unplacedActiveMs) || 0), 0);
  const excludedSegments = intervals
    .filter((interval) => interval.kind === 'excluded')
    .flatMap((interval) => normalizedSegments(interval, rangeStartAt, rangeEndAt));
  const restTimeWorkMs = intervals
    .filter((interval) => interval.kind === 'focus')
    .flatMap((interval) => normalizedSegments(interval, rangeStartAt, rangeEndAt))
    .reduce((total, focus) => total + excludedSegments.reduce((sumValue, excluded) => sumValue + overlapMs(focus, excluded), 0), 0);
  const pausedMs = intervals
    .filter((interval) => ['focus', 'break'].includes(interval.kind) && interval.endedAt > interval.startedAt)
    .reduce((total, interval) => {
      const activeMs = (interval.segments ?? []).reduce((sumValue, item) =>
        sumValue + Math.max(0, Number(item.endedAt ?? now) - Number(item.startedAt)), 0);
      return total + Math.max(0, Number(interval.endedAt) - Number(interval.startedAt) - activeMs);
    }, 0);

  const remindersByText = new Map();
  const reminderBuckets = {};
  for (const occurrence of day.reminderOccurrences ?? []) {
    const text = occurrence.reminderText || '未命名提醒';
    const item = remindersByText.get(text) ?? { text, count: 0, dismissed: 0, snoozed: 0 };
    item.count += 1;
    if (occurrence.response?.type === 'dismissed') item.dismissed += 1;
    if (occurrence.response?.type === 'snoozed') item.snoozed += 1;
    remindersByText.set(text, item);
    const fired = new Date(occurrence.firedAt);
    const bucket = `${String(fired.getHours()).padStart(2, '0')}:${fired.getMinutes() < 30 ? '00' : '30'}`;
    reminderBuckets[bucket] = (reminderBuckets[bucket] ?? 0) + 1;
  }

  const terminalFocus = intervals.filter((interval) =>
    interval.kind === 'focus' && interval.status !== 'running' && interval.status !== 'paused' && !interval.preview);
  const counts = { natural: 0, early: 0, stopped: 0 };
  for (const interval of terminalFocus) {
    const reason = interval.completionReason;
    if (reason in counts) counts[reason] += 1;
  }
  const workdayEvents = day.workdayEvents ?? [];
  const finalEvents = workdayEvents.filter((event) =>
    event.type === 'offwork_finished' || event.type === 'latest_offwork_limit');

  return {
    date: day.date,
    rangeStartAt,
    rangeEndAt,
    actualOffworkAt: finalEvents.length ? Math.max(...finalEvents.map((event) => Number(event.occurredAt))) : null,
    extensionCount: workdayEvents.filter((event) => event.type === 'offwork_snoozed').length,
    totals: {
      focusMs: sum('focus') + unplacedMs,
      breakMs: sum('break'),
      excludedMs: sum('excluded'),
      unrecordedMs: sum('unrecorded'),
      pausedMs,
      unplacedMs
    },
    counts,
    restTimeWorkMs,
    tasks: aggregateTasks(timeline, intervals),
    reminders: [...remindersByText.values()].sort((left, right) => right.count - left.count),
    reminderBuckets,
    timeline
  };
}

export function reviewRecentDays({ analytics = {}, now = Date.now(), days = 7, currentTimer = null, workStart = '10:00' } = {}) {
  const cursor = new Date(now);
  const result = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dayKey = localDayKey(cursor.getTime());
    const isToday = dayKey === localDayKey(now);
    const [hours, minutes] = workStart.split(':').map(Number);
    const configuredStart = dayStart(dayKey) + (hours * 60 + minutes) * 60 * 1000;
    const currentStartedToday = currentTimer && localDayKey(currentTimer.startedAt) === dayKey;
    const source = analytics.days?.[dayKey] ?? {
      date: dayKey,
      rangeStartAt: currentStartedToday
        ? Number(currentTimer.startedAt)
        : (isToday ? Math.min(now, configuredStart) : dayStart(dayKey)),
      intervals: [],
      reminderOccurrences: [],
      workdayEvents: []
    };
    result.push(reviewDay(source, { now, currentTimer }));
    cursor.setDate(cursor.getDate() - 1);
  }
  return { generatedAt: now, days: result };
}

export { localDayKey };
