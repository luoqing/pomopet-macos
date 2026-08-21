import { describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../src/platform/electron/runtime.mjs';
import { FakeClock } from '../src/core/time.js';
import { createTimerState } from '../src/core/timer.js';
import { defaultOffwork } from '../src/core/offwork.js';

class MemoryStore {
  constructor(value = {}) { this.value = structuredClone(value); this.saves = []; }
  async load(fallback) { return { ...structuredClone(fallback), ...structuredClone(this.value) }; }
  async save(value) { this.value = structuredClone(value); this.saves.push(this.value); }
}

describe('AppRuntime', () => {
  it('persists timer commands and restores an expired focus only once', async () => {
    const clock = new FakeClock(1_000); const store = new MemoryStore(); const presented = vi.fn();
    const first = new AppRuntime({ store, clock, onPresentation: presented }); await first.init();
    await first.command('timer:start', { task: '完成核心', focusMinutes: 1, breakMinutes: 1 });
    clock.advance(2 * 60_000); const recovered = new AppRuntime({ store, clock, onPresentation: presented }); await recovered.init();
    expect(recovered.view().timer.status).toBe('idle'); expect(Object.values(recovered.view().timer.completedByDay)).toEqual([1]);
    const again = new AppRuntime({ store, clock, onPresentation: presented }); await again.init();
    expect(Object.values(again.view().timer.completedByDay)).toEqual([1]);
  });

  it('routes due alarms to pet presentation and system notification', async () => {
    const clock = new FakeClock(100_000); const notify = vi.fn(); const present = vi.fn(); const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock, onPresentation: present, onNotify: notify }); await runtime.init();
    await runtime.command('alarm:add', { id: 'tea', label: '喝茶', type: 'once', at: 101_000 }); clock.advance(1_000); await runtime.tick();
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'alarm', label: '喝茶' }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('喝茶') }));
    await runtime.tick(); expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps settings, alarm edits and pet position durable', async () => {
    const store = new MemoryStore({ timer: createTimerState(), offwork: defaultOffwork() }); const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    await runtime.command('settings:update', { volume: .3, launchAtLogin: true }); await runtime.command('pet:position', { x: 20, y: 30 });
    const alarm = await runtime.command('alarm:add', { id: 'a', label: '原标签', type: 'once', at: 99 });
    await runtime.command('alarm:update', { id: alarm.alarms[0].id, patch: { label: '新标签' } });
    const restored = new AppRuntime({ store, clock: new FakeClock(1) }); await restored.init();
    expect(restored.view()).toMatchObject({ settings: { volume: .3, launchAtLogin: true }, pet: { position: { x: 20, y: 30 } }, alarms: [{ label: '新标签' }] });
  });
});
