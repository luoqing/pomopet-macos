import { expect, test } from '@playwright/test';

test('control surface renders and completes browser fallback timer flow', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '认真工作，也要好好生活。' })).toBeVisible();
  expect(await page.locator('.window-drag-strip').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('drag');
  const dragStripBox = await page.locator('.window-drag-strip').boundingBox();
  expect(dragStripBox.height).toBeGreaterThanOrEqual(200);
  expect(dragStripBox.x).toBeGreaterThanOrEqual(70);
  expect(await page.locator('.masthead').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('drag');
  expect(await page.getByRole('heading', { name: '认真工作，也要好好生活。' }).evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('drag');
  expect(await page.locator('.timer-card').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('no-drag');
  await expect(page.locator('.companion-card')).toHaveCount(0);
  expect(await page.locator('.drawer.active').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('no-drag');
  expect(await page.locator('#mainAction').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('no-drag');
  expect(await page.locator('#showPet').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('no-drag');
  await page.locator('#showPet').click();
  expect(await page.locator('#task').evaluate((node) => globalThis.getComputedStyle(node).webkitAppRegion)).toBe('no-drag');
  await page.locator('#todoTitle').fill('完成S级评论需求的代码CR和测试');
  await page.locator('#todoPriority').selectOption('P0');
  await page.locator('#todoEstimate').fill('2');
  await page.locator('#addTodo').click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await expect(page.locator('#todoStats')).toContainText('计划 2 番茄');
  await expect(page.locator('#task')).toHaveValue('完成S级评论需求的代码CR和测试');
  await page.getByPlaceholder('这颗番茄，想完成什么？').fill('验证 Pomopet 核心流程');
  await page.getByRole('button', { name: '开始专注', exact: true }).click(); await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
  await expect(page.locator('#clock')).toHaveText(/^24:5[89]$/);
  await page.getByRole('button', { name: '暂停' }).click(); await expect(page.getByRole('button', { name: '继续' })).toBeVisible();
  await page.getByRole('tab', { name: '提醒计划', exact: true }).click(); await page.getByRole('button', { name: '新建提醒' }).click();
  await expect(page.getByPlaceholder('提醒内容')).toBeVisible(); await expect(page.locator('#alarmWhen')).toHaveAttribute('type', 'datetime-local');
  await expect(page.locator('#alarmPose option')).toHaveCount(12);
  await page.locator('#alarmLabel').fill('喝水');
  await page.locator('[data-alarm-type="weekly"]').click();
  await page.locator('#alarmTime').fill('08:30');
  await page.locator('#alarmPose').selectOption('water'); await expect(page.locator('#alarmPose')).toHaveValue('water');
  await page.locator('#saveAlarm').click();
  await expect(page.locator('.alarm-time')).toHaveText('08:30');
  await page.getByRole('tab', { name: '下班提醒' }).click(); await page.locator('#editOffwork').click(); await page.locator('#offworkTime').fill('22:30'); await page.locator('#offworkBlockMode').check(); await page.getByRole('button', { name: '保存下班规则' }).click();
  await expect(page.locator('#offworkTime')).toHaveValue('22:30'); await expect(page.locator('#offworkBlockMode')).toBeChecked();
  await page.getByRole('tab', { name: '声音与启动' }).click(); await page.locator('#editSettings').click(); await expect(page.locator('#ttsVoiceName')).toBeVisible(); await page.locator('#aiCopyEnabled').check(); await page.locator('#aiApiKey').fill('local-test-key'); await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.locator('#aiCopyEnabled')).toBeChecked(); await expect(page.locator('#aiTone')).toHaveCount(0);
  expect(errors).toEqual([]); await page.screenshot({ path: 'artifacts/screenshots/control-window.png', fullPage: true });
});

test('custom timer edits survive state ticks and save without an apply button', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(),
      timer: { status: 'idle', phase: 'focus', task: '', remainingMs: 15 * 60_000, focusMs: 15 * 60_000, breakMs: 5 * 60_000, targetAt: null, todayCount: 0 },
      todos: { items: [], activeId: null }, alarms: [], review: { days: [] },
      offwork: { enabled: false, time: '18:30', weekdays: [] },
      persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' },
      settings: { preset: 'custom', customFocus: 15, customBreak: 5, voiceMode: 'off' }
    };
    const listeners = []; const commands = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__customTimerCommands = commands;
    globalThis.__emitPomopetState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state),
      command: async (name, payload) => {
        commands.push({ name, payload });
        if (name === 'settings:update') state.settings = { ...state.settings, ...payload };
        if (name === 'timer:start') state.timer = { ...state.timer, status: 'running', focusMs: payload.focusMinutes * 60_000, breakMs: payload.breakMinutes * 60_000, remainingMs: payload.focusMinutes * 60_000, targetAt: state.now + payload.focusMinutes * 60_000 };
        globalThis.__emitPomopetState();
        return copy(state);
      },
      onState: (callback) => { listeners.push(callback); return () => {}; },
      setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {}
    };
  });

  await page.goto('/');
  await page.locator('#focusMinutes').fill('35');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#focusMinutes')).toHaveValue('35');
  await page.locator('#breakMinutes').fill('8');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#focusMinutes')).toHaveValue('35');
  await expect(page.locator('#breakMinutes')).toHaveValue('8');
  await page.locator('#phase').click();
  await expect.poll(() => page.evaluate(() => globalThis.__customTimerCommands.filter((item) => item.name === 'settings:update').at(-1))).toEqual({
    name: 'settings:update', payload: { preset: 'custom', customFocus: 35, customBreak: 8 }
  });
  await expect(page.getByRole('button', { name: '应用自定义时间' })).toHaveCount(0);
  await expect(page.locator('#clock')).toHaveText('35:00');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#focusMinutes')).toHaveValue('35');
  await expect(page.locator('#breakMinutes')).toHaveValue('8');
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__customTimerCommands.filter((item) => item.name === 'timer:start').at(-1))).toEqual({
    name: 'timer:start', payload: { task: '', todoId: null, focusMinutes: 35, breakMinutes: 8 }
  });
  await expect(page.locator('#clock')).toHaveText(/^34:5[89]$/);
});

test('settings forms keep local edits while Electron state ticks arrive', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(),
      timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0 },
      alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15, allowAnnoyed: true },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false, aiApiKey: '', aiTone: 'random', voiceStyle: 'cute', ttsVoiceName: '' },
      pet: { visible: true, position: null }
    };
    const listeners = [];
    const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__emitPomopetState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state),
      command: async (name, payload) => {
        if (name === 'offwork:update') state.offwork = { ...state.offwork, ...payload };
        if (name === 'settings:update') state.settings = { ...state.settings, ...payload };
        state.now = Date.now();
        globalThis.__emitPomopetState();
        return copy(state);
      },
      onState: (callback) => { listeners.push(callback); return () => {}; },
      showControl: () => {}
    };
  });

  await page.goto('/');
  await page.getByRole('tab', { name: '下班提醒' }).click();
  await expect(page.locator('#saveOffwork')).toBeDisabled();
  await page.locator('#editOffwork').click();
  await page.locator('#offworkTime').fill('22:30');
  await page.locator('#offworkBlockMode').check();
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#offworkTime')).toHaveValue('22:30');
  await expect(page.locator('#offworkBlockMode')).toBeChecked();
  await page.locator('#saveOffwork').click();
  await expect(page.locator('#saveOffwork')).toBeDisabled();
  await expect(page.locator('#offworkTime')).toHaveValue('22:30');

  await page.getByRole('tab', { name: '声音与启动' }).click();
  await expect(page.locator('#saveSettings')).toBeDisabled();
  await page.locator('#editSettings').click();
  await page.locator('#voiceMode').selectOption('all');
  await page.locator('#aiCopyEnabled').check();
  await page.locator('#launchAtLogin').check();
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#voiceMode')).toHaveValue('all');
  await expect(page.locator('#aiCopyEnabled')).toBeChecked();
  await expect(page.locator('#launchAtLogin')).toBeChecked();
  await page.locator('#saveSettings').click();
  await expect(page.locator('#saveSettings')).toBeDisabled();
  await expect(page.locator('#voiceMode')).toHaveValue('all');
});

test('off-work and companion settings save every editable field and survive authoritative state refresh', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0 }, todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', ttsVoiceName: '', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, interactions: true, launchAtLogin: false },
      aiStatus: { status: 'builtin', sample: null, errorCode: null }
    };
    const listeners = []; const commands = []; const keys = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    const emit = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.__editRoundTrip = { commands, keys, emit };
    globalThis.pomopet = {
      getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); if (name === 'offwork:update') state.offwork = { ...state.offwork, ...payload }; if (name === 'settings:update') state.settings = { ...state.settings, ...payload }; if (name === 'persona:update') { state.persona = { ...state.persona, ...payload }; state.settings.companionEnabled = payload.companionEnabled; } emit(); return copy(state); },
      setAiKey: async (key) => { keys.push(key); state.settings.aiKeyConfigured = true; }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {}
    };
  });

  await page.goto('/'); await page.getByRole('tab', { name: '下班提醒' }).click(); await page.locator('#editOffwork').click();
  await page.locator('#offworkEnabled').uncheck(); await page.locator('#workStart').fill('09:45'); await page.locator('#offworkTime').fill('19:15'); await page.locator('#latestOffworkTime').fill('22:15'); await page.locator('#offworkPose').selectOption('fainted'); await page.locator('#offworkBlockMode').check();
  await page.locator('#escalateMinutes').fill('25'); await page.locator('#offworkSnooze').fill('20'); await page.locator('#offworkDays [data-day="2"]').click(); await page.locator('#offworkDays [data-day="6"]').click();
  await page.locator('#saveOffwork').click(); await page.evaluate(() => globalThis.__editRoundTrip.emit());
  await expect(page.locator('#offworkEnabled')).not.toBeChecked(); await expect(page.locator('#workStart')).toHaveValue('09:45'); await expect(page.locator('#offworkTime')).toHaveValue('19:15'); await expect(page.locator('#latestOffworkTime')).toHaveValue('22:15'); await expect(page.locator('#offworkPose')).toHaveValue('fainted'); await expect(page.locator('#offworkBlockMode')).toBeChecked();
  await expect(page.locator('#escalateMinutes')).toHaveValue('25'); await expect(page.locator('#offworkSnooze')).toHaveValue('20'); await expect(page.locator('#offworkDays [data-day="2"]')).not.toHaveClass(/on/); await expect(page.locator('#offworkDays [data-day="6"]')).toHaveClass(/on/);

  await page.getByRole('tab', { name: '宠物性格' }).click(); await page.locator('#companionEnabled').uncheck(); await page.getByRole('button', { name: '保存角色' }).click(); await page.evaluate(() => globalThis.__editRoundTrip.emit());
  await expect(page.locator('#companionEnabled')).not.toBeChecked(); await expect(page.locator('#chatFrequency')).toBeDisabled();

  await page.getByRole('tab', { name: '声音与启动' }).click(); await page.locator('#editSettings').click();
  await page.locator('#voiceMode').selectOption('all'); await page.locator('#volume').fill('0.55'); await page.locator('#ttsEngine').selectOption('edge'); await page.locator('#edgeTtsVoice').selectOption('zh-CN-YunjianNeural');
  await page.locator('#aiCopyEnabled').check(); await page.locator('#aiApiKey').fill('round-trip-key'); await page.locator('#interactions').uncheck(); await page.locator('#launchAtLogin').check();
  await page.locator('#saveSettings').click(); await page.evaluate(() => globalThis.__editRoundTrip.emit());
  await expect(page.locator('#voiceMode')).toHaveValue('all'); await expect(page.locator('#volume')).toHaveValue('0.55'); await expect(page.locator('#ttsEngine')).toHaveValue('edge'); await expect(page.locator('#edgeTtsVoice')).toHaveValue('zh-CN-YunjianNeural');
  await expect(page.locator('#aiCopyEnabled')).toBeChecked(); await expect(page.locator('#aiApiKey')).toHaveValue(''); await expect(page.locator('#interactions')).not.toBeChecked(); await expect(page.locator('#launchAtLogin')).toBeChecked();
  expect(await page.evaluate(() => globalThis.__editRoundTrip.keys)).toEqual(['round-trip-key']);
  expect(await page.evaluate(() => globalThis.__editRoundTrip.commands.filter(({ name }) => name === 'offwork:update' || name === 'settings:update'))).toEqual([
    { name: 'offwork:update', payload: { enabled: false, workStart: '09:45', time: '19:15', latestTime: '22:15', exclusions: [{ start: '12:00', end: '14:00', label: '午休' }, { start: '18:00', end: '19:00', label: '晚餐' }], weekdays: [1, 3, 4, 5, 6], pose: 'fainted', blockMode: true, snoozeMinutes: 20, escalateMinutes: 25 } },
    { name: 'settings:update', payload: { voiceMode: 'all', volume: 0.55, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-YunjianNeural', ttsVoiceName: '', aiCopyEnabled: true, interactions: false, launchAtLogin: true } }
  ]);
});

