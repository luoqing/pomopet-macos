import { describe, expect, it } from 'vitest';
import { ActivityLedger, createActivityState } from '../src/core/activity-ledger.js';

const at = (day, time) => new Date(`${day}T${time}:00`).getTime();
const rules = { workStart: '10:00', exclusions: [{ start: '12:00', end: '14:00', label: '午休' }] };

describe('ActivityLedger', () => {
  it('does not create empty days and creates a dated day on the first event', () => {
    const ledger = new ActivityLedger(createActivityState());
    expect(ledger.snapshot().days).toEqual({});
    ledger.recordReminder({ occurrenceId: 'water:1', alarmId: 'water', reminderText: '起来喝水', scheduledAt: at('2026-09-04', '10:30'), firedAt: at('2026-09-04', '10:30'), muted: false }, rules);
    expect(ledger.snapshot().days['2026-09-04']).toMatchObject({ date: '2026-09-04', rangeStartAt: at('2026-09-04', '10:00') });
  });

  it('records pause and resume as separate active segments', () => {
    const ledger = new ActivityLedger();
    ledger.openInterval({ id: 'focus-1', cycleId: 'focus-1', kind: 'focus', taskTitle: '写方案', plannedMs: 25 * 60_000, startedAt: at('2026-09-04', '10:00') }, rules);
    ledger.pauseInterval('focus-1', at('2026-09-04', '10:10'));
    ledger.resumeInterval('focus-1', at('2026-09-04', '10:15'));
    ledger.finishInterval('focus-1', { endedAt: at('2026-09-04', '10:25'), status: 'completed', completionReason: 'natural' });
    expect(ledger.snapshot().days['2026-09-04'].intervals.find((entry) => entry.cycleId === 'focus-1')).toMatchObject({
      status: 'completed', segments: [
        { startedAt: at('2026-09-04', '10:00'), endedAt: at('2026-09-04', '10:10') },
        { startedAt: at('2026-09-04', '10:15'), endedAt: at('2026-09-04', '10:25') }
      ]
    });
  });

  it('splits cross-midnight intervals without duplicating the terminal result', () => {
    const ledger = new ActivityLedger();
    ledger.openInterval({ id: 'focus-night', cycleId: 'focus-night', kind: 'focus', plannedMs: 20 * 60_000, startedAt: at('2026-09-04', '23:50') }, rules);
    ledger.finishInterval('focus-night', { endedAt: at('2026-09-05', '00:10'), status: 'stopped', completionReason: 'stopped' });
    const first = ledger.snapshot().days['2026-09-04'].intervals.find((entry) => entry.cycleId === 'focus-night');
    const last = ledger.snapshot().days['2026-09-05'].intervals.find((entry) => entry.cycleId === 'focus-night');
    expect(first).toMatchObject({ status: 'split', completionReason: null });
    expect(last).toMatchObject({ status: 'stopped', completionReason: 'stopped' });
    expect(first.id).not.toBe(last.id);
  });

  it('merges overlapping exclusions when a day is materialized', () => {
    const ledger = new ActivityLedger();
    ledger.recordReminder({ occurrenceId: 'one', reminderText: '喝水', scheduledAt: at('2026-09-04', '10:00'), firedAt: at('2026-09-04', '10:00') }, {
      workStart: '09:30', exclusions: [
        { start: '12:00', end: '13:00', label: '午休' },
        { start: '12:30', end: '14:00', label: '休息' }
      ]
    });
    const excluded = ledger.snapshot().days['2026-09-04'].intervals.filter((entry) => entry.kind === 'excluded');
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toMatchObject({ startedAt: at('2026-09-04', '12:00'), endedAt: at('2026-09-04', '14:00') });
  });

  it('accepts only the first reminder response and links snoozes', () => {
    const ledger = new ActivityLedger();
    ledger.recordReminder({ occurrenceId: 'water:1', alarmId: 'water', reminderText: '起来喝水', scheduledAt: 1, firedAt: at('2026-09-04', '10:30'), muted: true }, rules);
    expect(ledger.respondReminder('water:1', { type: 'snoozed', respondedAt: at('2026-09-04', '10:31'), snoozeMinutes: 10 })).toBe(true);
    expect(ledger.respondReminder('water:1', { type: 'dismissed', respondedAt: at('2026-09-04', '10:32') })).toBe(false);
    ledger.recordReminder({ occurrenceId: 'water:2', alarmId: 'water', reminderText: '起来喝水', scheduledAt: 2, firedAt: at('2026-09-04', '10:41'), parentOccurrenceId: 'water:1' }, rules);
    const entries = ledger.snapshot().days['2026-09-04'].reminderOccurrences;
    expect(entries[0]).toMatchObject({ muted: true, response: { type: 'snoozed' } });
    expect(entries[1]).toMatchObject({ parentOccurrenceId: 'water:1' });
  });

  it('deduplicates workday events by event id', () => {
    const ledger = new ActivityLedger();
    const event = { id: 'offwork:finish:1', type: 'offwork_finished', occurredAt: at('2026-09-04', '20:15'), note: '明天先写测试' };
    expect(ledger.recordWorkdayEvent(event, rules)).toBe(true);
    expect(ledger.recordWorkdayEvent(event, rules)).toBe(false);
    expect(ledger.snapshot().days['2026-09-04'].workdayEvents).toHaveLength(1);
  });

  it('ingests a finalized timer interval exactly once', () => {
    const ledger = new ActivityLedger();
    const interval = {
      id: 'focus-1:focus', cycleId: 'focus-1', kind: 'focus', todoId: 'todo', taskTitle: '写实现',
      plannedMs: 25 * 60_000, startedAt: at('2026-09-04', '10:00'), endedAt: at('2026-09-04', '10:15'),
      segments: [{ startedAt: at('2026-09-04', '10:00'), endedAt: at('2026-09-04', '10:15') }],
      status: 'stopped', completionReason: 'stopped', unplacedActiveMs: 0
    };
    expect(ledger.recordFinalizedInterval(interval, rules)).toBe(true);
    expect(ledger.recordFinalizedInterval(interval, rules)).toBe(false);
    expect(ledger.snapshot().days['2026-09-04'].intervals.filter((item) => item.cycleId === 'focus-1')).toHaveLength(1);
  });
});
