import { describe, expect, it } from 'vitest';
import { AlarmScheduler, nextIntervalOccurrence, nextRepeatingOccurrence, OccurrenceLedger } from '../src/core/alarms.js';
import { FakeClock } from '../src/core/time.js';

const intervalSlotsInTimezone = (timezone, date, alarm) => {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  try {
    let after = new Date(date[0], date[1], date[2], 0, 0).getTime() - 1;
    const slots = [];
    for (let index = 0; index < 12; index += 1) {
      const next = nextIntervalOccurrence(alarm, after);
      const value = new Date(next);
      if (value.getFullYear() !== date[0] || value.getMonth() !== date[1] || value.getDate() !== date[2]) break;
      slots.push(String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0'));
      after = next;
    }
    return slots;
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
};

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

  it('anchors interval occurrences to the configured start time', () => {
    const after = new Date(2026, 7, 24, 10, 5).getTime();
    const next = nextIntervalOccurrence({ startTime: '09:30', endTime: '18:30', intervalMinutes: 60, weekdays: [1] }, after);
    expect(next).toBe(new Date(2026, 7, 24, 10, 30).getTime());
  });

  it('does not invent an end-boundary occurrence when the range is not evenly divisible', () => {
    const after = new Date(2026, 7, 24, 17, 30).getTime();
    const next = nextIntervalOccurrence({ startTime: '09:30', endTime: '18:20', intervalMinutes: 60, weekdays: [1] }, after);
    expect(next).toBe(new Date(2026, 7, 31, 9, 30).getTime());
  });

  it.each([null, 0, -15, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'not-a-number'])('rejects malformed intervalMinutes %s', (intervalMinutes) => {
    const after = new Date(2026, 7, 24, 8, 0).getTime();
    expect(nextIntervalOccurrence({ startTime: '09:00', endTime: '10:00', intervalMinutes, weekdays: [1] }, after)).toBeNull();
  });

  it.each([
    ['missing startTime', { endTime: '10:00' }],
    ['null startTime', { startTime: null, endTime: '10:00' }],
    ['short startTime', { startTime: '9:00', endTime: '10:00' }],
    ['out-of-range times', { startTime: '24:00', endTime: '25:00' }],
    ['invalid start minute', { startTime: '09:60', endTime: '10:00' }],
    ['missing endTime', { startTime: '09:00' }],
    ['null endTime', { startTime: '09:00', endTime: null }],
    ['malformed endTime', { startTime: '09:00', endTime: 'ten' }]
  ])('rejects %s', (_label, times) => {
    const after = new Date(2026, 7, 24, 8, 0).getTime();
    expect(nextIntervalOccurrence({ ...times, intervalMinutes: 30, weekdays: [1] }, after)).toBeNull();
  });

  it.each([Number.MIN_VALUE, 1, 10, 75, 121, 2.5, '30'])('rejects unsupported interval %s', (intervalMinutes) => {
    const after = new Date(2026, 7, 24, 8, 0).getTime();
    expect(nextIntervalOccurrence({ startTime: '09:00', endTime: '10:00', intervalMinutes, weekdays: [1] }, after)).toBeNull();
  });

  it.each([15, 30, 45, 60, 90, 120])('accepts supported interval %s', (intervalMinutes) => {
    const after = new Date(2026, 7, 24, 8, 0).getTime();
    expect(nextIntervalOccurrence({ startTime: '09:00', endTime: '18:00', intervalMinutes, weekdays: [1] }, after)).toBe(new Date(2026, 7, 24, 9, 0).getTime());
  });

  it.each([undefined, null, [], ['1'], [-1], [7], [1.5]])('rejects invalid weekdays %j', (weekdays) => {
    const after = new Date(2026, 7, 24, 8, 0).getTime();
    expect(nextIntervalOccurrence({ startTime: '09:00', endTime: '10:00', intervalMinutes: 30, weekdays }, after)).toBeNull();
  });

  it('uses local dates for interval weekday boundaries', () => {
    const sunday = new Date(2026, 7, 23, 23, 59).getTime();
    const next = nextIntervalOccurrence({ startTime: '00:00', endTime: '01:00', intervalMinutes: 30, weekdays: [1] }, sunday);
    expect(next).toBe(new Date(2026, 7, 24, 0, 0).getTime());
    expect(new Date(next).getDay()).toBe(1);
  });

  it('recovers an occurrence exactly 15 minutes late', () => {
    const dueAt = new Date(2026, 7, 24, 9, 30).getTime(); const clock = new FakeClock(dueAt + 15 * 60_000);
    const scheduler = new AlarmScheduler(clock, [{ id: 'boundary', label: '喝水', type: 'interval', startTime: '09:30', endTime: '10:30', intervalMinutes: 30, weekdays: [1], enabled: true, snoozes: [] }]);
    expect(scheduler.due()).toEqual([expect.objectContaining({ dueAt })]);
  });

  it('recovers only the latest missed occurrence for one plan', () => {
    const clock = new FakeClock(new Date(2026, 7, 24, 10, 14).getTime());
    const scheduler = new AlarmScheduler(clock, [{ id: 'water', label: '喝水', type: 'interval', startTime: '09:30', endTime: '18:30', intervalMinutes: 15, weekdays: [1], enabled: true, snoozes: [] }]);
    expect(scheduler.due().map((event) => event.dueAt)).toEqual([new Date(2026, 7, 24, 10, 0).getTime()]);
  });

  it('recovers one latest occurrence for each different plan', () => {
    const clock = new FakeClock(new Date(2026, 7, 24, 10, 14).getTime());
    const alarms = [
      { id: 'water', label: '喝水', type: 'interval', startTime: '09:30', endTime: '18:30', intervalMinutes: 15, weekdays: [1], enabled: true, snoozes: [] },
      { id: 'stand', label: '活动', type: 'interval', startTime: '09:35', endTime: '18:35', intervalMinutes: 15, weekdays: [1], enabled: true, snoozes: [] }
    ];
    expect(new AlarmScheduler(clock, alarms).due().map((event) => event.alarmId)).toEqual(['water', 'stand']);
  });

  it('recovers across multiple interval points without replaying the claimed occurrence', () => {
    const clock = new FakeClock(new Date(2026, 7, 24, 10, 0).getTime()); const ledger = new OccurrenceLedger();
    const alarms = [{ id: 'water', label: '喝水', type: 'interval', startTime: '09:30', endTime: '18:30', intervalMinutes: 15, weekdays: [1], enabled: true, snoozes: [] }];
    const first = new AlarmScheduler(clock, alarms, ledger).due();
    expect(first).toEqual([expect.objectContaining({ dueAt: new Date(2026, 7, 24, 10, 0).getTime() })]);
    expect(new AlarmScheduler(clock, alarms, ledger).due()).toEqual([]);
  });

  it('delivers an independent snooze when the latest regular occurrence is already claimed', () => {
    const now = new Date(2026, 7, 24, 10, 0).getTime(); const snoozeAt = now - 60_000;
    const regularId = `water:${now}`; const ledger = new OccurrenceLedger({ [regularId]: now });
    const scheduler = new AlarmScheduler(new FakeClock(now), [{ id: 'water', label: '喝水', type: 'interval', startTime: '09:30', endTime: '18:30', intervalMinutes: 15,
      weekdays: [1], enabled: true, snoozes: [{ id: `water:${snoozeAt}:snooze:older`, dueAt: snoozeAt, dismissed: false }] }], ledger);
    expect(scheduler.due()).toEqual([expect.objectContaining({ occurrenceId: `water:${snoozeAt}:snooze:older` })]);
  });

  it('delivers a boundary snooze with the latest regular occurrence without replay or regular bursts', () => {
    const now = new Date(2026, 7, 24, 10, 0).getTime(); const snoozeAt = now - 15 * 60_000; const clock = new FakeClock(now);
    const scheduler = new AlarmScheduler(clock, [{ id: 'water', label: '喝水', type: 'interval', startTime: '09:30', endTime: '18:30', intervalMinutes: 15,
      weekdays: [1], enabled: true, snoozes: [{ id: `water:${snoozeAt}:snooze:boundary`, dueAt: snoozeAt, dismissed: false }] }]);
    expect(scheduler.due().map((event) => event.occurrenceId)).toEqual([`water:${snoozeAt}:snooze:boundary`, `water:${now}`]);
    clock.advance(60_000);
    expect(scheduler.due()).toEqual([]);
    expect(scheduler.snapshot().alarms[0].snoozes).toEqual([]);
  });

  it.each([
    ['weekly', 'setEnabled', { time: '09:00', weekdays: [1] }, new Date(2026, 7, 31, 9, 0).getTime()],
    ['weekly', 'update', { time: '09:00', weekdays: [1] }, new Date(2026, 7, 31, 9, 0).getTime()],
    ['interval', 'setEnabled', { startTime: '09:00', endTime: '10:00', intervalMinutes: 15, weekdays: [1] }, new Date(2026, 7, 24, 9, 15).getTime()],
    ['interval', 'update', { startTime: '09:00', endTime: '10:00', intervalMinutes: 15, weekdays: [1] }, new Date(2026, 7, 24, 9, 15).getTime()]
  ])('re-enables %s through %s from the next future occurrence', (type, method, schedule, nextAt) => {
    const now = new Date(2026, 7, 24, 9, 5).getTime(); const clock = new FakeClock(now);
    const scheduler = new AlarmScheduler(clock, [{ id: 'resume', label: '恢复', type, ...schedule, enabled: false, snoozes: [] }]);
    if (method === 'setEnabled') scheduler.setEnabled('resume', true);
    else scheduler.update('resume', { enabled: true });
    expect(scheduler.due()).toEqual([]);
    clock.set(nextAt);
    expect(scheduler.due()).toEqual([expect.objectContaining({ dueAt: nextAt })]);
  });

  it('does not backfill recurring occurrences after an explicit add or schedule edit', () => {
    const now = new Date(2026, 7, 24, 9, 5).getTime(); const clock = new FakeClock(now); const scheduler = new AlarmScheduler(clock,
      [{ id: 'edited', label: '编辑', type: 'weekly', time: '10:00', weekdays: [1], enabled: true, snoozes: [] }]);
    scheduler.add({ id: 'added', label: '新增', type: 'weekly', time: '09:00', weekdays: [1] });
    scheduler.update('edited', { time: '09:00' });
    expect(scheduler.due()).toEqual([]);
  });

  it('consumes and removes snoozes older than the recovery grace period', () => {
    const now = new Date(2026, 7, 24, 10, 0).getTime(); const clock = new FakeClock(now);
    const scheduler = new AlarmScheduler(clock, [{ id: 'water', label: '喝水', type: 'weekly', time: '12:00', weekdays: [1], enabled: true,
      snoozes: [{ id: 'water:old:snooze:base', dueAt: now - 15 * 60_000 - 1, dismissed: false }] }]);
    expect(scheduler.due()).toEqual([]);
    expect(scheduler.snapshot().alarms[0].snoozes).toEqual([]);
    expect(scheduler.consumeDirty()).toBe(true);
    expect(scheduler.consumeDirty()).toBe(false);
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

  it('clears pending snoozes when an update disables the alarm', () => {
    const due = new Date(2026, 7, 24, 9, 0).getTime(); const clock = new FakeClock(due);
    const scheduler = new AlarmScheduler(clock, [{ id: 'update-disable', label: '站会', type: 'weekly', time: '09:00', weekdays: [1], enabled: true, snoozes: [] }]);
    const original = scheduler.due()[0]; scheduler.snooze('update-disable', original.occurrenceId, 10); scheduler.consumeDirty();
    scheduler.update('update-disable', { enabled: false });
    expect(scheduler.snapshot().alarms[0].snoozes).toEqual([]);
    expect(scheduler.consumeDirty()).toBe(true);
    clock.advance(10 * 60_000);
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

describe('interval daylight-saving boundaries', () => {
  it('skips nonexistent spring-forward wall-clock slots without duplicates', () => {
    const slots = intervalSlotsInTimezone('America/New_York', [2026, 2, 8],
      { startTime: '01:30', endTime: '03:30', intervalMinutes: 30, weekdays: [0] });
    expect(slots).toEqual(['01:30', '03:00', '03:30']);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('emits each fall-back wall-clock slot only once', () => {
    const slots = intervalSlotsInTimezone('America/New_York', [2026, 10, 1],
      { startTime: '00:30', endTime: '02:30', intervalMinutes: 30, weekdays: [0] });
    expect(slots).toEqual(['00:30', '01:00', '01:30', '02:00', '02:30']);
    expect(new Set(slots).size).toBe(slots.length);
  });
});