test('control renderer suppresses chatter while typing and editing without overwriting drafts', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', task: '', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0 }, todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false, aiApiKey: '', aiTone: 'random' }
    };
    const listeners = []; const commands = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__suppressionCommands = commands;
    globalThis.__emitPomopetState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state),
      command: async (name, payload) => {
        commands.push({ name, payload });
        if (name === 'offwork:update') state.offwork = { ...state.offwork, ...payload };
        if (name === 'settings:update') state.settings = { ...state.settings, ...payload };
        globalThis.__emitPomopetState();
        return copy(state);
      },
      onState: (callback) => { listeners.push(callback); return () => {}; }, showControl: () => {}
    };
  });

  await page.goto('/');
  await page.locator('#task').focus();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.name === 'companion:suppress')))
    .toEqual([{ name: 'companion:suppress', payload: { source: 'typing', active: true } }]);
  await page.locator('#todoTitle').focus();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.name === 'companion:suppress'))).toHaveLength(1);
  await page.locator('#addTodo').focus();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.name === 'companion:suppress')))
    .toEqual([
      { name: 'companion:suppress', payload: { source: 'typing', active: true } },
      { name: 'companion:suppress', payload: { source: 'typing', active: false } }
    ]);

  await page.getByRole('tab', { name: '下班提醒' }).click(); await page.locator('#editOffwork').click(); await page.locator('#offworkTime').fill('22:30');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#offworkTime')).toHaveValue('22:30');
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: true } });
  await page.locator('#cancelOffwork').click();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: false } });

  await page.getByRole('tab', { name: '声音与启动' }).click(); await page.locator('#editSettings').click();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: true } });
  await page.locator('#saveSettings').click();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: false } });

  await page.getByRole('tab', { name: '提醒计划', exact: true }).click(); await page.locator('#newAlarm').click();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: true } });
  await page.locator('#cancelAlarm').click();
  await expect.poll(() => page.evaluate(() => globalThis.__suppressionCommands.filter((item) => item.payload?.source === 'editing').at(-1)))
    .toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: false } });
});

test('control keeps AI keys write-only and uses the dedicated bridge', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0 }, todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: true, aiTone: 'random', aiKeyConfigured: true, aiApiKey: 'must-not-render' }
    };
    const settingsPayloads = []; const keys = [];
    globalThis.__settingsPayloads = settingsPayloads; globalThis.__aiKeys = keys;
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      command: async (name, payload) => { if (name === 'settings:update') settingsPayloads.push(payload); return state; },
      setAiKey: async (key) => { keys.push(key); }, showControl: () => {}
    };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '声音与启动' }).click();
  await expect(page.locator('#aiApiKey')).toHaveValue('');
  await page.locator('#editSettings').click(); await page.locator('#saveSettings').click();
  expect(await page.evaluate(() => globalThis.__aiKeys)).toEqual([]);
  expect(await page.evaluate(() => globalThis.__settingsPayloads[0])).not.toHaveProperty('aiApiKey');
  await page.locator('#editSettings').click(); await page.locator('#aiApiKey').fill('new-secret'); await page.locator('#saveSettings').click();
  expect(await page.evaluate(() => globalThis.__aiKeys)).toEqual(['new-secret']);
  await expect(page.locator('#aiApiKey')).toHaveValue('');
});

test('task field keeps edits during state ticks and saves on blur', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(),
      timer: { status: 'running', phase: 'focus', task: '旧任务', remainingMs: 25 * 60_000, targetAt: Date.now() + 25 * 60_000, todayCount: 0 },
      alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15, allowAnnoyed: true },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false, aiApiKey: '', aiTone: 'random', voiceStyle: 'cute', ttsVoiceName: '' },
      pet: { visible: true, position: null }
    };
    const listeners = [];
    const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__emitPomopetState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state),
      command: async (name, payload) => {
        if (name === 'timer:updateTask') state.timer.task = String(payload.task || '').trim();
        state.now = Date.now();
        globalThis.__emitPomopetState();
        return copy(state);
      },
      onState: (callback) => { listeners.push(callback); return () => {}; },
      showControl: () => {}
    };
  });

  await page.goto('/');
  await expect(page.locator('#task')).toHaveValue('旧任务');
  await page.locator('#task').fill('新任务');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#task')).toHaveValue('新任务');
  await page.locator('#task').blur();
  await expect(page.locator('#task')).toHaveValue('新任务');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('#task')).toHaveValue('新任务');
});

test('todo list add, enter and delete update immediately while preserving active edits', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(),
      timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 0, todoId: null },
      todos: { items: [], activeId: null },
      alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15, allowAnnoyed: true },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false, aiApiKey: '', aiTone: 'random', voiceStyle: 'cute', ttsVoiceName: '' },
      pet: { visible: true, position: null }
    };
    const listeners = [];
    const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__emitPomopetState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state),
      command: async (name, payload) => {
        state.now = Date.now();
        if (name === 'todo:add') {
          const item = { id: `todo-${state.todos.items.length + 1}`, day: '2026-08-27', title: payload.title, priority: payload.priority, estimatePomos: Number(payload.estimatePomos) || 1, completedPomos: 0, spentMs: 0, done: false, createdAt: state.now, completedAt: null };
          state.todos.items.unshift(item); state.todos.activeId = item.id;
        }
        if (name === 'todo:update') {
          const item = state.todos.items.find((todo) => todo.id === payload.id);
          if (item) Object.assign(item, payload.patch);
        }
        if (name === 'todo:remove') {
          state.todos.items = state.todos.items.filter((todo) => todo.id !== payload.id);
          if (state.todos.activeId === payload.id) state.todos.activeId = state.todos.items[0]?.id || null;
        }
        globalThis.__emitPomopetState();
        return copy(state);
      },
      onState: (callback) => { listeners.push(callback); return () => {}; },
      showControl: () => {}
    };
  });

  await page.goto('/');
  await page.locator('#todoTitle').fill('第一件事');
  await page.locator('#todoTitle').press('Enter');
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await expect(page.locator('.todo-title')).toHaveText('第一件事');
  await page.locator('.todo-edit').click();
  await expect(page.locator('.todo-title-input')).toHaveValue('第一件事');
  expect((await page.locator('.todo-item.editing').boundingBox()).height).toBeLessThan(110);
  expect((await page.locator('.todo-save').boundingBox()).width).toBeLessThan(70);
  await page.locator('.todo-title-input').fill('正在输入的新标题');
  await page.locator('.todo-priority').selectOption('P0');
  await page.evaluate(() => globalThis.__emitPomopetState());
  await expect(page.locator('.todo-title-input')).toHaveValue('正在输入的新标题');
  await expect(page.locator('.todo-priority')).toHaveValue('P0');
  await page.locator('.todo-save').click();
  await expect(page.locator('.todo-title')).toHaveText('正在输入的新标题');
  await expect(page.locator('.todo-priority-pill')).toHaveText('P0 重要');
  await expect(page.locator('.todo-title-input')).toHaveCount(0);
  expect((await page.locator('.todo-remove').boundingBox()).width).toBeLessThanOrEqual(28);
  await page.locator('.todo-remove').click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await expect(page.locator('.todo-remove')).toHaveAttribute('data-confirming', 'true');
  await page.locator('.todo-remove').click();
  await expect(page.locator('.todo-item')).toHaveCount(0);
});

test('an unfinished Todo can start the selected Pomodoro preset directly', async ({ page }) => {
  await page.goto('/');
  await page.locator('#todoTitle').fill('直接开始这件事');
  await page.locator('#addTodo').click();
  await page.locator('[data-preset="50/10"]').click();

  await page.locator('.todo-start').click();

  await expect(page.locator('#phase')).toHaveText('末末陪你专注中');
  await expect(page.locator('#clock')).toHaveText(/^(50:00|49:5[89])$/);
  await expect(page.locator('#task')).toHaveValue('直接开始这件事');
  await expect(page.locator('.todo-start')).toBeDisabled();
});

test('reminder templates fill only the draft and interval save sends the supported payload', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1_500_000, todayCount: 0 }, todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: .75, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', ttsVoiceName: '', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false },
      aiStatus: { status: 'builtin', sample: null, errorCode: null }
    };
    const listeners = []; const commands = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__commands = commands; globalThis.__emitState = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = {
      getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; },
      command: async (name, payload) => {
        commands.push({ name, payload });
        if (name === 'alarm:add') state.alarms.push({ ...payload, id: 'alarm-1', snoozes: [] });
        globalThis.__emitState(); return copy(state);
      }, setDirty: (dirty) => { globalThis.__dirty = dirty; }, onDiscardDrafts: (callback) => { globalThis.__discardDrafts = callback; return () => {}; }, showControl: () => {}
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '喝水 · 30 分钟' }).click();
  await expect(page.locator('#alarmLabel')).toHaveValue('喝水提醒');
  await expect(page.locator('#alarmStartTime')).toHaveValue('09:30');
  await expect(page.locator('#alarmEndTime')).toHaveValue('18:30');
  expect(await page.evaluate(() => globalThis.__commands.filter(({ name }) => name.startsWith('alarm:')))).toEqual([]);
  await page.evaluate(() => globalThis.__emitState());
  await expect(page.locator('#alarmLabel')).toHaveValue('喝水提醒');
  await expect(page.locator('#alarmSchedulePreview')).toContainText('工作日 09:30 起，每 30 分钟');
  await page.getByRole('button', { name: '保存提醒' }).click();
  expect(await page.evaluate(() => globalThis.__commands.find(({ name }) => name === 'alarm:add'))).toEqual({
    name: 'alarm:add', payload: expect.objectContaining({ label: '喝水提醒', type: 'interval', weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 30, pose: 'water', enabled: true })
  });
});

test('reminder validation and save failures stay inline without losing the editor', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async (name) => { if (name === 'alarm:add') throw new Error('disk_full'); return state; }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('#newAlarm').click();
  await page.getByRole('button', { name: '保存提醒' }).click();
  await expect(page.locator('#alarmError')).toContainText('请输入提醒内容');
  await page.locator('#alarmLabel').fill('伸个懒腰'); await page.locator('[data-alarm-type="interval"]').click();
  await page.locator('#alarmStartTime').fill('18:30'); await page.locator('#alarmEndTime').fill('09:30');
  await page.getByRole('button', { name: '保存提醒' }).click(); await expect(page.locator('#alarmError')).toContainText('开始时间要早于结束时间');
  await page.locator('#alarmEndTime').fill('19:30'); await page.getByRole('button', { name: '保存提醒' }).click();
  await expect(page.locator('#alarmError')).toContainText('保存失败'); await expect(page.locator('#alarmLabel')).toHaveValue('伸个懒腰');
});

test('persona presets preview live and save the complete persona payload', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [] },
      persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const commands = []; globalThis.__commands = commands;
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async (name, payload) => { commands.push({ name, payload }); if (name === 'persona:update') { state.persona = { ...state.persona, ...payload }; state.settings.companionEnabled = payload.companionEnabled; } return state; }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '宠物性格' }).click();
  await page.locator('[data-persona="clever"]').click(); await expect(page.locator('#personaWaterLine')).toContainText('大侠');
  await page.locator('#petName').fill('团子'); await page.locator('#ownerName').fill('阿青'); await page.locator('#customPrompt').fill('机灵俏皮，只提取特质，保持原创台词');
  await page.locator('#teaseLevel').fill('72'); await expect(page.locator('#teaseOutput')).toHaveText('72%'); await page.locator('#chatFrequency').selectOption('lively'); await page.locator('#companionEnabled').uncheck(); await expect(page.locator('#chatFrequency')).toBeDisabled();
  await page.getByRole('button', { name: '保存角色' }).click();
  expect(await page.evaluate(() => globalThis.__commands.find(({ name }) => name === 'persona:update'))).toEqual({ name: 'persona:update', payload: { preset: 'clever', petName: '团子', ownerName: '阿青', customPrompt: '机灵俏皮，只提取特质，保持原创台词', teaseLevel: 72, chatFrequency: 'lively', companionEnabled: false } });
  await expect(page.locator('#personaInspiration')).toContainText('台词保持原创');
  await page.screenshot({ path: 'artifacts/screenshots/persona-companion-settings.png', fullPage: true });
});

