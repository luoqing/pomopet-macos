import { expect, it } from 'vitest';
import { FakeClock } from '../src/core/time.js';
import { TimerEngine } from '../src/core/timer.js';
import { AlarmScheduler, OccurrenceLedger } from '../src/core/alarms.js';
import { PresentationQueue, PRIORITY } from '../src/core/presentation.js';

it('accelerates 48 hours across midnight, restart recovery and simultaneous reminders', () => {
  const start = new Date(2026, 7, 21, 23, 50).getTime(); const clock = new FakeClock(start);
  let timer = new TimerEngine(clock); timer.start({ task: '跨日任务', focusMinutes: 25, breakMinutes: 5 });
  const alarms = [
    { id: 'daily', label: '午夜伸展', type: 'weekly', time: '00:15', weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true, snoozes: [] },
    { id: 'interval', label: '白天活动', type: 'interval', startTime: '09:00', endTime: '10:00', intervalMinutes: 30, weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true, snoozes: [] }
  ];
  const ledger = new OccurrenceLedger(); let scheduler = new AlarmScheduler(clock, alarms, ledger); const queue = new PresentationQueue();
  const delivered = [];
  for (let minute = 1; minute <= 48 * 60; minute += 1) {
    clock.advance(60_000);
    if (minute === 20) timer = new TimerEngine(clock, timer.snapshot());
    for (const event of timer.tick({ recovery: minute === 20 })) {
      if (event.type === 'focus-completed') queue.enqueue({ durableId: event.sessionId, priority: PRIORITY.focusComplete, createdAt: clock.now() });
    }
    if (minute >= 550 && minute < 565) continue;
    scheduler = new AlarmScheduler(clock, scheduler.snapshot().alarms, ledger);
    for (const event of scheduler.due()) queue.enqueue({ durableId: event.occurrenceId, priority: PRIORITY.alarm, createdAt: clock.now() });
    while (queue.current) delivered.push(queue.complete().durableId);
  }
  expect(delivered.filter((id) => id.startsWith('focus-'))).toHaveLength(1);
  expect(delivered.filter((id) => id.startsWith('daily:'))).toHaveLength(2);
  expect(delivered.filter((id) => id.startsWith('interval:'))).toHaveLength(6);
  expect(new Set(delivered).size).toBe(delivered.length);
});
