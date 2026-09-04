import { describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../src/platform/electron/runtime.mjs';
import { FakeClock } from '../src/core/time.js';
import { createTimerState } from '../src/core/timer.js';
import { defaultOffwork } from '../src/core/offwork.js';
import { PRIORITY } from '../src/core/presentation.js';

class MemoryStore {
  constructor(value = {}) { this.value = structuredClone(value); this.saves = []; }
  async load(fallback) { return { ...structuredClone(fallback), ...structuredClone(this.value) }; }
  async save(value) { this.value = structuredClone(value); this.saves.push(this.value); }
}

async function finishBreak(runtime, clock, { focusMinutes = 1, breakMinutes = 1, ...start } = {}) {
  await runtime.command('timer:start', { focusMinutes, breakMinutes, ...start });
  clock.advance(focusMinutes * 60_000); await runtime.tick();
  clock.advance(breakMinutes * 60_000); await runtime.tick();
}

describe('AppRuntime', () => {
  it('never exposes the AI key or private transport settings in views and state broadcasts', async () => {
    const states = []; const store = new MemoryStore({ settings: { aiApiKey: 'super-secret', aiEndpoint: 'https://evil.invalid', aiModel: 'evil-model' } });
    const runtime = new AppRuntime({ store, clock: new FakeClock(1), onState: (value) => states.push(value) }); await runtime.init();
    expect(runtime.view().settings).toMatchObject({ aiKeyConfigured: true });
    expect(runtime.view().settings).not.toHaveProperty('aiApiKey');
    expect(runtime.view().settings).not.toHaveProperty('aiEndpoint');
    expect(runtime.view().settings).not.toHaveProperty('aiModel');
    expect(JSON.stringify(states)).not.toContain('super-secret');
  });

  it('allowlists renderer settings and mutates the key only through setAiKey', async () => {
    const store = new MemoryStore({ settings: { aiApiKey: 'original-key' } }); const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    await runtime.command('settings:update', { volume: 0.4, aiApiKey: 'stolen-key', aiEndpoint: 'https://evil.invalid', aiModel: 'evil-model', unknown: true });
    expect(store.value.settings).toMatchObject({ volume: 0.4, aiApiKey: 'original-key' });
    expect(store.value.settings).not.toMatchObject({ aiEndpoint: 'https://evil.invalid', aiModel: 'evil-model', unknown: true });
    await runtime.setAiKey('  replacement-key  ');
    expect(store.value.settings.aiApiKey).toBe('replacement-key');
    expect(runtime.view().settings.aiKeyConfigured).toBe(true);
  });

  it('persists quick mute without changing the configured voice mode', async () => {
    const store = new MemoryStore({ settings: { voiceMode: 'all' } });
    const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    expect(runtime.view().settings).toMatchObject({ muted: false, voiceMode: 'all' });

    await runtime.command('settings:mute', { muted: true });
    expect(runtime.view().settings).toMatchObject({ muted: true, voiceMode: 'all' });

    const restored = new AppRuntime({ store, clock: new FakeClock(1) }); await restored.init();
    expect(restored.view().settings).toMatchObject({ muted: true, voiceMode: 'all' });
    await expect(restored.command('settings:mute', { muted: 'yes' })).rejects.toThrow('invalid_muted_value');
  });

  it('defaults to full pet display and persists each desktop display mode', async () => {
    const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    expect(runtime.view().pet.displayMode).toBe('full');

    for (const mode of ['pet', 'timer', 'hidden']) {
      await runtime.command('pet:displayMode', { mode });
      expect(runtime.view().pet.displayMode).toBe(mode);
    }

    const restored = new AppRuntime({ store, clock: new FakeClock(1) }); await restored.init();
    expect(restored.view().pet.displayMode).toBe('hidden');
    await expect(restored.command('pet:displayMode', { mode: 'unknown' })).rejects.toThrow('invalid_pet_display_mode');
  });

  it('migrates the legacy hidden-pet preference to the hidden display mode', async () => {
    const runtime = new AppRuntime({ store: new MemoryStore({ pet: { visible: false, position: { x: 20, y: 30 } } }), clock: new FakeClock(1) });
    await runtime.init();
    expect(runtime.view().pet).toMatchObject({ visible: false, displayMode: 'hidden', position: { x: 20, y: 30 } });
  });
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
    await runtime.command('alarm:add', { id: 'tea', label: '喝茶', type: 'once', at: 101_000, pose: 'water' }); clock.advance(1_000); await runtime.tick();
    const finalText = present.mock.calls.at(-1)[0].text;
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'alarm', kind: 'water', label: '喝茶', voiceText: finalText, voice: null }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('喝茶'), body: finalText }));
    await runtime.tick(); expect(notify).toHaveBeenCalledTimes(1);
  });

  it('notifies an accepted alarm immediately even while its presentation is queued', async () => {
    const clock = new FakeClock(100_000); const notify = vi.fn(); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore(), clock, onPresentation: present, onNotify: notify }); await runtime.init();
    const blocker = { category: 'offwork', durableId: 'blocker', priority: PRIORITY.offworkBlocker, createdAt: clock.now(), duration: 60_000 };
    runtime.presentations.enqueue(blocker); runtime.active = blocker;
    await runtime.command('alarm:add', { id: 'water', label: '喝水', type: 'once', at: 101_000, pose: 'water' });
    clock.advance(1_000); await runtime.tick();
    expect(present).not.toHaveBeenCalled();
    expect(runtime.presentations.snapshot().pending).toEqual([expect.objectContaining({ category: 'alarm' })]);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ category: 'alarm', occurrenceId: 'water:101000', body: expect.any(String) }));
    await runtime.tick(); expect(notify).toHaveBeenCalledOnce();
  });

  it('persists snooze pruning on tick so an expired snooze does not return after restart', async () => {
    const now = new Date(2026, 7, 24, 10, 0).getTime(); const clock = new FakeClock(now);
    const store = new MemoryStore({ settings: { interactions: false }, alarms: [{ id: 'water', label: '喝水', type: 'weekly', time: '12:00', weekdays: [1], enabled: true,
      snoozes: [{ id: 'water:old:snooze:base', dueAt: now - 15 * 60_000 - 1, dismissed: false }] }] });
    const runtime = new AppRuntime({ store, clock }); await runtime.init();
    store.saves = []; await runtime.tick();
    expect(store.saves).toHaveLength(1);
    expect(store.value.alarms[0].snoozes).toEqual([]);
    const restored = new AppRuntime({ store, clock }); await restored.init();
    expect(restored.view().alarms[0].snoozes).toEqual([]);
  });

  it.each(['add', 're-enable'])('persists activeFrom across restart after recurring alarm %s', async (mode) => {
    const now = new Date(2026, 7, 24, 9, 5).getTime(); const clock = new FakeClock(now);
    const alarm = { id: 'interval-resume', label: '活动', type: 'interval', startTime: '09:00', endTime: '10:00', intervalMinutes: 15, weekdays: [1], enabled: false, snoozes: [] };
    const store = new MemoryStore({ settings: { interactions: false }, alarms: mode === 're-enable' ? [alarm] : [] });
    const runtime = new AppRuntime({ store, clock }); await runtime.init();
    if (mode === 'add') await runtime.command('alarm:add', { ...alarm, enabled: true });
    else await runtime.command('alarm:enabled', { id: alarm.id, enabled: true });
    expect(store.value.alarms[0].activeFrom).toBe(now);

    const notify = vi.fn(); const restored = new AppRuntime({ store, clock, onNotify: notify }); await restored.init();
    await restored.tick(); expect(notify).not.toHaveBeenCalled();
    clock.advance(10 * 60_000); await restored.tick();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('can replace alarm copy with generated text for speech synthesis', async () => {
    const clock = new FakeClock(100_000); const present = vi.fn(); const aiCopy = { generate: vi.fn(async () => '喝水啦，我已经把杯子叼到你面前了。') };
    const store = new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'local-test-key', aiTone: 'cute' } });
    const runtime = new AppRuntime({ store, clock, onPresentation: present, aiCopy }); await runtime.init();
    await runtime.command('alarm:add', { id: 'water', label: '喝水', type: 'once', at: 101_000, pose: 'water' });
    clock.advance(1_000); await runtime.tick();
    expect(aiCopy.generate).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'local-test-key', label: '喝水', tone: 'cute' }));
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ text: '喝水啦，我已经把杯子叼到你面前了。', voiceText: '喝水啦，我已经把杯子叼到你面前了。' }));
    expect(present.mock.calls.at(-1)[0].voice).toBeNull();
  });

  it('uses the persona fallback consistently when AI copy is unavailable', async () => {
    const clock = new FakeClock(100_000); const present = vi.fn(); const aiCopy = { generate: vi.fn(async () => null) };
    const store = new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'local-test-key', aiTone: 'sleepy' } });
    const runtime = new AppRuntime({ store, clock, onPresentation: present, aiCopy }); await runtime.init();
    await runtime.command('alarm:add', { id: 'meal', label: '吃饭了', type: 'once', at: 101_000, pose: 'feed' });
    clock.advance(1_000); await runtime.tick();
    expect(aiCopy.generate).toHaveBeenCalledWith(expect.objectContaining({ label: '吃饭了', tone: 'sleepy' }));
    const presentation = present.mock.calls.at(-1)[0];
    expect(presentation).toEqual(expect.objectContaining({ label: '吃饭了', voiceText: presentation.text, voice: null }));
  });

  it('uses AI praise text when a focus session completes', async () => {
    const clock = new FakeClock(1_000); const present = vi.fn(); const aiCopy = { generate: vi.fn(async () => '技术方案写完啦，末末宣布你今天的脑袋闪闪发光。') };
    const store = new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'local-test-key', aiTone: 'happy' } });
    const runtime = new AppRuntime({ store, clock, onPresentation: present, aiCopy }); await runtime.init();
    await runtime.command('timer:start', { task: '大屏承诺现货的技术方案', focusMinutes: 1, breakMinutes: 5 });
    clock.advance(60_000); await runtime.tick();
    expect(aiCopy.generate).toHaveBeenCalledWith(expect.objectContaining({ scene: 'focusComplete', task: '大屏承诺现货的技术方案', todayCount: 1, tone: 'happy' }));
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'focusComplete', actions: { reward: true, rewardDelayMs: 3_200 }, text: '技术方案写完啦，末末宣布你今天的脑袋闪闪发光。', voiceText: '技术方案写完啦，末末宣布你今天的脑袋闪闪发光。', voice: null }));
  });

  it('keeps settings, alarm edits and pet position durable', async () => {
    const store = new MemoryStore({ timer: createTimerState(), offwork: defaultOffwork() }); const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    await runtime.command('settings:update', { volume: .3, launchAtLogin: true, aiCopyEnabled: true, ttsVoiceName: 'Tingting' }); await runtime.command('pet:position', { x: 20, y: 30 });
    const alarm = await runtime.command('alarm:add', { id: 'a', label: '原标签', type: 'once', at: 99 });
    await runtime.command('alarm:update', { id: alarm.alarms[0].id, patch: { label: '新标签' } });
    const restored = new AppRuntime({ store, clock: new FakeClock(1) }); await restored.init();
    expect(restored.view()).toMatchObject({ settings: { volume: .3, launchAtLogin: true, aiCopyEnabled: true, ttsVoiceName: 'Tingting' }, pet: { position: { x: 20, y: 30 } }, alarms: [{ label: '新标签' }] });
  });

  it('persists every user-editable configuration and Todo field across restart', async () => {
    const now = new Date(2026, 7, 31, 10, 0).getTime();
    const clock = new FakeClock(now); const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock }); await runtime.init();

    await runtime.command('todo:add', { title: '初始事项', priority: 'P2', estimatePomos: 2 });
    const todoId = runtime.view().todos.activeId;
    await runtime.command('todo:update', { id: todoId, patch: { title: '编辑后的事项', priority: 'P0', estimatePomos: 4 } });
    await runtime.command('alarm:add', { id: 'activity', label: '旧提醒', type: 'weekly', time: '09:00', weekdays: [1], pose: 'annoyed', enabled: true });
    await runtime.command('alarm:update', { id: 'activity', patch: { label: '起来活动', type: 'interval', time: null, weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 60, pose: 'ball' } });
    await runtime.command('alarm:enabled', { id: 'activity', enabled: false });
    await runtime.command('offwork:update', { enabled: true, time: '19:15', weekdays: [1, 3, 5], pose: 'fainted', blockMode: true, snoozeMinutes: 20, escalateMinutes: 25 });
    await runtime.command('persona:update', { preset: 'witty', petName: '团子', ownerName: '阿青', customPrompt: '嘴硬心软，提醒要原创。', teaseLevel: 68, chatFrequency: 'lively' });
    await runtime.setAiKey('local-persistence-key');
    await runtime.command('settings:update', { voiceMode: 'all', volume: 0.55, ttsEngine: 'system', edgeTtsVoice: 'zh-CN-YunjianNeural', ttsVoiceName: 'Tingting', aiCopyEnabled: true, companionEnabled: false, interactions: false, launchAtLogin: true });

    const restored = new AppRuntime({ store, clock }); await restored.init();
    expect(restored.view()).toMatchObject({
      todos: { activeId: todoId, items: [{ id: todoId, title: '编辑后的事项', priority: 'P0', estimatePomos: 4 }] },
      alarms: [{ id: 'activity', label: '起来活动', type: 'interval', weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 60, pose: 'ball', enabled: false }],
      offwork: { enabled: true, time: '19:15', weekdays: [1, 3, 5], pose: 'fainted', blockMode: true, snoozeMinutes: 20, escalateMinutes: 25 },
      persona: { preset: 'witty', petName: '团子', ownerName: '阿青', customPrompt: '嘴硬心软，提醒要原创。', teaseLevel: 68, chatFrequency: 'lively' },
      settings: { voiceMode: 'all', volume: 0.55, ttsEngine: 'system', edgeTtsVoice: 'zh-CN-YunjianNeural', ttsVoiceName: 'Tingting', aiCopyEnabled: true, aiKeyConfigured: true, companionEnabled: false, interactions: false, launchAtLogin: true }
    });
    expect(store.value.settings.aiApiKey).toBe('local-persistence-key');
  });

  it('persists edits to the current timer task', async () => {
    const store = new MemoryStore(); const runtime = new AppRuntime({ store, clock: new FakeClock(1) }); await runtime.init();
    await runtime.command('timer:start', { task: '旧任务', focusMinutes: 25, breakMinutes: 5 });
    await runtime.command('timer:updateTask', { task: '新任务' });
    const restored = new AppRuntime({ store, clock: new FakeClock(1) }); await restored.init();
    expect(restored.view().timer.task).toBe('新任务');
  });

  it('tracks completed pomodoros and spent time on the active todo', async () => {
    const clock = new FakeClock(1_000); const store = new MemoryStore(); const runtime = new AppRuntime({ store, clock }); await runtime.init();
    await runtime.command('todo:add', { title: '写技术方案', priority: 'P0', estimatePomos: 1 });
    const todoId = runtime.view().todos.activeId;
    await runtime.command('timer:start', { task: '写技术方案', todoId, focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); await runtime.tick();
    expect(runtime.view().todos.items[0]).toMatchObject({ id: todoId, completedPomos: 1, spentMs: 60_000, done: false });
    await runtime.command('todo:toggle', { id: todoId, done: true });
    expect(runtime.view().todos.items[0].done).toBe(true);
  });

  it('persists a pending break choice across restart and never starts focus automatically', async () => {
    const clock = new FakeClock(1_000); const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock }); await runtime.init();
    await runtime.command('todo:add', { title: '继续这件事' });
    const previousTodoId = runtime.view().todos.activeId;
    await finishBreak(runtime, clock, { task: '继续这件事', todoId: previousTodoId, focusMinutes: 2, breakMinutes: 3 });

    expect(runtime.view().timer).toMatchObject({ status: 'idle', pendingBreakChoice: {
      previousTodoId, focusMinutes: 2, breakMinutes: 3, createdAt: clock.now()
    } });
    const restored = new AppRuntime({ store, clock }); await restored.init();
    clock.advance(20_000); await restored.tick();
    expect(restored.view().timer.status).toBe('idle');
    expect(restored.view().timer.pendingBreakChoice).toEqual(runtime.view().timer.pendingBreakChoice);
    expect(restored.view().breakContinuation).toMatchObject({ previousTodoId, canContinue: true });
  });

  it('keeps the semantic previous todo while putting a manually selected todo first', async () => {
    const clock = new FakeClock(1_000); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '刚才任务', priority: 'P0' }); const previousTodoId = runtime.view().todos.activeId;
    await runtime.command('todo:add', { title: '手动选择', priority: 'P2' }); const selectedTodoId = runtime.view().todos.activeId;
    await runtime.command('todo:active', { id: previousTodoId });
    await runtime.command('timer:start', { task: '刚才任务', todoId: previousTodoId, focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); await runtime.tick();
    await runtime.command('todo:active', { id: selectedTodoId });
    clock.advance(60_000); await runtime.tick();

    expect(runtime.view().breakContinuation).toMatchObject({
      previousTodoId,
      canContinue: true,
      recommendedTodoId: selectedTodoId,
      actions: { continue: true, choose: true, idle: true, addTodo: false }
    });
    expect(runtime.view().breakContinuation.choices.map(({ id }) => id).slice(0, 2)).toEqual([selectedTodoId, previousTodoId]);
  });

  it('continues the previous todo with its latest title and original durations', async () => {
    const clock = new FakeClock(1_000); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '旧标题' }); const todoId = runtime.view().todos.activeId;
    await finishBreak(runtime, clock, { task: '旧标题', todoId, focusMinutes: 2, breakMinutes: 3 });
    await runtime.command('todo:update', { id: todoId, patch: { title: '最新标题' } });

    await runtime.command('break:continue');
    expect(runtime.view().timer).toMatchObject({ status: 'running', phase: 'focus', todoId, task: '最新标题', focusMs: 120_000, breakMs: 180_000, pendingBreakChoice: null });
    expect(runtime.view().breakContinuation).toBeNull();
  });

  it('continues an unfinished previous todo across local midnight using its latest title', async () => {
    const clock = new FakeClock(new Date(2026, 7, 28, 23, 58).getTime());
    const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '跨日旧标题', priority: 'P2' }); const todoId = runtime.view().todos.activeId;
    await finishBreak(runtime, clock, { task: '跨日旧标题', todoId, focusMinutes: 1, breakMinutes: 2 });
    await runtime.command('todo:update', { id: todoId, patch: { title: '跨日最新标题' } });

    expect(runtime.view().todos.items).toEqual([]);
    expect(runtime.view().breakContinuation).toMatchObject({
      previousTodoId: todoId,
      canContinue: true,
      recommendedTodoId: null,
      choices: [],
      actions: { continue: true, choose: false, idle: true, addTodo: false }
    });
    await runtime.command('break:continue');
    expect(runtime.view().timer).toMatchObject({ status: 'running', todoId, task: '跨日最新标题', focusMs: 60_000, breakMs: 120_000, pendingBreakChoice: null });
  });

  it.each(['completed', 'deleted'])('keeps a %s previous todo unavailable after crossing local midnight', async (mode) => {
    const clock = new FakeClock(new Date(2026, 7, 28, 23, 58).getTime());
    const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '跨日不可继续' }); const todoId = runtime.view().todos.activeId;
    await runtime.command('timer:start', { task: '跨日不可继续', todoId, focusMinutes: 1, breakMinutes: 2 });
    clock.advance(60_000); await runtime.tick();
    if (mode === 'completed') await runtime.command('todo:toggle', { id: todoId, done: true });
    else await runtime.command('todo:remove', { id: todoId });
    clock.advance(120_000); await runtime.tick();

    const pending = runtime.view().timer.pendingBreakChoice;
    expect(runtime.view().breakContinuation).toMatchObject({ previousTodoId: todoId, canContinue: false, choices: [] });
    await expect(runtime.command('break:continue')).rejects.toThrow('todo_unavailable');
    expect(runtime.view().timer.pendingBreakChoice).toEqual(pending);
  });

  it.each(['completed', 'deleted'])('removes continue when the previous todo is %s', async (mode) => {
    const clock = new FakeClock(1_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore(), clock, onPresentation: present }); await runtime.init();
    await runtime.command('todo:add', { title: '推荐下一项', priority: 'P1' }); const nextTodoId = runtime.view().todos.activeId;
    await runtime.command('todo:add', { title: '刚才任务', priority: 'P0' }); const previousTodoId = runtime.view().todos.activeId;
    await runtime.command('timer:start', { task: '刚才任务', todoId: previousTodoId, focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); await runtime.tick();
    if (mode === 'completed') await runtime.command('todo:toggle', { id: previousTodoId, done: true });
    else await runtime.command('todo:remove', { id: previousTodoId });
    clock.advance(60_000); await runtime.tick();

    expect(runtime.view().breakContinuation).toMatchObject({ previousTodoId, canContinue: false, recommendedTodoId: nextTodoId,
      actions: { continue: false, choose: true, idle: true, addTodo: false } });
    const breakPresentation = [runtime.presentations.snapshot().current, ...runtime.presentations.snapshot().pending]
      .find((entry) => entry?.category === 'breakComplete');
    expect(breakPresentation.actions).toMatchObject({ breakContinuation: true, canContinue: false, recommendedTodoId: nextTodoId, addTodo: false });
  });

  it('keeps pending choice after invalid commands and clears it only after a valid switch or idle action', async () => {
    const clock = new FakeClock(1_000); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '可选任务' }); const chosenId = runtime.view().todos.activeId;
    await finishBreak(runtime, clock, { task: '无 Todo 专注', todoId: null, focusMinutes: 2, breakMinutes: 3 });
    const pending = runtime.view().timer.pendingBreakChoice;

    await expect(runtime.command('break:continue')).rejects.toThrow('todo_unavailable');
    await expect(runtime.command('break:switch', { todoId: 'missing' })).rejects.toThrow('todo_unavailable');
    expect(runtime.view().timer.pendingBreakChoice).toEqual(pending);
    await runtime.command('break:switch', { todoId: chosenId });
    expect(runtime.view().timer).toMatchObject({ status: 'running', todoId: chosenId, task: '可选任务', focusMs: 120_000, breakMs: 180_000, pendingBreakChoice: null });

    await runtime.command('timer:complete'); clock.advance(180_000); await runtime.tick();
    expect(runtime.view().timer.pendingBreakChoice).not.toBeNull();
    await runtime.command('break:idle');
    expect(runtime.view().timer).toMatchObject({ status: 'idle', pendingBreakChoice: null });
  });

  it('offers addTodo when no unfinished todo remains', async () => {
    const clock = new FakeClock(1_000); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await finishBreak(runtime, clock, { task: '临时任务', todoId: null });
    expect(runtime.view().breakContinuation).toMatchObject({ canContinue: false, choices: [], recommendedTodoId: null,
      actions: { continue: false, choose: false, idle: true, addTodo: true } });
  });

  it('does not present a stale break bubble when break:idle resolves during delayed AI copy', async () => {
    const clock = new FakeClock(1_000); let resolveBreakCopy;
    const aiCopy = { generate: vi.fn(({ scene }) => scene === 'breakComplete'
      ? new Promise((resolve) => { resolveBreakCopy = resolve; })
      : Promise.resolve('即时文案')) };
    const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock, aiCopy }); await runtime.init();
    await runtime.command('todo:add', { title: '刚才任务' }); const todoId = runtime.view().todos.activeId;
    await runtime.command('timer:start', { task: '刚才任务', todoId, focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); await runtime.tick(); clock.advance(60_000);

    const completingBreak = runtime.tick();
    await vi.waitFor(() => expect(resolveBreakCopy).toBeTypeOf('function'));
    await runtime.command('break:idle');
    resolveBreakCopy('迟到的休息结束文案'); await completingBreak;

    expect(runtime.view().breakContinuation).toBeNull();
    expect([runtime.presentations.snapshot().current, ...runtime.presentations.snapshot().pending]
      .some((entry) => entry?.category === 'breakComplete')).toBe(false);
  });

  it.each(['completed', 'deleted'])('recomputes break actions when the previous todo is %s during delayed AI copy', async (mode) => {
    const clock = new FakeClock(1_000); let resolveBreakCopy;
    const aiCopy = { generate: vi.fn(({ scene }) => scene === 'breakComplete'
      ? new Promise((resolve) => { resolveBreakCopy = resolve; })
      : Promise.resolve('即时文案')) };
    const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock, aiCopy }); await runtime.init();
    await runtime.command('todo:add', { title: '当前推荐', priority: 'P1' }); const recommendedTodoId = runtime.view().todos.activeId;
    await runtime.command('todo:add', { title: '刚才任务', priority: 'P0' }); const previousTodoId = runtime.view().todos.activeId;
    await runtime.command('timer:start', { task: '刚才任务', todoId: previousTodoId, focusMinutes: 1, breakMinutes: 1 });
    clock.advance(60_000); await runtime.tick(); clock.advance(60_000);

    const completingBreak = runtime.tick();
    await vi.waitFor(() => expect(resolveBreakCopy).toBeTypeOf('function'));
    if (mode === 'completed') await runtime.command('todo:toggle', { id: previousTodoId, done: true });
    else await runtime.command('todo:remove', { id: previousTodoId });
    resolveBreakCopy('最新状态的休息结束文案'); await completingBreak;

    const presentation = [runtime.presentations.snapshot().current, ...runtime.presentations.snapshot().pending]
      .find((entry) => entry?.category === 'breakComplete');
    expect(presentation.actions).toMatchObject({ breakContinuation: true, canContinue: false, recommendedTodoId, addTodo: false });
    expect(runtime.view().timer.pendingBreakChoice.previousTodoId).toBe(previousTodoId);
  });

  it('can disable intimate interactions without affecting reminders', async () => {
    const present = vi.fn(); const runtime = new AppRuntime({ store: new MemoryStore(), clock: new FakeClock(1), onPresentation: present }); await runtime.init();
    await runtime.command('settings:update', { interactions: false }); await runtime.command('interaction', { kind: 'comfort' });
    expect(present).not.toHaveBeenCalled();
    await runtime.command('timer:start', { focusMinutes: 1, breakMinutes: 1 }); expect(present).toHaveBeenCalledWith(expect.objectContaining({ kind: 'focus' }));
  });

  it('occasionally presents low-priority companion moments while idle', async () => {
    const clock = new FakeClock(10_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 10_000 } }), clock, onPresentation: present }); await runtime.init();
    await runtime.tick();
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'ambientCompanion', priority: 10 }));
    expect(runtime.view().companion.nextAmbientAt).toBeGreaterThan(clock.now());
  });

  it('discards chatter when an alarm is due in the same tick and keeps the fresh ambient schedule', async () => {
    const clock = new FakeClock(100_000); const present = vi.fn();
    const store = new MemoryStore({
      alarms: [{ id: 'water', label: '喝水', type: 'once', at: 100_000, enabled: true, snoozes: [] }],
      companion: { nextAmbientAt: 100_000 }
    });
    const runtime = new AppRuntime({ store, clock, onPresentation: present, random: () => 0 }); await runtime.init(); await runtime.tick();
    expect(present).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ category: 'alarm' }));
    expect(runtime.presentations.snapshot().pending).toEqual([]);
    expect(runtime.view().companion.nextAmbientAt).toBe(clock.now() + 20 * 60_000);
  });

  it('does not requeue active chatter after an alarm interrupts it', async () => {
    const clock = new FakeClock(100_000); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore({ companion: { nextAmbientAt: 100_000 } }), clock, onPresentation: present, random: () => 0 }); await runtime.init(); await runtime.tick();
    await runtime.command('alarm:add', { id: 'water', label: '喝水', type: 'once', at: 101_000 }); clock.advance(1_000); await runtime.tick();
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'alarm' }));
    expect(runtime.presentations.snapshot().pending).toEqual([]);
  });

  it('uses AI text for ambient companion moments without speech', async () => {
    const clock = new FakeClock(10_000); const present = vi.fn();
    const aiCopy = { generate: vi.fn(async () => '我在旁边乖乖陪你，累了就看我一眼。') };
    const store = new MemoryStore({ companion: { nextAmbientAt: 10_000 }, settings: { aiCopyEnabled: true, aiApiKey: 'local-test-key', aiTone: 'comfort' } });
    const runtime = new AppRuntime({ store, clock, onPresentation: present, aiCopy }); await runtime.init();
    await runtime.tick();
    expect(aiCopy.generate).toHaveBeenCalledWith(expect.objectContaining({ scene: 'ambientCompanion', tone: 'comfort' }));
    expect(present).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'ambientCompanion', text: '我在旁边乖乖陪你，累了就看我一眼。', voiceText: null }));
  });

  it('allows companion moments during focus sessions', async () => {
    const clock = new FakeClock(10_000); const present = vi.fn();
    const timer = { ...createTimerState(), status: 'running', sessionId: 'focus', startedAt: 1_000, targetAt: clock.now() + 25 * 60_000 };
    const runtime = new AppRuntime({ store: new MemoryStore({ timer, companion: { nextAmbientAt: 10_000 } }), clock, onPresentation: present }); await runtime.init();
    await runtime.tick();
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ category: 'ambientCompanion', voiceText: null }));
    expect(runtime.view().companion.nextAmbientAt).toBeGreaterThan(clock.now());
  });

  it.each([
    ['disabled', { aiCopyEnabled: false, aiApiKey: 'key' }],
    ['missing-key', { aiCopyEnabled: true, aiApiKey: '' }]
  ])('reports builtin AI status when %s', async (_case, settings) => {
    const aiCopy = { generate: vi.fn() }; const runtime = new AppRuntime({ store: new MemoryStore({ settings }), clock: new FakeClock(1), aiCopy }); await runtime.init();
    await runtime.command('ai:test');
    expect(runtime.view().aiStatus).toMatchObject({ status: 'builtin', sample: null, errorCode: null, checkedAt: 1 });
    expect(aiCopy.generate).not.toHaveBeenCalled();
  });

  it('reports a connected AI test sample without presenting or speaking it', async () => {
    const present = vi.fn(); const aiCopy = { generate: vi.fn(async () => '测试文案') };
    const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock: new FakeClock(2), aiCopy, onPresentation: present }); await runtime.init();
    await runtime.command('ai:test');
    expect(runtime.view().aiStatus).toEqual({ status: 'connected', sample: '测试文案', errorCode: null, checkedAt: 2 });
    expect(present).not.toHaveBeenCalled();
  });

  it.each([
    ['null', () => Promise.resolve(null), 'empty_response'],
    ['throw', () => Promise.reject(new Error('secret')), 'request_failed']
  ])('reports stable failed AI status for %s', async (_case, generate, errorCode) => {
    const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock: new FakeClock(3), aiCopy: { generate } }); await runtime.init();
    await runtime.command('ai:test');
    expect(runtime.view().aiStatus).toEqual({ status: 'failed', sample: null, errorCode, checkedAt: 3 });
  });

  it('times out AI tests with a stable error code', async () => {
    vi.useFakeTimers();
    try {
      const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock: new FakeClock(4), aiCopy: { generate: () => new Promise(() => {}) }, aiDeadlineMs: 1_500 }); await runtime.init();
      const pending = runtime.command('ai:test'); await vi.advanceTimersByTimeAsync(1_500); await pending;
      expect(runtime.view().aiStatus).toEqual({ status: 'failed', sample: null, errorCode: 'timeout', checkedAt: 4 });
    } finally { vi.useRealTimers(); }
  });

  it('aborts the losing AI request at the runtime deadline', async () => {
    vi.useFakeTimers();
    try {
      let requestSignal;
      const aiCopy = { generateResult: vi.fn(({ signal }) => {
        requestSignal = signal;
        return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ text: null, errorCode: 'aborted' }), { once: true }));
      }) };
      const runtime = new AppRuntime({ store: new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' } }), clock: new FakeClock(4), aiCopy, aiDeadlineMs: 1_500 }); await runtime.init();
      const pending = runtime.command('ai:test'); await vi.advanceTimersByTimeAsync(1_500); await pending;
      expect(requestSignal.aborted).toBe(true);
      expect(runtime.view().aiStatus.errorCode).toBe('timeout');
    } finally { vi.useRealTimers(); }
  });

  it('uses one fallback string for alarm presentation, notification and voice after the AI deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolveAi; let requestSignal; const aiCopy = { generateResult: vi.fn(({ signal }) => { requestSignal = signal; return new Promise((resolve) => { resolveAi = resolve; }); }) };
      const clock = new FakeClock(100_000); const present = vi.fn(); const notify = vi.fn();
      const store = new MemoryStore({ settings: { aiCopyEnabled: true, aiApiKey: 'key' }, persona: { preset: 'gentle', petName: '团子', ownerName: '阿青' } });
      const runtime = new AppRuntime({ store, clock, onPresentation: present, onNotify: notify, aiCopy, aiDeadlineMs: 1_500, random: () => 0 }); await runtime.init();
      await runtime.command('alarm:add', { id: 'water', label: '喝水', type: 'once', at: 101_000 }); clock.advance(1_000);
      const pending = runtime.tick(); await vi.advanceTimersByTimeAsync(1_499); expect(present).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await pending;
      const finalText = present.mock.calls.at(-1)[0].text;
      expect(finalText).toContain('团子');
      expect(present.mock.calls.at(-1)[0].voiceText).toBe(finalText);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ body: finalText }));
      expect(requestSignal.aborted).toBe(true);
      resolveAi('迟到的 AI 文案'); await Promise.resolve();
      expect(present).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('assigns presentation lifetimes and keeps blocker, alarm, focus, break and off-work priority order', async () => {
    const clock = new FakeClock(new Date(2026, 7, 31, 18, 30).getTime());
    const runtime = new AppRuntime({ store: new MemoryStore(), clock });
    await runtime.init();
    await runtime.command('alarm:add', { id: 'water', label: '喝水', type: 'once', at: clock.now() + 1_000, pose: 'water' });
    clock.advance(1_000); await runtime.tick();
    const alarm = runtime.presentations.snapshot().current;
    expect(PRIORITY.offworkBlocker).toBeGreaterThan(PRIORITY.alarm);
    expect(PRIORITY.alarm).toBeGreaterThan(PRIORITY.focusComplete);
    expect(PRIORITY.focusComplete).toBeGreaterThan(PRIORITY.break);
    expect(PRIORITY.break).toBeGreaterThan(PRIORITY.offwork);
    expect(alarm).toMatchObject({ category: 'alarm', occurredAt: clock.now(), expiresAt: clock.now() + 15 * 60_000 });
  });

  it('updates and exposes a normalized persona', async () => {
    const runtime = new AppRuntime({ store: new MemoryStore(), clock: new FakeClock(1) }); await runtime.init();
    await runtime.command('persona:update', { preset: 'sunny', petName: '闪闪', teaseLevel: 999 });
    expect(runtime.view().persona).toMatchObject({ preset: 'sunny', petName: '闪闪', teaseLevel: 100 });
  });

  it('starts focus directly from an unfinished Todo and makes it active', async () => {
    const runtime = new AppRuntime({ store: new MemoryStore(), clock: new FakeClock() });
    await runtime.init();
    await runtime.command('todo:add', { title: '整理发布清单', priority: 'P0', estimatePomos: 2 });
    const todoId = runtime.view().todos.activeId;
    await runtime.command('todo:add', { title: '另一件事', priority: 'P1', estimatePomos: 1 });

    await runtime.command('todo:start', { id: todoId, focusMinutes: 50, breakMinutes: 10 });

    expect(runtime.view()).toMatchObject({
      todos: { activeId: todoId },
      timer: { status: 'running', phase: 'focus', todoId, task: '整理发布清单', focusMs: 3_000_000, breakMs: 600_000 }
    });
  });

  it('does not start focus from a completed or missing Todo', async () => {
    const runtime = new AppRuntime({ store: new MemoryStore(), clock: new FakeClock() });
    await runtime.init();
    await runtime.command('todo:add', { title: '已经完成' });
    const todoId = runtime.view().todos.activeId;
    await runtime.command('todo:toggle', { id: todoId, done: true });

    await expect(runtime.command('todo:start', { id: todoId })).rejects.toThrow('todo_unavailable');
    await expect(runtime.command('todo:start', { id: 'missing' })).rejects.toThrow('todo_unavailable');
    expect(runtime.view().timer.status).toBe('idle');
  });

  it('uses the configured gentle off-work pose', async () => {
    const clock = new FakeClock(new Date(2026, 7, 21, 18, 30).getTime()); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore(), clock, onPresentation: present }); await runtime.init();
    await runtime.command('offwork:update', { pose: 'fainted' }); await runtime.tick();
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fainted', actions: expect.objectContaining({ offwork: true }) }));
  });

  it('routes a due off-work reminder to both the pet and the system notification once', async () => {
    const clock = new FakeClock(new Date(2026, 7, 21, 18, 30).getTime());
    const present = vi.fn(); const notify = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore(), clock, onPresentation: present, onNotify: notify });
    await runtime.init(); await runtime.tick();

    const presentation = present.mock.calls.at(-1)[0];
    expect(presentation).toMatchObject({ category: 'offwork', actions: { offwork: true, snoozeMinutes: 10 } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ category: 'offwork', occurrenceId: expect.any(String), body: presentation.text }));
    await runtime.tick();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('accepts the off-work reminder again when a ten-minute snooze expires', async () => {
    const now = new Date(2026, 7, 21, 18, 30).getTime(); const clock = new FakeClock(now);
    const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('offwork:update', { snoozeMinutes: 10 });
    await runtime.tick();
    const firstId = runtime.presentations.snapshot().seen.find((id) => id.startsWith('offwork:'));

    await runtime.command('offwork:snooze');
    clock.advance(10 * 60_000); await runtime.tick();
    const offworkIds = runtime.presentations.snapshot().seen.filter((id) => id.startsWith('offwork:'));

    expect(offworkIds).toHaveLength(2);
    expect(offworkIds[1]).not.toBe(firstId);
    expect(runtime.presentations.snapshot().pending).toEqual([expect.objectContaining({ category: 'offwork', actions: { offwork: true, snoozeMinutes: 10 } })]);
  });

  it('keeps off-work blocker preference and clears stale daily state when time changes', async () => {
    const clock = new FakeClock(new Date(2026, 7, 21, 18, 30).getTime()); const present = vi.fn();
    const runtime = new AppRuntime({ store: new MemoryStore(), clock, onPresentation: present }); await runtime.init();
    await runtime.command('offwork:update', { blockMode: true }); await runtime.tick();
    expect(runtime.view().offwork.blockMode).toBe(true);
    expect(Object.keys(runtime.view().offwork.dayState)).toHaveLength(1);
    await runtime.command('offwork:update', { time: '22:30' });
    expect(runtime.view().offwork.time).toBe('22:30');
    expect(runtime.view().offwork.blockMode).toBe(true);
    expect(runtime.view().offwork.dayState).toEqual({});
  });

  it('persists completed and stopped focus time into the daily review without overcounting tomatoes', async () => {
    const start = new Date(2026, 8, 4, 10, 0).getTime();
    const clock = new FakeClock(start); const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock }); await runtime.init();
    await runtime.command('todo:add', { title: '实现时间回顾' });
    const todoId = runtime.view().todos.activeId;
    await runtime.command('todo:start', { id: todoId, focusMinutes: 25, breakMinutes: 5 });
    clock.advance(10 * 60_000); await runtime.command('timer:stop');
    await runtime.command('todo:start', { id: todoId, focusMinutes: 25, breakMinutes: 5 });
    clock.advance(5 * 60_000); await runtime.command('timer:complete');

    const view = runtime.view();
    expect(view.todos.items[0]).toMatchObject({ completedPomos: 1, spentMs: 15 * 60_000 });
    expect(view.review.days[0].totals.focusMs).toBe(15 * 60_000);
    expect(view.review.days[0].counts).toMatchObject({ early: 1, stopped: 1 });
    const restored = new AppRuntime({ store, clock }); await restored.init();
    expect(restored.view().review.days[0].totals.focusMs).toBe(15 * 60_000);
  });

  it('records reminder occurrences by configured label and the first response', async () => {
    const start = new Date(2026, 8, 4, 10, 0).getTime();
    const clock = new FakeClock(start); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('alarm:add', { id: 'water', label: '起来喝水', type: 'once', at: start + 1_000, pose: 'water' });
    clock.advance(1_000); await runtime.tick();
    const occurrenceId = runtime.view().review.days[0].reminders[0] && runtime.data.analytics.days['2026-09-04'].reminderOccurrences[0].occurrenceId;
    await runtime.command('alarm:dismiss', { alarmId: 'water', occurrenceId });
    expect(runtime.data.analytics.days['2026-09-04'].reminderOccurrences[0]).toMatchObject({
      reminderText: '起来喝水', response: { type: 'dismissed', respondedAt: clock.now() }
    });
  });

  it('supports ending a break early before choosing the next task', async () => {
    const clock = new FakeClock(1_000); const runtime = new AppRuntime({ store: new MemoryStore(), clock }); await runtime.init();
    await runtime.command('todo:add', { title: '继续做' }); const todoId = runtime.view().todos.activeId;
    await runtime.command('todo:start', { id: todoId, focusMinutes: 1, breakMinutes: 5 });
    clock.advance(60_000); await runtime.tick(); clock.advance(30_000);
    await runtime.command('timer:endBreak');
    expect(runtime.view()).toMatchObject({ timer: { status: 'idle' }, breakContinuation: { previousTodoId: todoId, canContinue: true } });
  });

  it('stores work boundaries and records snooze and final off-work actions', async () => {
    const now = new Date(2026, 8, 4, 18, 30).getTime(); const clock = new FakeClock(now); const store = new MemoryStore();
    const runtime = new AppRuntime({ store, clock }); await runtime.init();
    await runtime.command('offwork:update', { workStart: '10:00', time: '18:30', latestTime: '22:30', exclusions: [{ start: '12:00', end: '14:00', label: '午休' }] });
    await runtime.tick(); await runtime.command('offwork:snooze', { note: '再收个尾' }); clock.advance(15 * 60_000); await runtime.command('offwork:dismiss', { note: '明天先补测试' });
    const day = runtime.data.analytics.days['2026-09-04'];
    expect(runtime.view().offwork).toMatchObject({ workStart: '10:00', latestTime: '22:30', exclusions: [{ start: '12:00', end: '14:00', label: '午休' }] });
    expect(day.workdayEvents.map((event) => event.type)).toEqual(['offwork_snoozed', 'offwork_finished']);
    expect(day.workdayEvents.map((event) => event.note)).toEqual(['再收个尾', '明天先补测试']);
  });
});