test('settings show AI status, test copy, and keep the API key write-only', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' },
      settings: { preset: '25/5', voiceMode: 'key', volume: .75, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', ttsVoiceName: '', aiCopyEnabled: true, aiKeyConfigured: true, companionEnabled: true, launchAtLogin: false, aiApiKey: 'never-render' }, aiStatus: { status: 'connected', sample: '今天也稳稳向前啦', errorCode: null } };
    const keys = []; const commands = []; globalThis.__keys = keys; globalThis.__commands = commands;
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async (name, payload) => { commands.push({ name, payload }); return state; }, setAiKey: async (key) => keys.push(key), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '声音与启动' }).click();
  await expect(page.locator('#aiStatus')).toContainText('AI 已连接'); await expect(page.locator('#aiTestSample')).toContainText('今天也稳稳向前啦'); await expect(page.locator('#aiApiKey')).toHaveValue('');
  await page.getByRole('button', { name: '生成一句测试文案' }).click(); expect(await page.evaluate(() => globalThis.__commands.at(-1))).toEqual({ name: 'ai:test', payload: undefined });
  await page.locator('#editSettings').click(); await page.locator('#aiApiKey').fill('new-local-key'); await page.getByRole('button', { name: '保存设置' }).click();
  expect(await page.evaluate(() => globalThis.__keys)).toEqual(['new-local-key']); await expect(page.locator('#aiApiKey')).toHaveValue(''); await expect(page.locator('#aiTone')).toHaveCount(0);
});

test('dirty tab switching and renderer discard callback protect every active draft', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const dirty = []; globalThis.__dirtyReports = dirty;
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async () => state, setDirty: (value) => dirty.push(value), onDiscardDrafts: (callback) => { globalThis.__discardDrafts = callback; return () => {}; }, showControl: () => {} };
  });
  await page.goto('/'); await page.getByRole('button', { name: '喝水 · 30 分钟' }).click(); await page.locator('#alarmLabel').fill('草稿标题');
  await page.getByRole('tab', { name: '宠物性格' }).click();
  await expect(page.getByRole('tab', { name: '提醒计划' })).toHaveClass(/active/);
  await page.getByRole('tab', { name: '宠物性格' }).click();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('tab', { name: '宠物性格' }).click();
  await expect(page.getByRole('tab', { name: '宠物性格' })).toHaveClass(/active/);
  await page.locator('#petName').fill('未保存名字'); await page.evaluate(() => globalThis.__discardDrafts());
  await expect(page.locator('#petName')).toHaveValue('末末');
  expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
});

test('reminder list edits, toggles, and deletes an existing plan', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null },
      alarms: [{ id: 'weekly-1', label: '周会', type: 'weekly', time: '10:00', at: null, weekdays: [1], startTime: null, endTime: null, intervalMinutes: null, pose: 'focus', enabled: true }],
      offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const listeners = []; const commands = []; const copy = (value) => JSON.parse(JSON.stringify(value)); globalThis.__commands = commands;
    const emit = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = { getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; }, command: async (name, payload) => { commands.push({ name, payload }); const alarm = state.alarms[0]; if (name === 'alarm:update') Object.assign(alarm, payload.patch); if (name === 'alarm:enabled') alarm.enabled = payload.enabled; if (name === 'alarm:remove') state.alarms = []; emit(); return copy(state); }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('.alarm-edit').click();
  await expect(page.locator('#alarmLabel')).toHaveValue('周会'); await expect(page.locator('[data-alarm-type="weekly"]')).toHaveClass(/active/);
  await page.locator('#alarmLabel').fill('周会准备'); await page.getByRole('button', { name: '保存提醒' }).click();
  expect(await page.evaluate(() => globalThis.__commands.find(({ name }) => name === 'alarm:update'))).toEqual({ name: 'alarm:update', payload: { id: 'weekly-1', patch: expect.objectContaining({ label: '周会准备', type: 'weekly', time: '10:00', weekdays: [1] }) } });
  await page.locator('.alarm-enabled').uncheck(); expect(await page.evaluate(() => globalThis.__commands.find(({ name }) => name === 'alarm:enabled'))).toEqual({ name: 'alarm:enabled', payload: { id: 'weekly-1', enabled: false } });
  await page.locator('.alarm-delete').click(); await expect(page.locator('.alarm-item')).toHaveCount(0);
});

test('reminder edit click survives a state tick between pointer down and up', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null },
      alarms: [{ id: 'interval-1', label: '活动活动', type: 'interval', time: null, at: null, weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 60, pose: 'comfort', enabled: true }],
      offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const listeners = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__emitReminderTick = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.pomopet = { getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; }, command: async () => copy(state), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/');
  const edit = page.locator('.alarm-edit');
  await page.evaluate(() => {
    globalThis.__reminderEditNode = document.querySelector('.alarm-edit');
    setTimeout(() => {
      globalThis.__emitReminderTick();
      globalThis.__reminderNodeSurvivedTick = globalThis.__reminderEditNode === document.querySelector('.alarm-edit');
    }, 30);
  });
  await edit.hover(); await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  expect(await page.evaluate(() => globalThis.__reminderNodeSurvivedTick)).toBe(true);
  await expect(page.locator('#alarmLabel')).toHaveValue('活动活动');
  await expect(page.locator('.alarm-item')).toHaveClass(/selected/);
  expect(await page.evaluate(() => globalThis.__reminderEditNode === document.querySelector('.alarm-edit'))).toBe(false);
  await page.locator('#alarmLabel').fill('活动活动 预防病痛');
  await page.locator('.editor-heading').click();
  await page.evaluate(() => globalThis.__emitReminderTick());
  await page.locator('#alarmLabel').click(); await page.locator('#alarmLabel').press('End'); await page.locator('#alarmLabel').pressSequentially(' 活到99');
  await expect(page.locator('#alarmLabel')).toHaveValue('活动活动 预防病痛 活到99');
});

test('once and weekly schedule fields rerender the preview immediately', async ({ page }) => {
  await page.goto('/'); await page.locator('#newAlarm').click();
  await page.locator('#alarmWhen').fill('2030-01-02T13:45');
  await expect(page.locator('#alarmSchedulePreview')).toContainText('2030');
  await expect(page.locator('#alarmSchedulePreview')).toContainText('13:45');
  await page.locator('[data-alarm-type="weekly"]').click();
  await page.locator('#alarmTime').fill('16:20');
  await expect(page.locator('#alarmSchedulePreview')).toContainText('16:20');
  await page.locator('#alarmDays [data-day="1"]').click();
  await expect(page.locator('#alarmSchedulePreview')).not.toContainText('周一');
});

