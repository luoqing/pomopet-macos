import { describe, expect, it } from 'vitest';
import { reviewDay, reviewRecentDays } from '../src/core/time-review.js';

const at = (day, time) => new Date(`${day}T${time}:00`).getTime();
const segment = (startedAt, endedAt) => ({ startedAt, endedAt });

describe('time review projector', () => {
  it('returns today and the six preceding local dates without deleting older source data', () => {
    const analytics = { days: { '2026-08-01': { date: '2026-08-01', intervals: [], reminderOccurrences: [], workdayEvents: [] } } };
    const result = reviewRecentDays({ analytics, now: at('2026-09-04', '16:00') });
    expect(result.days).toHaveLength(7);
    expect(result.days.map((day) => day.date)).toEqual(['2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29']);
    expect(analytics.days['2026-08-01']).toBeTruthy();
  });

  it('starts an empty current workday at the configured work start', () => {
    const now = at('2026-09-04', '16:00');
    const result = reviewRecentDays({ analytics: { days: {} }, now, days: 1, workStart: '10:00' });

    expect(result.days[0].totals.unrecordedMs).toBe(6 * 60 * 60 * 1000);
  });

  it('includes both calendar-day portions of a focus session that crossed midnight', () => {
    const result = reviewRecentDays({
      analytics: { days: {} },
      now: at('2026-09-05', '00:20'),
      days: 2,
      workStart: '00:00',
      currentTimer: {
        status: 'running',
        phase: 'focus',
        sessionId: 'overnight',
        startedAt: at('2026-09-04', '23:50'),
        activeSegments: [{ startedAt: at('2026-09-04', '23:50'), endedAt: null }]
      }
    });

    expect(result.days[0].totals.focusMs).toBe(20 * 60_000);
    expect(result.days[1].totals.focusMs).toBe(10 * 60_000);
  });

  it('projects mutually exclusive focus, break, excluded and unrecorded time', () => {
    const day = {
      date: '2026-09-04', rangeStartAt: at('2026-09-04', '10:00'),
      intervals: [
        { id: 'f', cycleId: 'f', kind: 'focus', taskTitle: '方案', segments: [segment(at('2026-09-04', '10:00'), at('2026-09-04', '11:00'))], startedAt: at('2026-09-04', '10:00'), endedAt: at('2026-09-04', '11:00'), status: 'completed', completionReason: 'early', unplacedActiveMs: 0 },
        { id: 'b', cycleId: 'b', kind: 'break', segments: [segment(at('2026-09-04', '11:00'), at('2026-09-04', '11:30'))], startedAt: at('2026-09-04', '11:00'), endedAt: at('2026-09-04', '11:30'), status: 'completed', completionReason: 'natural', unplacedActiveMs: 0 },
        { id: 'x', cycleId: null, kind: 'excluded', label: '午休', segments: [segment(at('2026-09-04', '10:30'), at('2026-09-04', '10:45'))], startedAt: at('2026-09-04', '10:30'), endedAt: at('2026-09-04', '10:45'), status: 'completed', completionReason: 'scheduled', unplacedActiveMs: 0 }
      ], reminderOccurrences: [], workdayEvents: [{ id: 'done', type: 'offwork_finished', occurredAt: at('2026-09-04', '12:00') }]
    };
    const result = reviewDay(day, { now: at('2026-09-04', '13:00') });
    expect(result.totals).toMatchObject({ focusMs: 45 * 60_000, breakMs: 30 * 60_000, excludedMs: 15 * 60_000, unrecordedMs: 30 * 60_000 });
    expect(result.counts).toMatchObject({ early: 1, stopped: 0 });
    expect(result.restTimeWorkMs).toBe(15 * 60_000);
  });

  it('includes open segment preview and legacy unplaced time without mutating input', () => {
    const timer = { status: 'running', phase: 'focus', sessionId: 'open', task: '当前工作', todoId: null, focusMs: 25 * 60_000, startedAt: at('2026-09-04', '15:00'), activeSegments: [{ startedAt: at('2026-09-04', '15:00'), endedAt: null }] };
    const day = { date: '2026-09-04', rangeStartAt: at('2026-09-04', '14:00'), intervals: [{ id: 'legacy', cycleId: 'legacy', kind: 'focus', taskTitle: '旧任务', segments: [], unplacedActiveMs: 8 * 60_000, status: 'stopped', completionReason: 'stopped' }], reminderOccurrences: [], workdayEvents: [] };
    const result = reviewDay(day, { now: at('2026-09-04', '15:10'), currentTimer: timer });
    expect(result.totals.focusMs).toBe(18 * 60_000);
    expect(result.totals.unplacedMs).toBe(8 * 60_000);
    expect(timer.activeSegments[0].endedAt).toBeNull();
  });

  it('groups tasks by id/title snapshot and reminders by exact configured text', () => {
    const day = { date: '2026-09-04', rangeStartAt: at('2026-09-04', '10:00'), intervals: [
      { id: 'a', cycleId: 'a', kind: 'focus', todoId: '1', taskTitle: '原始标题', segments: [segment(at('2026-09-04', '10:00'), at('2026-09-04', '10:20'))], status: 'completed', completionReason: 'natural' },
      { id: 'b', cycleId: 'b', kind: 'focus', todoId: null, taskTitle: '', segments: [segment(at('2026-09-04', '10:20'), at('2026-09-04', '10:30'))], status: 'stopped', completionReason: 'stopped' }
    ], reminderOccurrences: [
      { occurrenceId: '1', alarmId: 'a', reminderText: '起来喝水', firedAt: at('2026-09-04', '10:31'), response: null },
      { occurrenceId: '2', alarmId: 'b', reminderText: '起来喝水', firedAt: at('2026-09-04', '10:45'), response: { type: 'dismissed' } }
    ], workdayEvents: [{ id: 's', type: 'offwork_snoozed', occurredAt: at('2026-09-04', '10:40') }] };
    const result = reviewDay(day, { now: at('2026-09-04', '11:00') });
    expect(result.tasks).toEqual(expect.arrayContaining([{ key: '1', title: '原始标题', ms: 20 * 60_000 }, { key: 'unassigned', title: '未关联任务', ms: 10 * 60_000 }]));
    expect(result.reminders[0]).toMatchObject({ text: '起来喝水', count: 2 });
    expect(result.reminderBuckets).toMatchObject({ '10:30': 2 });
    expect(result.extensionCount).toBe(1);
  });
});
