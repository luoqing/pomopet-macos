import { describe, expect, it, vi } from 'vitest';
import { createAiKeyHandler, createIpcAuthorizer } from '../src/platform/electron/ipc-security.mjs';

describe('AI key IPC security', () => {
  it('allows only the live control renderer to mutate the key', async () => {
    const controlContents = {}; const controlWindow = { isDestroyed: () => false, webContents: controlContents }; const setAiKey = vi.fn(async () => {});
    const handler = createAiKeyHandler({ getControlWindow: () => controlWindow, setAiKey });
    await handler({ sender: controlContents }, 'new-key');
    const petContents = {}; const blockerContents = {};
    await expect(handler({ sender: petContents }, 'stolen-by-pet')).rejects.toThrow('unauthorized_sender');
    await expect(handler({ sender: blockerContents }, 'stolen-by-blocker')).rejects.toThrow('unauthorized_sender');
    await expect(handler({ sender: controlContents }, { key: 'not-a-string' })).rejects.toThrow('invalid_ai_key');
    expect(setAiKey).toHaveBeenCalledTimes(1); expect(setAiKey).toHaveBeenCalledWith('new-key');
  });
});

describe('renderer IPC authorization', () => {
  const setup = () => {
    const contents = { control: {}, pet: {}, blocker: {}, unknown: {} };
    const windows = Object.fromEntries(['control', 'pet', 'blocker'].map((role) => [role, { isDestroyed: () => false, webContents: contents[role] }]));
    const authorizer = createIpcAuthorizer({
      getControlWindow: () => windows.control,
      getPetWindow: () => windows.pet,
      getBlockWindow: () => windows.blocker
    });
    return { authorizer, contents, windows };
  };

  it.each([
    ['control', 'timer:start'], ['control', 'break:switch'], ['control', 'todo:update'], ['control', 'todo:start'], ['control', 'alarm:add'],
    ['control', 'settings:update'], ['control', 'persona:update'],
    ['pet', 'interaction'], ['pet', 'timer:pause'], ['pet', 'timer:resume'], ['pet', 'timer:complete'], ['pet', 'timer:endBreak'], ['pet', 'timer:stop'],
    ['pet', 'alarm:snooze'], ['pet', 'offwork:dismiss'], ['pet', 'break:continue'], ['pet', 'settings:mute'], ['pet', 'pet:displayMode'],
    ['blocker', 'offwork:snooze'], ['blocker', 'offwork:dismiss']
  ])('allows %s renderer command %s', (role, command) => {
    const { authorizer, contents } = setup();
    expect(authorizer.authorizeCommand({ sender: contents[role] }, command)).toBe(role);
  });

  it.each([
    ['pet', 'settings:update'], ['pet', 'todo:remove'], ['blocker', 'break:continue'], ['blocker', 'alarm:dismiss'],
    ['control', 'unknown:command']
  ])('rejects %s renderer command %s', (role, command) => {
    const { authorizer, contents } = setup();
    expect(() => authorizer.authorizeCommand({ sender: contents[role] }, command)).toThrow('unauthorized_command');
  });

  it('rejects unknown and destroyed senders', () => {
    const { authorizer, contents, windows } = setup();
    expect(() => authorizer.authorizeCommand({ sender: contents.unknown }, 'timer:start')).toThrow('unauthorized_sender');
    windows.pet.isDestroyed = () => true;
    expect(() => authorizer.authorizeCommand({ sender: contents.pet }, 'interaction')).toThrow('unauthorized_sender');
  });

  it('allows show-control only from control or pet and validates focus tokens', () => {
    const { authorizer, contents } = setup();
    expect(authorizer.authorizeShowControl({ sender: contents.control })).toEqual({});
    expect(authorizer.authorizeShowControl({ sender: contents.pet }, { focus: 'todo-entry', ignored: true })).toEqual({ focus: 'todo-entry' });
    expect(authorizer.authorizeShowControl({ sender: contents.pet }, { focus: 'break-chooser' })).toEqual({ focus: 'break-chooser' });
    expect(() => authorizer.authorizeShowControl({ sender: contents.blocker })).toThrow('unauthorized_sender');
    expect(() => authorizer.authorizeShowControl({ sender: contents.pet }, { focus: 'settings' })).toThrow('invalid_focus_token');
    expect(() => authorizer.authorizeShowControl({ sender: contents.pet }, 'todo-entry')).toThrow('invalid_focus_token');
  });

  it.each([
    ['blocker', 'hide-blocker'],
    ['pet', 'hide-pet'],
    ['pet', 'pet:set-speaking'],
    ['pet', 'drag-pet'],
    ['pet', 'speech:synthesize']
  ])('allows only the required %s renderer for sensitive channel %s', (role, channel) => {
    const { authorizer, contents } = setup();
    expect(authorizer.authorizeChannel({ sender: contents[role] }, channel)).toBe(role);
    for (const other of ['control', 'pet', 'blocker'].filter((candidate) => candidate !== role)) {
      expect(() => authorizer.authorizeChannel({ sender: contents[other] }, channel)).toThrow('unauthorized_channel');
    }
    expect(() => authorizer.authorizeChannel({ sender: contents.unknown }, channel)).toThrow('unauthorized_sender');
  });
});
