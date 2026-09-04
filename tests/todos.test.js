import { describe, expect, it } from 'vitest';
import { FakeClock, localDayKey } from '../src/core/time.js';
import { TodoLedger } from '../src/core/todos.js';

const item = (clock, id, title, priority, createdAt, extra = {}) => ({
  id, title, priority, createdAt, day: localDayKey(clock.now()), done: false,
  estimatePomos: 1, completedPomos: 0, spentMs: 0, completedAt: null, ...extra
});

describe('TodoLedger recommendations', () => {
  it('orders today unfinished todos by preferred id, priority, then creation time', () => {
    const clock = new FakeClock(Date.parse('2026-08-28T10:00:00+08:00'));
    const ledger = new TodoLedger(clock, { activeId: 'p2-preferred', items: [
      item(clock, 'p1-later', 'P1 later', 'P1', 40),
      item(clock, 'p0-later', 'P0 later', 'P0', 30),
      item(clock, 'p2-preferred', 'Preferred', 'P2', 50),
      item(clock, 'p0-earlier', 'P0 earlier', 'P0', 20),
      item(clock, 'p1-earlier', 'P1 earlier', 'P1', 10),
      item(clock, 'done', 'Done', 'P0', 1, { done: true }),
      item(clock, 'tomorrow', 'Other day', 'P0', 0, { day: '2026-08-29' })
    ] });

    expect(ledger.orderedUnfinished({ preferredId: 'p2-preferred' }).map(({ id }) => id)).toEqual([
      'p2-preferred', 'p0-earlier', 'p0-later', 'p1-earlier', 'p1-later'
    ]);
    expect(ledger.recommend({ preferredId: 'p2-preferred' })?.id).toBe('p2-preferred');
  });

  it('returns no recommendation when today has no unfinished todo', () => {
    const clock = new FakeClock(Date.parse('2026-08-28T10:00:00+08:00'));
    const ledger = new TodoLedger(clock, { activeId: null, items: [item(clock, 'done', 'Done', 'P0', 1, { done: true })] });
    expect(ledger.orderedUnfinished()).toEqual([]);
    expect(ledger.recommend()).toBeNull();
  });

  it('tracks actual time separately from completed pomodoros and ignores duplicate events', () => {
    const clock = new FakeClock(Date.parse('2026-08-28T10:00:00+08:00'));
    const ledger = new TodoLedger(clock);
    const todo = ledger.add({ title: '完成方案' });

    ledger.recordFocus(todo.id, 10 * 60_000, { completed: false, eventId: 'stopped-1' });
    ledger.recordFocus(todo.id, 10 * 60_000, { completed: false, eventId: 'stopped-1' });
    ledger.recordFocus(todo.id, 25 * 60_000, { completed: true, eventId: 'completed-1' });

    expect(ledger.unfinishedItem(todo.id)).toMatchObject({ spentMs: 35 * 60_000, completedPomos: 1 });
  });
});