test('blank reminder times stay blank, show neutral validation, and never submit or throw', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const commands = []; globalThis.__commands = commands;
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async (name, payload) => { commands.push({ name, payload }); return state; }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('#newAlarm').click(); await page.locator('#alarmLabel').fill('补全时间测试');

  await page.locator('#alarmWhen').fill(''); await expect(page.locator('#alarmWhen')).toHaveValue(''); await expect(page.locator('#alarmSchedulePreview')).toContainText('请补全时间');
  await page.getByRole('button', { name: '保存提醒' }).click(); await expect(page.locator('#alarmError')).toHaveText('请补全时间'); await expect(page.locator('#alarmWhen')).toHaveValue('');

  await page.locator('[data-alarm-type="weekly"]').click(); await page.locator('#alarmTime').fill(''); await expect(page.locator('#alarmTime')).toHaveValue(''); await expect(page.locator('#alarmSchedulePreview')).toContainText('请补全时间');
  await page.getByRole('button', { name: '保存提醒' }).click(); await expect(page.locator('#alarmError')).toHaveText('请补全时间'); await expect(page.locator('#alarmTime')).toHaveValue('');

  await page.locator('[data-alarm-type="interval"]').click(); await page.locator('#alarmStartTime').fill(''); await page.locator('#alarmEndTime').fill(''); await expect(page.locator('#alarmStartTime')).toHaveValue(''); await expect(page.locator('#alarmEndTime')).toHaveValue(''); await expect(page.locator('#alarmSchedulePreview')).toContainText('请补全时间');
  await page.getByRole('button', { name: '保存提醒' }).click(); await expect(page.locator('#alarmError')).toHaveText('请补全时间'); await expect(page.locator('#alarmStartTime')).toHaveValue(''); await expect(page.locator('#alarmEndTime')).toHaveValue('');

  expect(await page.evaluate(() => globalThis.__commands.filter(({ name }) => name === 'alarm:add' || name === 'alarm:update'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('reminder rows show effective AI or builtin copy mode without exposing the key', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [{ id: 'copy-mode', label: '喝水提醒', type: 'interval', weekdays: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '18:30', intervalMinutes: 30, pose: 'water', enabled: true }], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: true, aiApiKey: 'must-never-render', companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const listeners = []; const emit = () => listeners.forEach((callback) => callback(JSON.parse(JSON.stringify(state))));
    globalThis.__enableAiCopy = () => { state.settings.aiCopyEnabled = true; emit(); };
    globalThis.pomopet = { getState: async () => state, onState: (callback) => { listeners.push(callback); return () => {}; }, command: async () => state, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); const metadata = page.locator('.alarm-item').locator('.alarm-meta span');
  await expect(metadata).toContainText('内置文案'); await expect(page.locator('body')).not.toContainText('must-never-render'); await expect(page.locator('#aiApiKey')).toHaveValue('');
  await page.evaluate(() => globalThis.__enableAiCopy()); await expect(metadata).toContainText('AI 文案'); await expect(page.locator('body')).not.toContainText('must-never-render');
});

test('reminder list renders actual future occurrences and expired once state', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date(2026, 7, 31, 10, 10).getTime();
    const state = { now, timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [
      { id: 'once-future', label: '未来一次', type: 'once', at: new Date(2026, 7, 31, 11, 0).getTime(), weekdays: [], pose: 'focus', enabled: true },
      { id: 'once-expired', label: '过期一次', type: 'once', at: new Date(2026, 7, 31, 9, 0).getTime(), weekdays: [], pose: 'focus', enabled: true },
      { id: 'weekly-next', label: '下周周会', type: 'weekly', time: '09:00', weekdays: [1], pose: 'focus', enabled: true },
      { id: 'interval-next', label: '间隔活动', type: 'interval', weekdays: [1, 2], startTime: '09:30', endTime: '18:30', intervalMinutes: 60, pose: 'comfort', enabled: true }
    ], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async () => state, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/');
  await expect(page.locator('.alarm-item', { hasText: '未来一次' }).locator('.alarm-meta span')).toContainText('11:00');
  await expect(page.locator('.alarm-item', { hasText: '过期一次' }).locator('.alarm-meta span')).toContainText('已过期');
  await expect(page.locator('.alarm-item', { hasText: '下周周会' }).locator('.alarm-meta span')).toContainText('09:00');
  await expect(page.locator('.alarm-item', { hasText: '间隔活动' }).locator('.alarm-meta span')).toContainText('10:30');
});

test('persona cancel restores saved fields, preview, suppression, and aggregate dirty', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const dirty = []; const commands = []; globalThis.__dirtyReports = dirty; globalThis.__commands = commands;
    globalThis.pomopet = { getState: async () => state, onState: () => () => {}, command: async (name, payload) => { commands.push({ name, payload }); return state; }, setDirty: (value) => dirty.push(value), onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '宠物性格' }).click();
  const savedPreview = await page.locator('#personaWaterLine').textContent();
  await page.locator('[data-persona="witty"]').click(); await page.locator('#petName').fill('团子');
  await expect(page.locator('#personaWaterLine')).not.toHaveText(savedPreview);
  await page.getByRole('button', { name: '取消角色修改' }).click();
  await expect(page.locator('#petName')).toHaveValue('末末'); await expect(page.locator('[data-persona="gentle"]')).toHaveClass(/active/); await expect(page.locator('#personaWaterLine')).toHaveText(savedPreview);
  expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
  expect((await page.evaluate(() => globalThis.__commands.filter(({ name, payload }) => name === 'companion:suppress' && payload.source === 'editing'))).at(-1)).toEqual({ name: 'companion:suppress', payload: { source: 'editing', active: false } });
});

test('add Todo draft survives ticks and failures, resets on discard, and retains selectors after success', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: { enabled: false, time: '18:30', weekdays: [] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const listeners = []; const dirty = []; let fail = true; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__dirtyReports = dirty; globalThis.__emitState = () => listeners.forEach((callback) => callback(copy(state))); globalThis.__allowTodoAdd = () => { fail = false; };
    globalThis.pomopet = { getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; }, command: async (name, payload) => { if (name === 'todo:add') { if (fail) throw new Error('disk_full'); const item = { id: 'todo-1', title: payload.title, priority: payload.priority, estimatePomos: payload.estimatePomos, completedPomos: 0, spentMs: 0, done: false }; state.todos.items.push(item); state.todos.activeId = item.id; } return copy(state); }, setDirty: (value) => dirty.push(value), onDiscardDrafts: (callback) => { globalThis.__discardDrafts = callback; return () => {}; }, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('#todoTitle').fill('失败也不能丢'); await page.locator('#todoPriority').selectOption('P0'); await page.locator('#todoEstimate').fill('3');
  await page.evaluate(() => globalThis.__emitState()); await expect(page.locator('#todoTitle')).toHaveValue('失败也不能丢'); await expect(page.locator('#todoPriority')).toHaveValue('P0'); await expect(page.locator('#todoEstimate')).toHaveValue('3');
  await page.locator('#addTodo').click(); await expect(page.locator('#todoAddError')).toContainText('添加失败'); await expect(page.locator('#todoTitle')).toHaveValue('失败也不能丢'); await expect(page.locator('#todoPriority')).toHaveValue('P0'); await expect(page.locator('#todoEstimate')).toHaveValue('3'); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(true);
  await page.evaluate(() => globalThis.__discardDrafts()); await expect(page.locator('#todoTitle')).toHaveValue(''); await expect(page.locator('#todoPriority')).toHaveValue('P1'); await expect(page.locator('#todoEstimate')).toHaveValue('1');
  await page.locator('#todoTitle').fill('成功保留选项'); await page.locator('#todoPriority').selectOption('P2'); await page.locator('#todoEstimate').fill('4'); await page.evaluate(() => globalThis.__allowTodoAdd()); await page.locator('#addTodo').click();
  await expect(page.locator('#todoTitle')).toHaveValue(''); await expect(page.locator('#todoPriority')).toHaveValue('P2'); await expect(page.locator('#todoEstimate')).toHaveValue('4'); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
});

test('saving locks every protected editor until delayed commands settle', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [{ id: 'todo-1', title: '原待办', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false }], activeId: 'todo-1' }, alarms: [{ id: 'alarm-1', label: '原提醒', type: 'weekly', time: '10:00', weekdays: [1], pose: 'focus', enabled: true }], offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: { preset: '25/5', voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, interactions: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    const pending = new Map(); const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__settle = (name, fail = true) => { const waiter = pending.get(name); pending.delete(name); fail ? waiter.reject(new Error('delayed_failure')) : waiter.resolve(copy(state)); };
    globalThis.pomopet = { getState: async () => copy(state), onState: () => () => {}, command: (name) => new Promise((resolve, reject) => pending.set(name, { resolve, reject })), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  await page.locator('#todoTitle').fill('延迟添加'); await page.locator('#addTodo').click();
  await expect(page.locator('#todoForm')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#todoTitle')).toBeDisabled(); await expect(page.locator('#todoPriority')).toBeDisabled(); await expect(page.locator('#todoEstimate')).toBeDisabled(); await expect(page.locator('#addTodo')).toBeDisabled(); await expect(page.getByRole('tab', { name: '宠物性格' })).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('todo:add')); await expect(page.locator('#todoTitle')).toBeEnabled(); await expect(page.locator('#todoTitle')).toHaveValue('延迟添加');

  await page.locator('.todo-edit').click(); await page.locator('.todo-title-input').fill('延迟行编辑'); await page.locator('.todo-save').click();
  await expect(page.locator('.todo-item.editing')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('.todo-title-input')).toBeDisabled(); await expect(page.locator('.todo-priority')).toBeDisabled(); await expect(page.locator('.todo-estimate')).toBeDisabled(); await expect(page.locator('.todo-save')).toBeDisabled(); await expect(page.locator('.todo-cancel')).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('todo:update')); await expect(page.locator('.todo-title-input')).toBeEnabled(); await expect(page.locator('.todo-title-input')).toHaveValue('延迟行编辑');

  await page.locator('.alarm-edit').click(); await page.locator('#alarmLabel').fill('延迟提醒'); await page.locator('#saveAlarm').click();
  await expect(page.locator('#alarmForm')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('#alarmLabel')).toBeDisabled(); await expect(page.locator('#cancelAlarm')).toBeDisabled(); await expect(page.locator('.alarm-edit')).toBeDisabled(); await expect(page.locator('.alarm-enabled')).toBeDisabled(); await expect(page.locator('#newAlarm')).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('alarm:update')); await expect(page.locator('#alarmLabel')).toBeEnabled(); await expect(page.locator('#alarmLabel')).toHaveValue('延迟提醒');

  await page.getByRole('tab', { name: '下班提醒' }).click(); await page.locator('#editOffwork').click(); await page.locator('#offworkTime').fill('19:00'); await page.locator('#saveOffwork').click();
  await expect(page.locator('#offworkPanel')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('#offworkTime')).toBeDisabled(); await expect(page.locator('#cancelOffwork')).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('offwork:update')); await expect(page.locator('#offworkTime')).toBeEnabled(); await expect(page.locator('#offworkTime')).toHaveValue('19:00');

  await page.getByRole('tab', { name: '宠物性格' }).click(); await page.locator('#petName').fill('延迟末末'); await page.locator('#savePersona').click();
  await expect(page.locator('#personaPanel')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('#petName')).toBeDisabled(); await expect(page.locator('[data-persona="gentle"]')).toBeDisabled(); await expect(page.locator('#cancelPersona')).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('persona:update')); await expect(page.locator('#petName')).toBeEnabled(); await expect(page.locator('#petName')).toHaveValue('延迟末末');

  await page.getByRole('tab', { name: '声音与启动' }).click(); await page.locator('#editSettings').click(); await page.locator('#voiceMode').selectOption('key'); await page.locator('#saveSettings').click();
  await expect(page.locator('#settingsPanel')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('#voiceMode')).toBeDisabled(); await expect(page.locator('#cancelSettings')).toBeDisabled();
  await page.evaluate(() => globalThis.__settle('settings:update')); await expect(page.locator('#voiceMode')).toBeEnabled(); await expect(page.locator('#voiceMode')).toHaveValue('key');
});

test('discard invalidates delayed saves without restoring dirty or Todo editor sessions', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [{ id: 'todo-1', title: '原待办', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false }], activeId: 'todo-1' }, alarms: [], offwork: {}, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: {}, aiStatus: { status: 'builtin' } };
    const pending = new Map(); const dirty = []; const copy = (value) => JSON.parse(JSON.stringify(value)); globalThis.__dirtyReports = dirty;
    globalThis.__settle = (name, fail) => { const waiter = pending.get(name); pending.delete(name); fail ? waiter.reject(new Error('late_failure')) : waiter.resolve(copy(state)); };
    globalThis.pomopet = { getState: async () => copy(state), onState: () => () => {}, command: (name) => new Promise((resolve, reject) => pending.set(name, { resolve, reject })), setDirty: (value) => dirty.push(value), onDiscardDrafts: (callback) => { globalThis.__discardDrafts = callback; return () => {}; }, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('.todo-edit').click(); await page.locator('.todo-title-input').fill('迟到失败'); await page.locator('.todo-save').click();
  await page.evaluate(() => globalThis.__discardDrafts()); await expect(page.locator('.todo-title-input')).toHaveCount(0); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
  await page.evaluate(() => globalThis.__settle('todo:update', true)); await page.waitForTimeout(0);
  await expect(page.locator('.todo-title-input')).toHaveCount(0); await expect(page.locator('.todo-error')).toHaveCount(0); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);

  await page.getByRole('tab', { name: '宠物性格' }).click(); await page.locator('#petName').fill('迟到成功'); await page.locator('#savePersona').click();
  await page.evaluate(() => globalThis.__discardDrafts()); await expect(page.locator('#petName')).toHaveValue('末末'); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
  await page.evaluate(() => globalThis.__settle('persona:update', false)); await page.waitForTimeout(0);
  await expect(page.locator('#petName')).toHaveValue('末末'); expect((await page.evaluate(() => globalThis.__dirtyReports)).at(-1)).toBe(false);
});

test('Todo add and row saves lock the whole panel while both drafts coexist', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [{ id: 'todo-1', title: '原待办', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false }], activeId: 'todo-1' }, alarms: [], offwork: {}, persona: {}, settings: {}, aiStatus: { status: 'builtin' } };
    const pending = new Map(); const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__reject = (name) => { const waiter = pending.get(name); pending.delete(name); waiter.reject(new Error('delayed_failure')); };
    globalThis.pomopet = { getState: async () => copy(state), onState: () => () => {}, command: (name) => new Promise((resolve, reject) => pending.set(name, { resolve, reject })), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('.todo-edit').click(); await page.locator('.todo-title-input').fill('行草稿'); await page.locator('#todoTitle').fill('新增草稿');
  await page.locator('.todo-save').click(); await expect(page.locator('#todoTitle')).toBeDisabled(); await expect(page.locator('#addTodo')).toBeDisabled(); await expect(page.locator('.todo-title-input')).toBeDisabled();
  await page.evaluate(() => globalThis.__reject('todo:update')); await expect(page.locator('#todoTitle')).toBeEnabled(); await expect(page.locator('#todoTitle')).toHaveValue('新增草稿'); await expect(page.locator('.todo-title-input')).toHaveValue('行草稿');
  await page.locator('#addTodo').click(); await expect(page.locator('#todoTitle')).toBeDisabled(); await expect(page.locator('.todo-title-input')).toBeDisabled(); await expect(page.locator('.todo-save')).toBeDisabled(); await expect(page.locator('.todo-cancel')).toBeDisabled();
  await page.evaluate(() => globalThis.__reject('todo:add')); await expect(page.locator('#todoTitle')).toBeEnabled(); await expect(page.locator('#todoTitle')).toHaveValue('新增草稿'); await expect(page.locator('.todo-title-input')).toBeEnabled(); await expect(page.locator('.todo-title-input')).toHaveValue('行草稿');
});

test('settings save settlement restores AI test availability from normal editor state', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [], offwork: {}, persona: {}, settings: { voiceMode: 'off', volume: .5, ttsEngine: 'system', aiCopyEnabled: false, aiKeyConfigured: false, companionEnabled: true, interactions: true, launchAtLogin: false }, aiStatus: { status: 'builtin' } };
    let pending; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__settleSettings = (fail) => fail ? pending.reject(new Error('save_failed')) : pending.resolve(copy(state));
    globalThis.pomopet = { getState: async () => copy(state), onState: () => () => {}, command: (name) => name === 'settings:update' ? new Promise((resolve, reject) => { pending = { resolve, reject }; }) : Promise.resolve(copy(state)), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '声音与启动' }).click(); await expect(page.locator('#testAi')).toBeEnabled();
  await page.locator('#editSettings').click(); await expect(page.locator('#testAi')).toBeDisabled(); await page.locator('#voiceMode').selectOption('key'); await page.locator('#saveSettings').click(); await expect(page.locator('#testAi')).toBeDisabled();
  await page.evaluate(() => globalThis.__settleSettings(false)); await expect(page.locator('#testAi')).toBeEnabled();
  await page.locator('#editSettings').click(); await page.locator('#voiceMode').selectOption('all'); await page.locator('#saveSettings').click(); await page.evaluate(() => globalThis.__settleSettings(true));
  await expect(page.locator('#settingsError')).toContainText('保存失败'); await expect(page.locator('#testAi')).toBeDisabled(); await page.locator('#cancelSettings').click(); await expect(page.locator('#testAi')).toBeEnabled();
});

