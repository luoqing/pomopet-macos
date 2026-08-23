import { describe, expect, it } from 'vitest';
import { AlarmScheduler, nextRepeatingOccurrence, OccurrenceLedger } from '../src/core/alarms.js';
import { FakeClock } from '../src/core/time.js';

describe('AlarmScheduler', () => {
  it('fires a one-off occurrence only once and disables it', () => {
    const clock = new FakeClock(10_000); const scheduler = new AlarmScheduler(clock);
    scheduler.add({ id: 'once', label: '喝水', type: 'once', at: 20_000, pose: 'water' }); clock.set(20_000);
    expect(scheduler.due()).toEqual([expect.objectContaining({ pose: 'water' })]); expect(scheduler.due()).toEqual([]);
    expect(scheduler.snapshot().alarms[0].enabled).toBe(false);
  });

  it('finds weekday recurrence over a weekend', () => {
    const friday = new Date(2026, 7, 21, 18, 31).getTime();
    const next = nextRepeatingOccurrence({ time: '18:30', weekdays: [1, 2, 3, 4, 5] }, friday);
    expect(new Date(next).getDay()).toBe(1); expect(new Date(next).getHours()).toBe(18);
  });

  it('snooze creates one replacement without changing weekly schedule', () => {
    const due = new Date(2026, 7, 21, 9, 0).getTime(); const clock = new FakeClock(due);
    const scheduler = new AlarmScheduler(clock, [{ id: 'weekly', label: '站会', type: 'weekly', time: '09:00', weekdays: [5], enabled: true, snoozes: [] }]);
    const event = scheduler.due()[0]; const baseNext = scheduler.nextFor(scheduler.alarms[0], due);
    const snooze = scheduler.snooze('weekly', event.occurrenceId, 10); clock.advance(10 * 60_000);
    expect(scheduler.due().map((e) => e.occurrenceId)).toEqual([snooze.id]); expect(scheduler.due()).toEqual([]);
    expect(scheduler.nextFor(scheduler.alarms[0], due)).toBe(baseNext);
  });

  it('delivers a snoozed one-off after its base occurrence is consumed', () => {
    const clock = new FakeClock(10_000); const scheduler = new AlarmScheduler(clock);
    scheduler.add({ id: 'once-snooze', label: '喝水', type: 'once', at: 10_000 }); const original = scheduler.due()[0];
    const snooze = scheduler.snooze('once-snooze', original.occurrenceId, 10); clock.advance(10 * 60_000);
    expect(scheduler.due()).toEqual([expect.objectContaining({ occurrenceId: snooze.id, label: '喝水' })]);
  });

  it('manual disabling clears pending snoozes', () => {
    const clock = new FakeClock(10_000); const scheduler = new AlarmScheduler(clock);
    scheduler.add({ id: 'disable', label: '喝水', type: 'once', at: 10_000 }); const original = scheduler.due()[0];
    scheduler.snooze('disable', original.occurrenceId, 10); scheduler.setEnabled('disable', false); clock.advance(10 * 60_000);
    expect(scheduler.due()).toEqual([]);
  });

  it('does not re-enable an expired one-off alarm', () => {
    const clock = new FakeClock(20_000); const scheduler = new AlarmScheduler(clock);
    scheduler.add({ id: 'expired', label: '旧提醒', type: 'once', at: 10_000, enabled: false });
    expect(scheduler.setEnabled('expired', true).enabled).toBe(false);
    expect(scheduler.due()).toEqual([]);
  });

  it('shares durable claims across scheduler instances and drops stale wake events', () => {
    const clock = new FakeClock(1_000_000); const ledger = new OccurrenceLedger();
    const alarm = [{ id: 'x', label: 'x', type: 'once', at: clock.now() - 1_000, enabled: true, snoozes: [] }];
    expect(new AlarmScheduler(clock, alarm, ledger).due()).toHaveLength(1);
    expect(new AlarmScheduler(clock, alarm, ledger).due()).toEqual([]);
    const stale = [{ ...alarm[0], id: 'stale', at: clock.now() - 16 * 60_000 }];
    expect(new AlarmScheduler(clock, stale).due()).toEqual([]);
  });
});
