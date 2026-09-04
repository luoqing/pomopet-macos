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

  it('updates the task without restarting the timer', () => {
    const clock = new FakeClock(1_000); const timer = new TimerEngine(clock);
    timer.start({ task: '旧任务', focusMinutes: 25, breakMinutes: 5 });
    const sessionId = timer.snapshot().sessionId;
    expect(timer.updateTask(' 新任务 ')).toEqual([]);
    expect(timer.snapshot()).toMatchObject({ task: '新任务', sessionId, status: 'running' });
  });

  it.each([
    ['NaN', Number.NaN, Number.NaN, 25, 5],
    ['Infinity', Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 25, 5],
    ['huge', 10_000, 10_000, 180, 60],
    ['negative', -20, -10, 1, 1]
  ])('normalizes %s focus and break durations for start and pending continuation', (_case, focusMinutes, breakMinutes, expectedFocus, expectedBreak) => {
    const clock = new FakeClock(1_000); const timer = new TimerEngine(clock);
    timer.start({ todoId: 'todo', focusMinutes, breakMinutes });
    expect(timer.snapshot()).toMatchObject({ focusMs: expectedFocus * 60_000, breakMs: expectedBreak * 60_000 });
    clock.advance(expectedFocus * 60_000); timer.tick();
    clock.advance(expectedBreak * 60_000); timer.tick();
    expect(timer.snapshot().pendingBreakChoice).toMatchObject({ focusMinutes: expectedFocus, breakMinutes: expectedBreak });
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

  it('persists the completed break context without starting another focus', () => {
    const clock = new FakeClock(10_000); const timer = new TimerEngine(clock);
    timer.start({ task: '写方案', todoId: 'todo-previous', focusMinutes: 2, breakMinutes: 3 });
    clock.advance(2 * 60_000); timer.tick(); clock.advance(3 * 60_000);

    expect(timer.tick()).toMatchObject([{ type: 'break-completed' }]);
    expect(timer.snapshot()).toMatchObject({
      status: 'idle',
      phase: 'focus',
      pendingBreakChoice: {
        previousTodoId: 'todo-previous',
        focusMinutes: 2,
        breakMinutes: 3,
        createdAt: clock.now()
      }
    });

    const restored = new TimerEngine(clock, timer.snapshot());
    clock.advance(20_000);
    expect(restored.tick()).toEqual([]);
    expect(restored.snapshot()).toMatchObject({ status: 'idle', pendingBreakChoice: timer.snapshot().pendingBreakChoice });
  });

  it('does not create a pending break choice when the break is skipped', () => {
    const clock = new FakeClock(0); const timer = new TimerEngine(clock);
    timer.start({ todoId: 'todo-previous', focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); timer.tick(); timer.skipBreak();
    expect(timer.snapshot()).toMatchObject({ status: 'idle', pendingBreakChoice: null });
  });

  it('records only active focus segments across pause and resume', () => {
    const clock = new FakeClock(1_000); const timer = new TimerEngine(clock);
    timer.start({ task: '写方案', todoId: 'todo', focusMinutes: 25, breakMinutes: 5 });
    clock.advance(10 * 60_000); timer.pause(); clock.advance(8 * 60_000); timer.resume();
    clock.advance(5 * 60_000);
    const [event] = timer.complete();

    expect(event).toMatchObject({ type: 'focus-completed', spentMs: 15 * 60_000, completionReason: 'early' });
    expect(event.interval).toMatchObject({ kind: 'focus', todoId: 'todo', status: 'completed', completionReason: 'early' });
    expect(event.interval.segments).toEqual([
      { startedAt: 1_000, endedAt: 601_000 },
      { startedAt: 1_081_000, endedAt: 1_381_000 }
    ]);
    expect(timer.snapshot()).toMatchObject({ phase: 'break', activeSegments: [{ startedAt: 1_381_000, endedAt: null }] });
  });

  it('ends a break early and asks what to do next', () => {
    const clock = new FakeClock(0); const timer = new TimerEngine(clock);
    timer.start({ task: '当前任务', todoId: 'todo', focusMinutes: 1, breakMinutes: 5 });
    clock.advance(60_000); timer.tick(); clock.advance(2 * 60_000);
    const events = timer.endBreak();

    expect(events[0]).toMatchObject({ type: 'break-completed', completionReason: 'early' });
    expect(events[0].interval).toMatchObject({ kind: 'break', status: 'completed', completionReason: 'early' });
    expect(timer.snapshot()).toMatchObject({ status: 'idle', pendingBreakChoice: { previousTodoId: 'todo' } });
    expect(timer.endBreak()).toEqual([]);
  });

  it('stops focus or break with an actual interval but without a completed pomodoro', () => {
    const clock = new FakeClock(0); const focus = new TimerEngine(clock);
    focus.start({ todoId: 'todo', focusMinutes: 25 }); clock.advance(3 * 60_000);
    const focusStop = focus.stop();
    expect(focusStop[0]).toMatchObject({ type: 'timer-stopped', phase: 'focus', spentMs: 3 * 60_000 });
    expect(focusStop[0].interval).toMatchObject({ status: 'stopped', completionReason: 'stopped' });
    expect(focus.snapshot().pendingBreakChoice).toBeNull();

    const rest = new TimerEngine(clock);
    rest.start({ todoId: 'todo', focusMinutes: 1, breakMinutes: 5 }); clock.advance(60_000); rest.tick();
    clock.advance(30_000);
    expect(rest.stop()[0]).toMatchObject({ type: 'timer-stopped', phase: 'break', spentMs: 30_000 });
    expect(rest.snapshot().pendingBreakChoice).toBeNull();
  });

  it('keeps legacy elapsed duration as unplaced time when precise segments are unavailable', () => {
    const clock = new FakeClock(10 * 60_000);
    const timer = new TimerEngine(clock, {
      status: 'paused', phase: 'focus', sessionId: 'legacy', task: '旧任务', todoId: 'todo',
      focusMs: 25 * 60_000, breakMs: 5 * 60_000, startedAt: 0, targetAt: null,
      remainingMs: 15 * 60_000, completionClaimed: false, completedByDay: {}, pendingBreakChoice: null
    });
    const [event] = timer.complete();
    expect(event.interval.segments).toEqual([]);
    expect(event.interval.unplacedActiveMs).toBe(10 * 60_000);
    expect(event.spentMs).toBe(10 * 60_000);
  });

  it('recovers a legacy running timer from its target time', () => {
    const clock = new FakeClock(25 * 60_000);
    const timer = new TimerEngine(clock, {
      status: 'running', phase: 'focus', sessionId: 'legacy-running', task: '旧专注', todoId: null,
      focusMs: 25 * 60_000, breakMs: 5 * 60_000, startedAt: 0, targetAt: 25 * 60_000,
      remainingMs: 25 * 60_000, completionClaimed: false, completedByDay: {}, pendingBreakChoice: null
    });
    const [event] = timer.tick({ recovery: true });
    expect(event.interval.unplacedActiveMs).toBe(25 * 60_000);
    expect(event.spentMs).toBe(25 * 60_000);
  });
});