test('field saves never change an existing reminder enabled state', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [], activeId: null }, alarms: [{ id: 'paused', label: '暂停项', type: 'weekly', time: '10:00', weekdays: [1], pose: 'focus', enabled: false }, { id: 'running', label: '运行项', type: 'weekly', time: '11:00', weekdays: [2], pose: 'focus', enabled: true }], offwork: { enabled: false, time: '18:30', weekdays: [1, 2, 3, 4, 5] }, persona: { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' }, settings: {}, aiStatus: { status: 'builtin' } };
    const commands = []; const copy = (value) => JSON.parse(JSON.stringify(value)); globalThis.__commands = commands;
    globalThis.pomopet = { getState: async () => copy(state), onState: () => () => {}, command: async (name, payload) => { commands.push({ name, payload }); if (name === 'alarm:update') Object.assign(state.alarms.find((alarm) => alarm.id === payload.id), payload.patch); return copy(state); }, setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/');
  for (const [label, nextLabel, enabled] of [['暂停项', '暂停项已编辑', false], ['运行项', '运行项已编辑', true]]) {
    const row = page.locator('.alarm-item', { hasText: label }); await row.locator('.alarm-edit').click(); await page.locator('#alarmLabel').fill(nextLabel); await page.locator('#saveAlarm').click();
    await expect(page.locator('.alarm-item', { hasText: nextLabel }).locator('.alarm-enabled')).toBeChecked({ checked: enabled });
  }
  const updates = await page.evaluate(() => globalThis.__commands.filter(({ name }) => name === 'alarm:update'));
  expect(updates.every(({ payload }) => !Object.hasOwn(payload.patch, 'enabled'))).toBe(true);
});

test('Todo row edit keeps its DOM node, focus, and caret across state ticks', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1 }, todos: { items: [{ id: 'editing', title: '保持输入', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false }, { id: 'other', title: '另一项', priority: 'P2', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false }], activeId: 'editing' }, alarms: [], offwork: {}, persona: {}, settings: {}, aiStatus: { status: 'builtin' } };
    const listeners = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    globalThis.__tick = () => { state.now += 1000; state.todos.items[1].completedPomos += 1; listeners.forEach((callback) => callback(copy(state))); };
    globalThis.pomopet = { getState: async () => copy(state), onState: (callback) => { listeners.push(callback); return () => {}; }, command: async () => copy(state), setDirty: () => {}, onDiscardDrafts: () => () => {}, showControl: () => {} };
  });
  await page.goto('/'); await page.locator('.todo-item[data-id="editing"] .todo-edit').click(); const input = page.locator('.todo-title-input'); await input.fill('光标保持在这里');
  await input.evaluate((node) => { node.focus(); node.setSelectionRange(3, 6); globalThis.__editingInput = node; });
  await page.evaluate(() => { globalThis.__tick(); globalThis.__tick(); globalThis.__tick(); });
  expect(await input.evaluate((node) => ({ same: node === globalThis.__editingInput, focused: node === document.activeElement, start: node.selectionStart, end: node.selectionEnd }))).toEqual({ same: true, focused: true, start: 3, end: 6 });
  await expect(page.locator('.todo-item[data-id="other"] .todo-progress')).toContainText('3/1');
});

test('tabs expose ARIA relationships and support roving keyboard navigation', async ({ page }) => {
  await page.goto('/'); const tabs = page.getByRole('tab'); await expect(page.getByRole('tablist')).toHaveCount(1); await expect(tabs).toHaveCount(5);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true'); await expect(tabs.nth(0)).toHaveAttribute('tabindex', '0'); await expect(page.getByRole('tabpanel', { name: '提醒计划' })).toBeVisible();
  await tabs.nth(0).focus(); await tabs.nth(0).press('ArrowRight'); await expect(tabs.nth(1)).toBeFocused(); await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).press('End'); await expect(tabs.nth(4)).toBeFocused(); await tabs.nth(4).press('Home'); await expect(tabs.nth(0)).toBeFocused(); await tabs.nth(0).press('ArrowLeft'); await expect(tabs.nth(4)).toBeFocused();
  await page.getByRole('tab', { name: '宠物性格' }).click(); await page.locator('#petName').fill('有草稿'); page.once('dialog', (dialog) => dialog.dismiss()); await page.getByRole('tab', { name: '宠物性格' }).press('ArrowRight'); await expect(page.getByRole('tab', { name: '宠物性格' })).toBeFocused();
});

test('reminder and persona layouts do not overlap at desktop and narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/'); await page.getByRole('button', { name: '喝水 · 30 分钟' }).click();
  const desktopList = await page.locator('.reminder-list-pane').boundingBox(); const desktopEditor = await page.locator('.reminder-editor').boundingBox();
  expect(desktopList.x + desktopList.width).toBeLessThanOrEqual(desktopEditor.x + 1);
  await page.screenshot({ path: 'artifacts/screenshots/task4-reminders-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: '宠物性格' }).click(); page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('tab', { name: '宠物性格' }).click();
  const desktopPersonaEditor = await page.locator('.persona-editor').boundingBox(); const desktopPreview = await page.locator('.persona-preview').boundingBox();
  expect(desktopPersonaEditor.x + desktopPersonaEditor.width).toBeLessThanOrEqual(desktopPreview.x + 1);
  await page.screenshot({ path: 'artifacts/screenshots/task4-persona-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 720, height: 900 }); await page.getByRole('tab', { name: '提醒计划' }).click();
  const narrowList = await page.locator('.reminder-list-pane').boundingBox(); const narrowEditor = await page.locator('.reminder-editor').boundingBox();
  expect(narrowList.y + narrowList.height).toBeLessThanOrEqual(narrowEditor.y + 1);
  const tabBoxes = await page.locator('.tabs button').evaluateAll((buttons) => buttons.map((button) => { const box = button.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; }));
  expect(tabBoxes.every(({ width }) => width > 48)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/task4-reminders-narrow.png', fullPage: true });
  await page.getByRole('tab', { name: '宠物性格' }).click();
  const narrowPersonaEditor = await page.locator('.persona-editor').boundingBox(); const narrowPreview = await page.locator('.persona-preview').boundingBox();
  expect(narrowPersonaEditor.y + narrowPersonaEditor.height).toBeLessThanOrEqual(narrowPreview.y + 1);
  await page.screenshot({ path: 'artifacts/screenshots/task4-persona-narrow.png', fullPage: true });
});

test('pet surface renders the illustrated companion without console errors', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 300, height: 280 });
  await page.goto('/pet.html'); await expect(page.getByAltText('桌面小狗末末')).toBeVisible();
  await expect(page.locator('#petHotspot')).toHaveCSS('width', '300px');
  await expect(page.locator('#petHotspot')).toHaveCSS('height', '280px');
  await expect(page.locator('#petStage')).toHaveAttribute('data-state', 'idle'); expect(errors).toEqual([]);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await expect(page.locator('#quickMenu [data-pose]')).toHaveCount(12);
  await expect(page.getByRole('button', { name: '专注' })).toBeVisible();
  const menuBox = await page.locator('#quickMenu').boundingBox();
  expect(menuBox.width).toBeLessThanOrEqual(190);
  const focusBox = await page.getByRole('button', { name: '专注' }).boundingBox();
  expect(focusBox.y).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: '困困' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await expect(page.locator('#quickMenu')).toBeHidden();
  expect(await page.locator('#petStage').getAttribute('data-state')).toBe('sleepy');
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-sleepy\.gif$/);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('button', { name: '喂零食' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await expect(page.locator('#quickMenu')).toBeHidden();
  expect(['feed', 'interactionFeed']).toContain(await page.locator('#petStage').getAttribute('data-state'));
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-feed\.gif$/);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('button', { name: '喝水' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await page.locator('#petHotspot').dispatchEvent('pointerup', { button: 0, pointerId: 1, pointerType: 'mouse' });
  expect(await page.locator('#petStage').getAttribute('data-state')).toBe('water');
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-water\.gif$/);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('button', { name: '求安慰' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-aggrieved\.gif$/);
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('button', { name: '气得跺脚' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-angry-standing\.gif$/);
  await page.screenshot({ path: 'artifacts/screenshots/pet-window.png', omitBackground: true });
});

test('pet countdown shows the active deadline and yields to speech bubbles', async ({ page }) => {
  page.clock.install({ time: new Date('2026-09-01T09:00:00') });
  await page.addInitScript(() => {
    const now = Date.now();
    const state = { now, timer: { status: 'running', phase: 'focus', task: '完成产品方案评审', targetAt: now + 14 * 60_000 + 32_000, remainingMs: 14 * 60_000 + 32_000 }, pet: { displayMode: 'full' }, settings: { voiceMode: 'off', interactions: true } };
    const stateListeners = []; const presentationListeners = [];
    globalThis.__emitPetState = (patch) => { Object.assign(state.timer, patch); state.now = Date.now(); stateListeners.forEach((callback) => callback(structuredClone(state))); };
    globalThis.__showPetPresentation = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => structuredClone(state), onState: (callback) => { stateListeners.push(callback); callback(structuredClone(state)); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; }, command: async () => state,
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });

  await page.setViewportSize({ width: 300, height: 280 }); await page.goto('/pet.html');
  await expect(page.locator('#petTimer')).toBeVisible();
  await expect(page.locator('#petTimerPhase')).toHaveText('专注中');
  await expect(page.locator('#petTimerTask')).toHaveText('完成产品方案评审');
  await expect(page.locator('#petTimerTime')).toHaveText('14:32');
  await expect(page.locator('#petTimerControls')).toBeVisible();
  await expect(page.locator('#petTimerProgress')).toHaveCSS('width', /.+/);
  await page.screenshot({ path: 'artifacts/screenshots/pet-countdown.png', omitBackground: true });

  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'ambientCompanion', kind: 'focus', text: '我安静陪着你。', duration: 1_000, priority: 10 }));
  await expect(page.locator('#speech')).toBeVisible(); await expect(page.locator('#petTimer')).toBeHidden();
  await page.screenshot({ path: 'artifacts/screenshots/pet-countdown-bubble.png', omitBackground: true });
  await page.clock.fastForward(1_000);
  await expect(page.locator('#speech')).toBeHidden(); await expect(page.locator('#petTimer')).toBeVisible();

  await page.evaluate(() => globalThis.__emitPetState({ status: 'paused', phase: 'break', targetAt: null, remainingMs: 3 * 60_000 + 10_000 }));
  await expect(page.locator('#petTimerPhase')).toHaveText('休息暂停');
  await expect(page.locator('#petTimerTime')).toHaveText('03:10');
  await expect(page.locator('#petTimerFinish')).toHaveText('结束休息');
  await page.evaluate(() => globalThis.__emitPetState({ status: 'idle', phase: 'focus' }));
  await expect(page.locator('#petTimer')).toBeHidden();
});

