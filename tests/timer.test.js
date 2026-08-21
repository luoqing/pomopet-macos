import { describe, expect, it } from 'vitest';
import { FakeClock } from '../src/core/time.js';
import { TimerEngine } from '../src/core/timer.js';

describe('TimerEngine', () => {
  it('starts, pauses, resumes and uses target time instead of ticks', () => {
    const clock = new FakeClock(1_000); const timer = new TimerEngine(clock);
    timer.start({ task: '写实现', focusMinutes: 1, breakMinutes: 1 });
    clock.advance(12_345); timer.pause(); expect(timer.remaining()).toBe(47_655);
    clock.advance(99_000); timer.resume(); clock.advance(47_655);
    expect(timer.tick().map((e) => e.type)).toEqual(['focus-completed', 'break-started']);
    expect(timer.snapshot().phase).toBe('break');
  });

  it('claims completion exactly once and stop grants no reward', () => {
    const clock = new FakeClock(0); const timer = new TimerEngine(clock);
    timer.start({ focusMinutes: 1, breakMinutes: 1 }); clock.advance(60_000);
    expect(timer.tick().filter((e) => e.type === 'focus-completed')).toHaveLength(1);
    expect(timer.tick()).toEqual([]); timer.stop(); expect(timer.complete()).toEqual([]);
  });

  it('recovers recent sleep with one celebration but never auto-starts break', () => {
    const clock = new FakeClock(Date.parse('2026-08-21T23:59:30+08:00')); const original = new TimerEngine(clock);
    original.start({ focusMinutes: 1, breakMinutes: 1 }); const persisted = original.snapshot();
    clock.advance(5 * 60_000); const recovered = new TimerEngine(clock, persisted);
    const events = recovered.tick({ recovery: true });
    expect(events).toMatchObject([{ type: 'focus-completed', celebrate: true, recovered: true }]);
    expect(recovered.snapshot().status).toBe('idle');
    expect(Object.values(recovered.snapshot().completedByDay)).toEqual([1]);
    expect(recovered.tick({ recovery: true })).toEqual([]);
  });

  it('quietly records stale recovery on target calendar day', () => {
    const clock = new FakeClock(Date.parse('2026-08-21T23:59:30')); const timer = new TimerEngine(clock);
    timer.start({ focusMinutes: 1 }); const state = timer.snapshot(); clock.advance(30 * 60_000);
    const recovered = new TimerEngine(clock, state); const [event] = recovered.tick({ recovery: true });
    expect(event.celebrate).toBe(false); expect(Object.keys(recovered.snapshot().completedByDay)).toContain('2026-08-22');
  });
});
