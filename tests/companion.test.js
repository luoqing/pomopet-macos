import { describe, expect, it, vi } from 'vitest';
import { CopyPicker, COPY } from '../src/core/copy.js';
import { PresentationQueue, PRIORITY, VoiceQueue } from '../src/core/presentation.js';
import { FakeClock } from '../src/core/time.js';
import { OffworkScheduler } from '../src/core/offwork.js';

describe('companion services', () => {
  it('does not repeat copy within a category', () => {
    const picker = new CopyPicker({}, () => 0); const first = picker.pick('break'); const second = picker.pick('break');
    expect(second.text).not.toBe(first.text); expect(COPY.break).toHaveLength(3);
  });

  it('interrupts by priority, retains durable events and deduplicates IDs', () => {
    const queue = new PresentationQueue();
    queue.enqueue({ durableId: 'play', priority: PRIORITY.interaction, createdAt: 1 });
    expect(queue.enqueue({ durableId: 'alarm:1', priority: PRIORITY.alarm, createdAt: 2 }).interrupted).toBe(true);
    expect(queue.enqueue({ durableId: 'alarm:1', priority: PRIORITY.alarm, createdAt: 2 }).accepted).toBe(false);
    expect(queue.complete().durableId).toBe('alarm:1'); expect(queue.snapshot().current.durableId).toBe('play');
  });

  it('never overlaps voice and degrades on missing assets', () => {
    const play = vi.fn(); const stop = vi.fn(); const queue = new VoiceQueue({ onPlay: play, onStop: stop, assetExists: (id) => id !== 'missing' });
    expect(queue.enqueue({ id: 'missing', priority: 1 }).accepted).toBe(false);
    queue.enqueue({ id: 'break', priority: 2 }); queue.enqueue({ id: 'idle', priority: 1 });
    expect(play).toHaveBeenCalledTimes(1); queue.enqueue({ id: 'alarm', priority: 5 });
    expect(stop).toHaveBeenCalledTimes(1); expect(play).toHaveBeenCalledTimes(2);
  });

  it('snoozes and escalates off-work reminders without blocking the system', () => {
    const now = new Date(2026, 7, 21, 18, 30).getTime(); const clock = new FakeClock(now);
    const scheduler = new OffworkScheduler(clock); expect(scheduler.tick()[0].level).toBe(1);
    scheduler.snooze(); clock.advance(14 * 60_000); expect(scheduler.tick()).toEqual([]);
    clock.advance(2 * 60_000); expect(scheduler.tick()[0].level).toBe(2); scheduler.dismissToday(); expect(scheduler.tick()).toEqual([]);
  });
});