test('pet menu switches all four display modes and formal bubbles temporarily restore the pet', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    const now = Date.now();
    const state = { now, timer: { status: 'running', phase: 'focus', task: '整理需求', targetAt: now + 10 * 60_000, remainingMs: 10 * 60_000 }, pet: { displayMode: 'full' }, settings: { voiceMode: 'off', interactions: true } };
    const listeners = []; const presentations = []; const commands = [];
    globalThis.__petDisplayCommands = commands;
    globalThis.__showDisplayPresentation = (event) => presentations.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => structuredClone(state),
      onState: (callback) => { listeners.push(callback); callback(structuredClone(state)); return () => {}; },
      onPresentation: (callback) => { presentations.push(callback); return () => {}; },
      command: async (name, payload) => {
        commands.push({ name, payload });
        if (name === 'pet:displayMode') state.pet.displayMode = payload.mode;
        listeners.forEach((callback) => callback(structuredClone(state)));
        return structuredClone(state);
      },
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.setViewportSize({ width: 300, height: 360 }); await page.goto('/pet.html');
  await expect(page.locator('#petTimer')).toBeVisible();
  await expect(page.getByAltText('桌面小狗末末')).toBeVisible();

  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await expect(page.getByRole('radio', { name: '宠物和计时' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'artifacts/screenshots/pet-display-modes.png', omitBackground: true });
  await page.getByRole('radio', { name: '只显示宠物' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await expect(page.locator('#petTimer')).toBeHidden();
  await expect(page.getByAltText('桌面小狗末末')).toBeVisible();

  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('radio', { name: '只显示计时' }).dispatchEvent('pointerdown', { button: 0, pointerId: 2, pointerType: 'mouse' });
  await expect(page.locator('#petTimer')).toBeVisible();
  await expect(page.getByAltText('桌面小狗末末')).toBeHidden();
  await page.screenshot({ path: 'artifacts/screenshots/pet-timer-only.png', omitBackground: true });

  await page.evaluate(() => globalThis.__showDisplayPresentation({ category: 'focusComplete', kind: 'reward', text: '这颗番茄摘得漂亮。', duration: 1_000, priority: 400 }));
  await expect(page.getByAltText('桌面小狗末末')).toBeVisible();
  await expect(page.locator('#speech')).toBeVisible();
  await expect(page.locator('#petTimer')).toBeHidden();
  await page.screenshot({ path: 'artifacts/screenshots/pet-timer-only-complete.png', omitBackground: true });
  await page.clock.fastForward(1_000);
  await expect(page.getByAltText('桌面小狗末末')).toBeHidden();
  await expect(page.locator('#petTimer')).toBeVisible();

  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).click();
  await page.getByRole('radio', { name: '全部隐藏' }).dispatchEvent('pointerdown', { button: 0, pointerId: 3, pointerType: 'mouse' });
  await expect(page.locator('#petTimer')).toBeHidden();
  await expect(page.getByAltText('桌面小狗末末')).toBeHidden();
  expect(await page.evaluate(() => globalThis.__petDisplayCommands.map((item) => item.payload.mode))).toEqual(['pet', 'timer', 'hidden']);
});

test('main timer exposes elapsed progress and routes early break completion explicitly', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const state = {
      now, timer: { status: 'running', phase: 'break', task: '完成方案', focusMs: 25 * 60_000, breakMs: 5 * 60_000,
        targetAt: now + 3 * 60_000, remainingMs: 3 * 60_000, todayCount: 1 },
      todos: { items: [], activeId: null }, alarms: [], review: { days: [] },
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'off' }
    };
    const commands = []; globalThis.__timerCommands = commands;
    globalThis.pomopet = {
      getState: async () => structuredClone(state), onState: () => () => {}, showControl: () => {}, setDirty: () => {}, onDiscardDrafts: () => () => {},
      command: async (name, payload) => { commands.push({ name, payload }); return structuredClone(state); }
    };
  });
  await page.goto('/');
  await expect(page.locator('#timerProgress')).toHaveAttribute('aria-valuenow', '40');
  await expect(page.locator('#complete')).toHaveText('结束休息');
  await page.locator('#complete').click();
  expect(await page.evaluate(() => globalThis.__timerCommands.at(-1))).toEqual({ name: 'timer:endBreak', payload: undefined });
});

test('time review uses seven-day navigation and renders the selected day timeline and task distribution', async ({ page }) => {
  await page.addInitScript(() => {
    const nowDate = new Date(); nowDate.setHours(20, 47, 0, 0); const now = nowDate.getTime();
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: new Date(now - index * 86_400_000).toISOString().slice(0, 10),
      rangeStartAt: now - index * 86_400_000 - 10 * 3_600_000, rangeEndAt: now - index * 86_400_000,
      totals: { focusMs: index === 0 ? 5 * 3_600_000 + 20 * 60_000 : (index + 1) * 30 * 60_000, breakMs: 65 * 60_000, excludedMs: 3 * 3_600_000, unrecordedMs: 42 * 60_000, pausedMs: 0, unplacedMs: 0 },
      tasks: index === 0
        ? [{ key: 'product', title: '产品设计', ms: 148 * 60_000 }, { key: 'code', title: '代码实现', ms: 105 * 60_000 }]
        : [{ key: `history-${index}`, title: `历史任务 ${index}`, ms: 30 * 60_000 }],
      reminders: [{ text: '起来喝水', count: 3 }, { text: '活动一下', count: 2 }], reminderBuckets: { '10:30': 1, '15:00': 1 },
      counts: { natural: 1, early: 0, stopped: 0 }, restTimeWorkMs: 0, extensionCount: index === 0 ? 1 : 0, actualOffworkAt: index === 0 ? now : null
    }));
    days[0].timeline = [
      { startedAt: days[0].rangeStartAt, endedAt: days[0].rangeStartAt + 2 * 3_600_000, kind: 'focus', todoId: 'product', taskTitle: '产品设计' },
      { startedAt: days[0].rangeStartAt + 2 * 3_600_000, endedAt: days[0].rangeStartAt + 4 * 3_600_000, kind: 'excluded', todoId: null, taskTitle: '' },
      { startedAt: days[0].rangeStartAt + 4 * 3_600_000, endedAt: days[0].rangeStartAt + 5.75 * 3_600_000, kind: 'focus', todoId: 'code', taskTitle: '代码实现' },
      { startedAt: days[0].rangeStartAt + 5.75 * 3_600_000, endedAt: days[0].rangeStartAt + 6.25 * 3_600_000, kind: 'break', todoId: null, taskTitle: '' }
    ];
    days[0].reminderTimeline = [
      { occurrenceId: 'water', text: '起来喝水', firedAt: new Date(`${days[0].date}T10:30:00`).getTime() },
      { occurrenceId: 'move', text: '活动一下', firedAt: new Date(`${days[0].date}T15:00:00`).getTime() }
    ];
    for (let index = 1; index < days.length; index += 1) days[index].timeline = [];
    const state = { now, timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, todayCount: 0 }, todos: { items: [], activeId: null }, alarms: [], review: { days },
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'off' } };
    const listeners = [];
    globalThis.__emitReviewState = () => listeners.forEach((callback) => callback(structuredClone(state)));
    globalThis.pomopet = { getState: async () => structuredClone(state), onState: (callback) => { listeners.push(callback); return () => {}; }, command: async () => structuredClone(state), showControl: () => {}, setDirty: () => {}, onDiscardDrafts: () => () => {} };
  });
  await page.goto('/'); await page.getByRole('tab', { name: '时间回顾' }).click();
  await expect(page.locator('#reviewDateList button')).toHaveCount(7);
  await expect(page.locator('#reviewSelectedDate')).toContainText('时间花在哪里');
  await expect(page.locator('#reviewTimeline .review-timeline-segment')).toHaveCount(4);
  expect(await page.locator('#reviewTimeline .review-reminder-marker').allTextContents()).toEqual(['水', '动']);
  await expect(page.locator('#reviewTasks .review-task-row')).toHaveCount(2);
  await expect(page.locator('#reviewTasks')).toContainText('产品设计');
  await expect(page.locator('#reviewTasks')).toContainText('代码实现');
  await expect(page.locator('#reviewInsights p')).toHaveCount(2);
  await expect(page.locator('#reviewPanel')).toContainText('起来喝水');
  await page.locator('#reviewDateList button').nth(1).click();
  await expect(page.locator('#reviewTasks')).toContainText('历史任务 1');
  await expect(page.locator('#reviewTasks')).not.toContainText('产品设计');
  await page.evaluate(() => globalThis.__emitReviewState());
  await expect(page.locator('#reviewDateList button').nth(1)).toHaveAttribute('aria-current', 'date');
  await page.locator('#reviewDateList button').first().click();
  await page.screenshot({ path: 'artifacts/screenshots/time-review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 680, height: 900 });
  await expect(page.locator('#reviewDateList')).toBeHidden();
  await expect(page.locator('#reviewDateSelect')).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/time-review-narrow.png', fullPage: true });
});

test('off-work pet action names the configured snooze duration', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, offwork: { snoozeMinutes: 20 }, settings: { voiceMode: 'off', interactions: true } };
    const listeners = [];
    globalThis.__showPetPresentation = (event) => listeners.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { listeners.push(callback); return () => {}; }, command: async () => state,
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'offwork', kind: 'offwork', text: '下班啦', actions: { offwork: true, snoozeMinutes: 20 }, duration: 20_000, priority: 200 }));
  await expect(page.getByRole('button', { name: '再忙 20 分钟' })).toBeVisible();
});

test('pet quick menu opens from right click and closes by itself', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
    const commands = [];
    globalThis.__pomopetCommands = commands;
    globalThis.pomopet = {
      getState: async () => state,
      onState: (callback) => { callback(state); return () => {}; },
      onPresentation: () => {},
      command: async (name, payload) => { commands.push({ name, payload }); return state; },
      showControl: () => {},
      hidePet: () => {},
      dragPet: () => {}
    };
  });
  await page.setViewportSize({ width: 300, height: 280 });
  await page.goto('/pet.html');
  await expect(page.locator('#quickMenu')).toBeHidden();
  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await page.locator('#petHotspot').dispatchEvent('pointerup', { button: 0, pointerId: 1, pointerType: 'mouse' });
  expect(await page.evaluate(() => globalThis.__pomopetCommands)).toEqual([]);
  await page.getByRole('button', { name: '喝水' }).dispatchEvent('pointerdown', { button: 0, pointerId: 2, pointerType: 'mouse' });
  await page.locator('#petHotspot').dispatchEvent('pointerup', { button: 0, pointerId: 2, pointerType: 'mouse' });
  expect(await page.evaluate(() => globalThis.__pomopetCommands)).toEqual([]);
  expect(await page.locator('#petStage').getAttribute('data-state')).toBe('water');
  await page.locator('#petHotspot').dispatchEvent('contextmenu', { button: 2, clientX: 150, clientY: 160 });
  await expect(page.locator('#quickMenu')).toBeVisible();
  await page.getByRole('button', { name: '扔球' }).dispatchEvent('pointerdown', { button: 0, pointerId: 3, pointerType: 'mouse' });
  await expect(page.locator('#speechLabel')).toHaveText('去抢球');
  await expect(page.locator('#speechText')).toContainText('球来了');
  await page.locator('#petHotspot').dispatchEvent('contextmenu', { button: 2, clientX: 150, clientY: 160 });
  await page.getByRole('button', { name: '气鼓鼓' }).dispatchEvent('pointerdown', { button: 0, pointerId: 4, pointerType: 'mouse' });
  await expect(page.locator('#speechLabel')).toHaveText('气鼓鼓');
  await expect(page.locator('#speechText')).not.toContainText('球来了');
  await page.clock.fastForward(4_000);
  await expect(page.locator('#speech')).toBeVisible();
  await page.clock.fastForward(1_000);
  await expect(page.locator('#speech')).toBeHidden();
  await page.locator('#petHotspot').dispatchEvent('contextmenu', { button: 2, clientX: 150, clientY: 160 });
  await page.clock.fastForward(4_000);
  await expect(page.locator('#quickMenu')).toBeHidden();
});

test('pet stays anchored while idle until the user drags it', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    Math.random = () => 1;
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
    const drags = [];
    globalThis.__pomopetDrags = drags;
    globalThis.pomopet = {
      getState: async () => state,
      onState: (callback) => { callback(state); return () => {}; },
      onPresentation: () => {},
      command: async () => state,
      synthesizeSpeech: async () => null,
      showControl: () => {},
      hidePet: () => {},
      dragPet: (delta) => drags.push(delta)
    };
  });
  await page.setViewportSize({ width: 300, height: 280 });
  await page.goto('/pet.html');
  await page.clock.fastForward(20_000);
  expect(await page.evaluate(() => globalThis.__pomopetDrags)).toEqual([]);
});

test('pet menu toggles mute while keeping reminder copy visible', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { muted: false, voiceMode: 'all', volume: 0.75, interactions: true, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural' } };
    const stateListeners = []; const presentationListeners = []; const commands = []; const synthesized = [];
    const emit = () => stateListeners.forEach((callback) => callback(structuredClone(state)));
    globalThis.__muteCommands = commands;
    globalThis.__muteSynthesis = synthesized;
    globalThis.__showMutedReminder = () => presentationListeners.forEach((callback) => callback({ category: 'alarm', kind: 'water', label: '喝水提醒', text: '主人，喝口水再继续。', voiceText: '主人，喝口水再继续。', duration: 10_000, priority: 500 }));
    globalThis.pomopet = {
      getState: async () => structuredClone(state),
      onState: (callback) => { stateListeners.push(callback); callback(structuredClone(state)); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); if (name === 'settings:mute') Object.assign(state.settings, payload); emit(); return structuredClone(state); },
      synthesizeSpeech: async (payload) => { synthesized.push(payload); return null; },
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.setViewportSize({ width: 300, height: 440 });
  await page.goto('/pet.html');

  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  await page.getByRole('button', { name: '静音' }).dispatchEvent('pointerdown', { button: 0, pointerId: 2, pointerType: 'mouse' });
  await expect.poll(() => page.evaluate(() => globalThis.__muteCommands.at(-1))).toEqual({ name: 'settings:mute', payload: { muted: true } });
  await expect(page.getByText('已静音，末末会用气泡陪你')).toBeVisible();

  await page.evaluate(() => globalThis.__showMutedReminder());
  await expect(page.locator('#speechText')).toHaveText('喝水提醒：主人，喝口水再继续。');
  expect(await page.evaluate(() => globalThis.__muteSynthesis)).toEqual([]);

  await page.getByRole('button', { name: '打开 Pomopet 小屋' }).dispatchEvent('pointerdown', { button: 0, pointerId: 3, pointerType: 'mouse' });
  await expect(page.getByRole('button', { name: '取消静音' })).toBeVisible();
  await page.getByRole('button', { name: '取消静音' }).dispatchEvent('pointerdown', { button: 0, pointerId: 4, pointerType: 'mouse' });
  await expect.poll(() => page.evaluate(() => globalThis.__muteCommands.at(-1))).toEqual({ name: 'settings:mute', payload: { muted: false } });
  await page.evaluate(() => globalThis.__showMutedReminder());
  await expect.poll(() => page.evaluate(() => globalThis.__muteSynthesis.length)).toBe(1);
});

