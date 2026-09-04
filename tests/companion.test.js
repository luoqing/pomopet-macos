import { describe, expect, it, vi } from 'vitest';
import { CopyPicker, COPY } from '../src/core/copy.js';
import { PresentationQueue, PRIORITY, VoiceQueue } from '../src/core/presentation.js';
import { FakeClock } from '../src/core/time.js';
import { defaultOffwork, OffworkScheduler } from '../src/core/offwork.js';
import { createTimerState } from '../src/core/timer.js';
import { AppRuntime } from '../src/platform/electron/runtime.mjs';

class MemoryStore {
  constructor(value = {}) { this.value = structuredClone(value); }
  async load(fallback) { return { ...structuredClone(fallback), ...structuredClone(this.value) }; }
  async save(value) { this.value = structuredClone(value); }
}

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

  it('discards ambient chatter instead of queueing it behind a higher-priority event', () => {
    const queue = new PresentationQueue();
    queue.enqueue({ category: 'alarm', durableId: 'alarm:1', priority: PRIORITY.alarm, createdAt: 1 });
    expect(queue.enqueue({ category: 'ambientCompanion', durableId: 'ambient:1', priority: PRIORITY.ambient, createdAt: 2 }))
      .toMatchObject({ accepted: false, reason: 'ambient-blocked' });
    expect(queue.snapshot().pending).toEqual([]);
  });

  it('drops active ambient chatter when a higher-priority event interrupts it', () => {
    const queue = new PresentationQueue();
    queue.enqueue({ category: 'ambientCompanion', durableId: 'ambient:1', priority: PRIORITY.ambient, createdAt: 1 });
    expect(queue.enqueue({ category: 'alarm', durableId: 'alarm:1', priority: PRIORITY.alarm, createdAt: 2 }).interrupted).toBe(true);
    expect(queue.snapshot()).toMatchObject({ current: { category: 'alarm' }, pending: [] });
  });

  it('orders equal-priority events by trigger time and then FIFO insertion order', () => {
    const queue = new PresentationQueue({ now: () => 10_000 });
    queue.enqueue({ durableId: 'active', priority: PRIORITY.alarm, occurredAt: 1_000, createdAt: 1_000 });
    queue.enqueue({ durableId: 'third', priority: PRIORITY.alarm, occurredAt: 3_000, createdAt: 4_000 });
    queue.enqueue({ durableId: 'first', priority: PRIORITY.alarm, occurredAt: 2_000, createdAt: 5_000 });
    queue.enqueue({ durableId: 'second', priority: PRIORITY.alarm, occurredAt: 2_000, createdAt: 5_000 });

    expect(queue.complete().durableId).toBe('active');
    expect(queue.complete().durableId).toBe('first');
    expect(queue.complete().durableId).toBe('second');
    expect(queue.complete().durableId).toBe('third');
  });

  it('drops expired waiting events before they can be shown', () => {
    let now = 1_000;
    const queue = new PresentationQueue({ now: () => now });
    queue.enqueue({ durableId: 'blocker', priority: PRIORITY.offworkBlocker, createdAt: now });
    queue.enqueue({ durableId: 'alarm', priority: PRIORITY.alarm, createdAt: now, expiresAt: 2_000 });
    queue.enqueue({ durableId: 'focus', priority: PRIORITY.focusComplete, createdAt: now, expiresAt: 4_000 });
    now = 5_000;

    expect(queue.complete().durableId).toBe('blocker');
    expect(queue.snapshot().current).toBeNull();
  });

  it('never queues or restores user expressions and ambient chatter', () => {
    const queue = new PresentationQueue();
    queue.enqueue({ category: 'alarm', durableId: 'alarm', priority: PRIORITY.alarm, createdAt: 1 });
    expect(queue.enqueue({ category: 'interactionPet', priority: PRIORITY.interaction, createdAt: 2 }))
      .toMatchObject({ accepted: false, reason: 'ephemeral-blocked' });
    queue.complete();
    queue.enqueue({ category: 'interactionPet', priority: PRIORITY.interaction, createdAt: 3 });
    queue.enqueue({ category: 'alarm', durableId: 'alarm:2', priority: PRIORITY.alarm, createdAt: 4 });
    expect(queue.complete().durableId).toBe('alarm:2');
    expect(queue.snapshot().current).toBeNull();
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
    scheduler.snooze(); clock.advance(9 * 60_000); expect(scheduler.tick()).toEqual([]);
    clock.advance(2 * 60_000); expect(scheduler.tick()[0].level).toBe(1);
    clock.advance(15 * 60_000); expect(scheduler.tick()[0].level).toBe(2); scheduler.dismissToday(); expect(scheduler.tick()).toEqual([]);
  });

  it('gives a snoozed off-work reminder a new occurrence identity at the configured time', () => {
    const now = new Date(2026, 7, 21, 18, 30).getTime(); const clock = new FakeClock(now);
    const scheduler = new OffworkScheduler(clock, { ...defaultOffwork(), snoozeMinutes: 10 });
    const first = scheduler.tick()[0];

    scheduler.snooze(); clock.advance(10 * 60_000 - 1);
    expect(scheduler.tick()).toEqual([]);
    clock.advance(1);
    const repeated = scheduler.tick()[0];

    expect(repeated).toMatchObject({ type: 'offwork', level: 1, day: first.day });
    expect(repeated.occurrenceId).not.toBe(first.occurrenceId);
  });

  it('clamps a snooze to the configured latest off-work time', () => {
    const now = new Date(2026, 7, 21, 22, 25).getTime(); const clock = new FakeClock(now);
    const scheduler = new OffworkScheduler(clock, { ...defaultOffwork(), time: '22:00', latestTime: '22:30', snoozeMinutes: 15 });
    scheduler.tick();
    const result = scheduler.snooze();
    expect(result).toMatchObject({ type: 'offwork_snoozed', occurredAt: now, snoozedUntil: new Date(2026, 7, 21, 22, 30).getTime() });
    clock.advance(5 * 60_000);
    expect(scheduler.tick()[0]).toMatchObject({ type: 'offwork', latest: true });
  });

  it('persists the selected gentle off-work pose', () => {
    const clock = new FakeClock(new Date(2026, 7, 21, 18, 30).getTime());
    const scheduler = new OffworkScheduler(clock, { ...new OffworkScheduler(clock).snapshot(), pose: 'fainted' });
    expect(scheduler.snapshot().pose).toBe('fainted');
  });

  it('allows silent ambient chatter during focus without moving the pet', async () => {
    const clock = new FakeClock(10_000); const present = vi.fn(); const position = { x: 12, y: 34 };
    const timer = { ...createTimerState(), status: 'running', sessionId: 'focus', startedAt: 1_000, targetAt: clock.now() + 25 * 60_000 };
    const runtime = new AppRuntime({ store: new MemoryStore({ timer, pet: { position }, companion: { nextAmbientAt: 10_000 } }), clock, onPresentation: present, random: () => 0 });
    await runtime.init(); await runtime.tick();
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ category: 'ambientCompanion', voiceText: null }));
    expect(runtime.view().pet.position).toEqual(position);
    expect(runtime.view().companion.nextAmbientAt).toBe(clock.now() + 20 * 60_000);
  });

  it('passes the selected action and real timer progress to ambient AI and stores eight recent lines', async () => {
    const clock = new FakeClock(10 * 60_000); const present = vi.fn();
    const aiCopy = { generateResult: vi.fn(async () => ({ text: '我把耳朵放低一点，陪你守住剩下八分钟。', errorCode: null })) };
    const timer = { ...createTimerState(), status: 'running', phase: 'focus', task: '写产品方案', sessionId: 'focus', startedAt: 0,
      phaseStartedAt: 0, focusMs: 25 * 60_000, targetAt: clock.now() + 8 * 60_000, remainingMs: 8 * 60_000,
      activeSegments: [{ startedAt: 0, endedAt: null }] };
    const recentLines = Array.from({ length: 8 }, (_, index) => `以前的台词${index}`);
    const runtime = new AppRuntime({ store: new MemoryStore({ timer, companion: { nextAmbientAt: clock.now(), recentLines },
      settings: { aiCopyEnabled: true, aiApiKey: 'local-key' } }), clock, onPresentation: present, aiCopy, random: () => 0.7 });

    await runtime.init(); await runtime.tick();

    expect(aiCopy.generateResult).toHaveBeenCalledWith(expect.objectContaining({
      scene: 'ambientCompanion', petAction: 'comfort', timerStatus: 'running', timerPhase: 'focus', task: '写产品方案',
      elapsedMinutes: 17, remainingMinutes: 8, recentLines
    }));
    expect(runtime.view().companion.recentLines).toEqual([...recentLines.slice(1), '我把耳朵放低一点，陪你守住剩下八分钟。']);
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ kind: 'comfort', text: '我把耳朵放低一点，陪你守住剩下八分钟。', voiceText: null }));
  });

  it('retries similar ambient AI copy once and accepts the fresh result', async () => {
    const clock = new FakeClock(1_000); const present = vi.fn();
    const aiCopy = { generateResult: vi.fn()
      .mockResolvedValueOnce({ text: '你忙你的，我负责保持可爱。', errorCode: null })
      .mockResolvedValueOnce({ text: '窗外正在变暗，我替你守着这一小块桌面。', errorCode: null }) };
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 1_000, recentLines: ['你忙你的，我负责保持可爱。'] },
      settings: { aiCopyEnabled: true, aiApiKey: 'local-key' } }), clock, onPresentation: present, aiCopy, random: () => 0 });

    await runtime.init(); await runtime.tick();

    expect(aiCopy.generateResult).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ text: '窗外正在变暗，我替你守着这一小块桌面。' }));
  });

  it('uses the injected random source for scheduling and copy selection', async () => {
    const clock = new FakeClock(1_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 1_000 } }), clock, onPresentation: present, random: () => 0.999 });
    await runtime.init(); await runtime.tick();
    expect(runtime.view().companion.nextAmbientAt).toBe(2_100_100);
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ kind: 'comfort' }));
    expect(present.mock.calls.at(-1)[0].text).toContain('安静守着');
  });

  it.each([
    ['quiet', 45, 70],
    ['lively', 10, 20]
  ])('uses the configured %s chatter window', async (chatFrequency, minMinutes, maxMinutes) => {
    const clock = new FakeClock(1_000);
    const low = new AppRuntime({ store: new MemoryStore({ persona: { chatFrequency } }), clock, random: () => 0 }); await low.init(); await low.tick();
    const high = new AppRuntime({ store: new MemoryStore({ persona: { chatFrequency } }), clock, random: () => 0.999999 }); await high.init(); await high.tick();
    expect(low.view().companion.nextAmbientAt).toBe(clock.now() + minMinutes * 60_000);
    expect(high.view().companion.nextAmbientAt).toBe(clock.now() + maxMinutes * 60_000 - 1);
  });

  it('holds chatter until every suppression source ends, then delays 5-10 minutes', async () => {
    const clock = new FakeClock(1_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 1_000 } }), clock, onPresentation: present, random: () => 0 });
    await runtime.init(); await runtime.command('companion:suppress', { source: 'typing', active: true }); await runtime.command('companion:suppress', { source: 'editing', active: true });
    const persistedDue = runtime.view().companion.nextAmbientAt;
    clock.advance(2 * 60 * 60_000); await runtime.tick();
    expect(present).not.toHaveBeenCalled(); expect(runtime.view().companion.nextAmbientAt).toBe(persistedDue);
    await runtime.command('companion:suppress', { source: 'typing', active: false }); clock.advance(60 * 60_000); await runtime.tick();
    expect(present).not.toHaveBeenCalled(); expect(runtime.view().companion.nextAmbientAt).toBe(persistedDue);
    await runtime.command('companion:suppress', { source: 'editing', active: false });
    expect(runtime.view().companion.nextAmbientAt).toBe(clock.now() + 5 * 60_000);
    clock.advance(5 * 60_000); await runtime.tick(); expect(present).toHaveBeenCalledTimes(1);
  });

  it('respects interaction and companion enabled switches independently', async () => {
    const clock = new FakeClock(1_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 1_000 }, settings: { interactions: false, companionEnabled: false } }), clock, onPresentation: present });
    await runtime.init(); await runtime.command('interaction', { kind: 'comfort' }); await runtime.tick(); expect(present).not.toHaveBeenCalled();
    await runtime.command('settings:update', { companionEnabled: true }); await runtime.tick();
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ category: 'ambientCompanion' }));
  });

  it('saves the companion switch with the personality controls', async () => {
    const runtime = new AppRuntime({ store: new MemoryStore() });
    await runtime.init();

    await runtime.command('persona:update', { chatFrequency: 'quiet', companionEnabled: false });

    expect(runtime.view().persona.chatFrequency).toBe('quiet');
    expect(runtime.view().settings.companionEnabled).toBe(false);
    expect(runtime.view().companion.recentLines).toEqual([]);
  });
});