test('completed focus presentation offers pet reward actions', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    const state = { timer: { status: 'running', phase: 'break' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
    const presentationListeners = [];
    const commands = [];
    globalThis.__pomopetCommands = commands;
    globalThis.__petSpeaking = [];
    globalThis.__showPetPresentation = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => state,
      onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); return state; },
      setPetSpeaking: (payload) => globalThis.__petSpeaking.push(payload),
      showControl: () => {},
      hidePet: () => {},
      dragPet: () => {}
    };
  });

  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'focusComplete', kind: 'reward', text: '漂亮，这颗番茄摘得很稳。起来喝口水，活动一下肩膀，再回来继续也不迟。', actions: { reward: true, rewardDelayMs: 3_200 }, duration: 10_000, priority: 400 }));
  await expect.poll(() => page.evaluate(() => globalThis.__petSpeaking.at(-1))).toMatchObject({ visible: true });
  expect(await page.evaluate(() => globalThis.__petSpeaking.at(-1).height)).toBeGreaterThan(280);
  await expect(page.getByRole('button', { name: '奖励饼干' })).toBeHidden();
  await expect(page.getByRole('button', { name: '陪它玩球' })).toBeHidden();
  await page.clock.fastForward(3_200);
  await expect(page.getByRole('button', { name: '奖励饼干' })).toBeVisible();
  await expect(page.getByRole('button', { name: '陪它玩球' })).toBeVisible();
  await expect(page.getByRole('button', { name: '10 分钟后提醒' })).toBeHidden();
  await page.getByRole('button', { name: '奖励饼干' }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__petSpeaking.at(-1))).toMatchObject({ visible: true, height: 280 });
  await expect(page.locator('#speech')).toHaveClass(/hidden/);
  expect(await page.locator('#petStage').getAttribute('data-state')).toBe('feed');
  await expect(page.getByAltText('桌面小狗末末')).toHaveAttribute('src', /momo-feed\.gif$/);
  expect(await page.evaluate(() => globalThis.__pomopetCommands)).toContainEqual({ name: 'interaction', payload: { kind: 'interactionFeed' } });
  await page.clock.fastForward(5_000);
  await expect.poll(() => page.evaluate(() => globalThis.__petSpeaking.at(-1))).toMatchObject({ visible: false, restoreDisplay: true });
});

test('long alarm bubble stays close to the pet without covering it', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true } };
    const presentationListeners = [];
    globalThis.__petSpeaking = [];
    globalThis.__showPetPresentation = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => state,
      onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; },
      command: async () => state,
      setPetSpeaking: (payload) => globalThis.__petSpeaking.push(payload),
      showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });

  await page.setViewportSize({ width: 300, height: 420 });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'alarm', kind: 'water', label: '喝水提醒', text: '吃饭之前多喝水减肥：主人，光喝白水可瘦不了，末末都闻到外卖香了，咱吃饱才有力气减肥呀。', actions: { alarmId: 'water', occurrenceId: 'today' }, duration: 20_000, priority: 500 }));
  await expect(page.getByRole('button', { name: '10 分钟后提醒' })).toBeVisible();
  await page.clock.fastForward(20);
  const requestedHeight = await page.evaluate(() => Math.round(globalThis.__petSpeaking.at(-1).height));
  await page.setViewportSize({ width: 300, height: requestedHeight });
  const speechBox = await page.locator('#speech').boundingBox();
  const petBox = await page.getByAltText('桌面小狗末末').boundingBox();
  const overlap = speechBox.y + speechBox.height - petBox.y;
  expect(overlap).toBeGreaterThanOrEqual(0);
  expect(overlap).toBeLessThanOrEqual(16);
  await page.screenshot({ path: 'artifacts/screenshots/pet-long-reminder.png', omitBackground: true });
});

test('pet speech prefers Edge TTS generated media for voice text', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { timer: { status: 'running', phase: 'break' }, settings: { voiceMode: 'key', volume: 0.75, interactions: true, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', voiceStyle: 'cute' } };
    const presentationListeners = [];
    globalThis.__playedAudio = [];
    globalThis.Audio = class {
      constructor(url) { this.url = url; this.volume = 1; globalThis.__playedAudio.push(url); }
      play() { return Promise.resolve(); }
      pause() {}
    };
    globalThis.speechSynthesis = { speak: () => { throw new Error('system speech should not be used'); } };
    globalThis.__showPetPresentation = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => state,
      onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; },
      command: async () => state,
      synthesizeSpeech: async ({ text, voice, style }) => ({ url: `file:///tmp/${encodeURIComponent(`${voice}-${style}-${text}`)}.mp3` }),
      showControl: () => {},
      hidePet: () => {},
      dragPet: () => {}
    };
  });

  await page.setViewportSize({ width: 300, height: 280 });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'focusComplete', kind: 'reward', text: '做完啦', voiceText: '这颗番茄完成得真漂亮', duration: 10_000, priority: 400 }));
  await expect.poll(() => page.evaluate(() => globalThis.__playedAudio)).toEqual([expect.stringContaining('zh-CN-XiaoxiaoNeural-cute')]);
});

test('higher-priority presentation stops low speech before Edge TTS resolves and ignores stale synthesis', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'all', volume: 0.75, interactions: true, ttsEngine: 'edge', edgeTtsVoice: 'zh-CN-XiaoxiaoNeural', voiceStyle: 'cute' } };
    const listeners = []; const pending = new Map();
    globalThis.__paused = []; globalThis.__played = [];
    globalThis.Audio = class {
      constructor(url) { this.url = url; globalThis.__played.push(url); }
      play() { return Promise.resolve(); }
      pause() { globalThis.__paused.push(this.url); }
    };
    globalThis.__present = (event) => listeners.forEach((callback) => callback(event));
    globalThis.__resolveSpeech = (text) => pending.get(text)?.({ url: `file:///tmp/${text}.mp3` });
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { listeners.push(callback); return () => {}; }, command: async () => state,
      synthesizeSpeech: ({ text }) => new Promise((resolve) => pending.set(text, resolve)),
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__present({ category: 'interactionPet', kind: 'pet', text: '低优先级', voiceText: '低优先级', priority: 100 }));
  await page.evaluate(() => globalThis.__resolveSpeech('低优先级'));
  await expect.poll(() => page.evaluate(() => globalThis.__played)).toEqual(['file:///tmp/低优先级.mp3']);
  await page.evaluate(() => globalThis.__present({ category: 'alarm', kind: 'water', text: '高优先级', voiceText: '高优先级', priority: 500 }));
  await expect.poll(() => page.evaluate(() => globalThis.__paused)).toEqual(['file:///tmp/低优先级.mp3']);
  await page.evaluate(() => globalThis.__present({ category: 'focusComplete', kind: 'reward', text: '更新事件', voiceText: '更新事件', priority: 400 }));
  await page.evaluate(() => globalThis.__resolveSpeech('高优先级'));
  await page.waitForTimeout(0);
  expect(await page.evaluate(() => globalThis.__played)).toEqual(['file:///tmp/低优先级.mp3']);
  await page.evaluate(() => globalThis.__resolveSpeech('更新事件'));
  await expect.poll(() => page.evaluate(() => globalThis.__played)).toEqual(['file:///tmp/低优先级.mp3', 'file:///tmp/更新事件.mp3']);
});

test('pet voice modes silence off, restrict key, and allow all event text', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { timer: { status: 'idle', phase: 'focus' }, settings: { voiceMode: 'off', volume: 0.75, interactions: true, ttsEngine: 'edge', voiceStyle: 'cute' } };
    const presentationListeners = []; const synthesized = [];
    globalThis.__synthesized = synthesized;
    globalThis.__setVoiceMode = (voiceMode) => { state.settings.voiceMode = voiceMode; };
    globalThis.__showPetPresentation = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} };
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; }, command: async () => state,
      synthesizeSpeech: async ({ text }) => { synthesized.push(text); return { url: `file:///tmp/${synthesized.length}.mp3` }; },
      setPetSpeaking: () => {}, showControl: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'alarm', kind: 'alarm', text: '闹钟', voiceText: '关闭时不说', priority: 500 }));
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'offwork', kind: 'offwork', text: '下班', voiceText: '关闭时下班也不说', priority: 300 }));
  await expect.poll(() => page.evaluate(() => globalThis.__synthesized)).toEqual([]);
  await page.evaluate(() => { globalThis.__setVoiceMode('key'); globalThis.__showPetPresentation({ category: 'interactionPet', kind: 'pet', text: '摸摸头', priority: 100 }); });
  await expect.poll(() => page.evaluate(() => globalThis.__synthesized)).toEqual([]);
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'alarm', kind: 'alarm', text: '闹钟', voiceText: '关键提醒', priority: 500 }));
  await expect.poll(() => page.evaluate(() => globalThis.__synthesized)).toEqual(['关键提醒']);
  await page.evaluate(() => globalThis.__showPetPresentation({ category: 'breakComplete', kind: 'breakComplete', text: '休息结束', voiceText: '该选下一件事啦', priority: 300 }));
  await expect.poll(() => page.evaluate(() => globalThis.__synthesized)).toEqual(['关键提醒', '该选下一件事啦']);
  await page.evaluate(() => { globalThis.__setVoiceMode('all'); globalThis.__showPetPresentation({ category: 'interactionPet', kind: 'pet', text: '所有提示也说', priority: 100 }); });
  await expect.poll(() => page.evaluate(() => globalThis.__synthesized)).toEqual(['关键提醒', '该选下一件事啦', '所有提示也说']);
});

test('off-work blocker page renders a large lying pet', async ({ page }) => {
  const errors = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/block.html'); await expect(page.getByAltText('末末躺在桌面上')).toBeVisible();
  const petBox = await page.getByAltText('末末躺在桌面上').boundingBox();
  expect(petBox.width).toBeGreaterThanOrEqual(1280 * 0.79);
  await expect(page.getByRole('button', { name: '今天收工了' })).toBeDisabled();
  await page.getByPlaceholder('明天先从哪里继续？').fill('明天先补完时间回顾测试');
  await expect(page.getByRole('button', { name: '今天收工了' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('break completion bubble keeps stable actions and hides without resolving the pending choice', async ({ page }) => {
  page.clock.install();
  await page.addInitScript(() => {
    const state = {
      timer: { status: 'idle', phase: 'focus', pendingBreakChoice: { previousTodoId: 'previous', focusMinutes: 25, breakMinutes: 5, createdAt: 1 } },
      breakContinuation: { previousTodoId: 'previous', canContinue: true, recommendedTodoId: 'recommended',
        choices: [{ id: 'recommended', title: '推荐任务' }, { id: 'previous', title: '刚才任务' }],
        actions: { continue: true, choose: true, idle: true, addTodo: false } },
      settings: { voiceMode: 'off', volume: 0.75, interactions: true }
    };
    const presentations = []; const commands = []; const showControlCalls = [];
    globalThis.__commands = commands; globalThis.__showControlCalls = showControlCalls;
    globalThis.__pendingChoice = () => state.timer.pendingBreakChoice;
    globalThis.__present = (event) => presentations.forEach((callback) => callback(event));
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      onPresentation: (callback) => { presentations.push(callback); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); return state; },
      showControl: (payload) => showControlCalls.push(payload), setPetSpeaking: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  await page.setViewportSize({ width: 300, height: 440 }); await page.goto('/pet.html');
  await page.evaluate(() => globalThis.__present({ category: 'breakComplete', kind: 'focus', text: 'AI 把按钮也改成诗句',
    actions: { breakContinuation: true, canContinue: true, recommendedTodoId: 'recommended', addTodo: false }, duration: 20_000, priority: 200 }));
  await expect(page.getByRole('button', { name: '继续刚才的任务' })).toBeVisible();
  await expect(page.getByRole('button', { name: '换下一件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '先不开始' })).toBeVisible();
  await page.getByRole('button', { name: '换下一件' }).click();
  expect(await page.evaluate(() => globalThis.__showControlCalls)).toEqual([{ focus: 'break-chooser' }]);
  expect(await page.evaluate(() => globalThis.__commands)).toEqual([]);

  await page.evaluate(() => globalThis.__present({ category: 'breakComplete', kind: 'breakComplete', text: '推荐下一项',
    actions: { breakContinuation: true, canContinue: false, recommendedTodoId: 'recommended', addTodo: false }, duration: 20_000, priority: 200 }));
  await expect(page.getByRole('button', { name: '开始推荐任务' })).toBeVisible();
  await expect(page.locator('#speechLabel')).toHaveText('休息结束啦');

  await page.evaluate(() => globalThis.__present({ category: 'breakComplete', kind: 'focus', text: '另一句文案',
    actions: { breakContinuation: true, canContinue: true, recommendedTodoId: 'recommended', addTodo: false }, duration: 20_000, priority: 200 }));
  await page.clock.fastForward(20_000);
  await expect(page.locator('#speech')).toBeHidden();
  expect(await page.evaluate(() => globalThis.__pendingChoice())).toEqual({ previousTodoId: 'previous', focusMinutes: 25, breakMinutes: 5, createdAt: 1 });
  expect(await page.evaluate(() => globalThis.__commands)).toEqual([]);
});

test('main control continuation strip uses state ordering and runs continue chooser and idle actions', async ({ page }) => {
  await page.addInitScript(() => {
    const choices = [{ id: 'manual', title: '手动切换任务', priority: 'P2' }, { id: 'previous', title: '刚才任务', priority: 'P0' }];
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 25 * 60_000, targetAt: null, todayCount: 1, pendingBreakChoice: { previousTodoId: 'previous' } },
      breakContinuation: { previousTodoId: 'previous', canContinue: true, recommendedTodoId: 'manual', choices,
        actions: { continue: true, choose: true, idle: true, addTodo: false } },
      todos: { items: choices, activeId: 'manual' }, alarms: [],
      offwork: { enabled: true, time: '18:30', weekdays: [1, 2, 3, 4, 5], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'off', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false }
    };
    const commands = []; globalThis.__commands = commands;
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); return state; }, showControl: () => {}, onControlFocus: () => {}
    };
  });
  await page.goto('/');
  await expect(page.locator('#breakContinuation')).toBeVisible();
  await expect(page.locator('#breakContinuation')).toHaveAttribute('role', 'status');
  await expect(page.locator('#breakContinuation')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('button', { name: '继续刚才的任务' })).toBeVisible();
  const chooserTrigger = page.getByRole('button', { name: '换下一件' });
  await expect(chooserTrigger).toHaveAttribute('aria-controls', 'breakChooser');
  await expect(chooserTrigger).toHaveAttribute('aria-expanded', 'false');
  await chooserTrigger.click();
  const chooser = page.locator('#breakChooser'); await expect(chooser).toBeVisible();
  await expect(chooserTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(chooser.getByRole('button')).toHaveText(['手动切换任务', '刚才任务']);
  await expect(chooser.getByRole('button').first()).toBeFocused();
  await chooserTrigger.click();
  await expect(chooser).toBeHidden();
  await expect(chooserTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(chooserTrigger).toBeFocused();
  await chooserTrigger.click();
  await chooser.getByRole('button', { name: '手动切换任务' }).click();
  await page.getByRole('button', { name: '继续刚才的任务' }).click();
  await page.getByRole('button', { name: '先不开始' }).click();
  expect(await page.evaluate(() => globalThis.__commands.filter(({ name }) => name.startsWith('break:')))).toEqual([
    { name: 'break:switch', payload: { todoId: 'manual' } }, { name: 'break:continue', payload: undefined }, { name: 'break:idle', payload: undefined }
  ]);
});

test('no-todo continuation opens and focuses the todo entry through the control bridge', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1, targetAt: null, todayCount: 0, pendingBreakChoice: { previousTodoId: null } },
      breakContinuation: { previousTodoId: null, canContinue: false, recommendedTodoId: null, choices: [], actions: { continue: false, choose: false, idle: true, addTodo: true } },
      todos: { items: [], activeId: null }, alarms: [],
      offwork: { enabled: false, time: '18:30', weekdays: [], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'off', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false }
    };
    const focusListeners = []; const calls = []; globalThis.__showControlCalls = calls;
    globalThis.__focusTodoEntry = () => focusListeners.forEach((callback) => callback({ focus: 'todo-entry' }));
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { callback(state); return () => {}; }, command: async () => state,
      showControl: (payload) => calls.push(payload), onControlFocus: (callback) => { focusListeners.push(callback); return () => {}; }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加下一件事' }).click();
  expect(await page.evaluate(() => globalThis.__showControlCalls)).toEqual([{ focus: 'todo-entry' }]);
  await page.evaluate(() => globalThis.__focusTodoEntry());
  await expect(page.locator('#todoTitle')).toBeFocused();
});

test('active break bubble reconciles actions and closes when pending state changes', async ({ page }) => {
  await page.addInitScript(() => {
    const previous = { previousTodoId: 'previous', focusMinutes: 25, breakMinutes: 5, createdAt: 1 };
    const state = {
      timer: { status: 'idle', phase: 'focus', pendingBreakChoice: previous },
      breakContinuation: { ...previous, canContinue: true, recommendedTodoId: 'previous', choices: [{ id: 'previous', title: '刚才任务' }],
        actions: { continue: true, choose: true, idle: true, addTodo: false } },
      settings: { voiceMode: 'off', volume: 0.75, interactions: true }
    };
    const stateListeners = []; const presentationListeners = []; const commands = []; const showControlCalls = [];
    globalThis.__commands = commands; globalThis.__showControlCalls = showControlCalls;
    globalThis.__present = (event) => presentationListeners.forEach((callback) => callback(event));
    globalThis.__setContinuation = (continuation) => {
      state.breakContinuation = continuation;
      state.timer.pendingBreakChoice = continuation ? previous : null;
      stateListeners.forEach((callback) => callback(state));
    };
    globalThis.pomopet = {
      getState: async () => state, onState: (callback) => { stateListeners.push(callback); callback(state); return () => {}; },
      onPresentation: (callback) => { presentationListeners.push(callback); return () => {}; },
      command: async (name, payload) => { commands.push({ name, payload }); return state; },
      showControl: (payload) => showControlCalls.push(payload), setPetSpeaking: () => {}, hidePet: () => {}, dragPet: () => {}
    };
  });
  const showBreak = () => page.evaluate(() => globalThis.__present({ category: 'breakComplete', kind: 'breakComplete', text: '休息结束',
    actions: { breakContinuation: true, canContinue: true, recommendedTodoId: 'previous', addTodo: false }, duration: 20_000, priority: 200 }));
  await page.setViewportSize({ width: 300, height: 440 }); await page.goto('/pet.html'); await showBreak();

  await page.evaluate(() => globalThis.__setContinuation({ previousTodoId: 'previous', canContinue: true, recommendedTodoId: null,
    choices: [], actions: { continue: true, choose: false, idle: true, addTodo: false } }));
  await expect(page.getByRole('button', { name: '继续刚才的任务' })).toBeVisible();
  await expect(page.getByRole('button', { name: '换下一件' })).toBeHidden();
  await expect(page.getByRole('button', { name: '先不开始' })).toBeVisible();

  await page.evaluate(() => globalThis.__setContinuation({ previousTodoId: 'previous', canContinue: false, recommendedTodoId: 'next',
    choices: [{ id: 'next', title: '当前推荐' }], actions: { continue: false, choose: true, idle: true, addTodo: false } }));
  await expect(page.getByRole('button', { name: '开始推荐任务' })).toBeVisible();
  await page.getByRole('button', { name: '开始推荐任务' }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__commands.at(-1))).toEqual({ name: 'break:switch', payload: { todoId: 'next' } });

  await showBreak();
  await page.evaluate(() => globalThis.__setContinuation({ previousTodoId: 'previous', canContinue: false, recommendedTodoId: null,
    choices: [], actions: { continue: false, choose: false, idle: true, addTodo: true } }));
  await expect(page.getByRole('button', { name: '添加下一件事' })).toBeVisible();
  await expect(page.getByRole('button', { name: '换下一件' })).toBeHidden();
  await page.getByRole('button', { name: '添加下一件事' }).click();
  expect(await page.evaluate(() => globalThis.__showControlCalls.at(-1))).toEqual({ focus: 'todo-entry' });

  await showBreak();
  await page.evaluate(() => globalThis.__setContinuation(null));
  await expect(page.locator('#speech')).toBeHidden();
});

test('continuation chooser preserves focus across equivalent ticks and recovers after choice changes', async ({ page }) => {
  await page.addInitScript(() => {
    const choices = [
      { id: 'first', title: '第一项', priority: 'P0' },
      { id: 'second', title: '第二项', priority: 'P1' }
    ];
    const state = {
      now: Date.now(), timer: { status: 'idle', phase: 'focus', remainingMs: 1, targetAt: null, todayCount: 1, pendingBreakChoice: { previousTodoId: 'first' } },
      breakContinuation: { previousTodoId: 'first', canContinue: true, recommendedTodoId: 'first', choices,
        actions: { continue: true, choose: true, idle: true, addTodo: false } },
      todos: { items: choices, activeId: 'first' }, alarms: [],
      offwork: { enabled: false, time: '18:30', weekdays: [], pose: 'sleepy', blockMode: false, snoozeMinutes: 15, escalateMinutes: 15 },
      settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'off', volume: 0.75, interactions: true, launchAtLogin: false, aiCopyEnabled: false }
    };
    const listeners = []; const copy = (value) => JSON.parse(JSON.stringify(value));
    const emit = () => listeners.forEach((callback) => callback(copy(state)));
    globalThis.__emitEquivalentTicks = () => { state.now += 500; emit(); state.now += 500; emit(); };
    globalThis.__rememberFocusedChoice = () => { globalThis.__rememberedChoice = document.activeElement; };
    globalThis.__focusedChoiceStatus = () => ({ same: document.activeElement === globalThis.__rememberedChoice, connected: globalThis.__rememberedChoice?.isConnected });
    globalThis.__setChoices = (nextChoices) => {
      state.breakContinuation.choices = nextChoices;
      state.breakContinuation.recommendedTodoId = nextChoices[0]?.id || null;
      state.breakContinuation.actions.choose = nextChoices.length > 0;
      state.todos.items = nextChoices;
      emit();
    };
    globalThis.pomopet = {
      getState: async () => copy(state), onState: (callback) => { listeners.push(callback); callback(copy(state)); return () => {}; },
      command: async () => copy(state), showControl: () => {}, onControlFocus: () => {}
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '换下一件' }).click();
  const chooser = page.locator('#breakChooser');
  await chooser.getByRole('button', { name: '第二项' }).focus();
  await page.evaluate(() => globalThis.__rememberFocusedChoice());
  await page.evaluate(() => globalThis.__emitEquivalentTicks());
  expect(await page.evaluate(() => globalThis.__focusedChoiceStatus())).toEqual({ same: true, connected: true });
  await expect(chooser.getByRole('button', { name: '第二项' })).toBeFocused();

  await page.evaluate(() => globalThis.__setChoices([
    { id: 'second', title: '第二项已更新', priority: 'P0' },
    { id: 'third', title: '第三项', priority: 'P1' }
  ]));
  await expect(chooser.getByRole('button', { name: '第二项已更新' })).toBeFocused();

  await page.evaluate(() => globalThis.__setChoices([
    { id: 'third', title: '第三项', priority: 'P1' },
    { id: 'fourth', title: '第四项', priority: 'P2' }
  ]));
  await expect(chooser.getByRole('button', { name: '第三项' })).toBeFocused();
});
