const CONTROL_COMMANDS = new Set([
  'timer:start', 'timer:pause', 'timer:resume', 'timer:stop', 'timer:complete', 'timer:endBreak', 'timer:skipBreak', 'timer:updateTask',
  'break:continue', 'break:switch', 'break:idle',
  'todo:add', 'todo:update', 'todo:remove', 'todo:active', 'todo:toggle', 'todo:start',
  'alarm:add', 'alarm:update', 'alarm:remove', 'alarm:enabled', 'alarm:snooze', 'alarm:dismiss',
  'offwork:update', 'offwork:snooze', 'offwork:dismiss',
  'settings:update', 'persona:update', 'ai:test', 'companion:suppress', 'pet:visible'
]);
const PET_COMMANDS = new Set([
  'interaction', 'timer:pause', 'timer:resume', 'timer:complete', 'timer:endBreak', 'timer:stop',
  'alarm:snooze', 'alarm:dismiss', 'offwork:snooze', 'offwork:dismiss',
  'break:continue', 'break:switch', 'break:idle', 'pet:visible', 'pet:displayMode', 'settings:mute'
]);
const BLOCKER_COMMANDS = new Set(['offwork:snooze', 'offwork:dismiss']);
const FOCUS_TOKENS = new Set(['todo-entry', 'break-chooser']);
const CHANNEL_ROLES = new Map([
  ['hide-blocker', new Set(['blocker'])],
  ['hide-pet', new Set(['pet'])],
  ['pet:set-speaking', new Set(['pet'])],
  ['drag-pet', new Set(['pet'])],
  ['speech:synthesize', new Set(['pet'])]
]);

export function createIpcAuthorizer({ getControlWindow, getPetWindow, getBlockWindow }) {
  const windows = [
    ['control', getControlWindow, CONTROL_COMMANDS],
    ['pet', getPetWindow, PET_COMMANDS],
    ['blocker', getBlockWindow, BLOCKER_COMMANDS]
  ];

  function senderRole(event) {
    for (const [role, getWindow, commands] of windows) {
      const window = getWindow?.();
      if (window && !window.isDestroyed() && event?.sender === window.webContents) return { role, commands };
    }
    throw new Error('unauthorized_sender');
  }

  return {
    authorizeCommand(event, command) {
      const { role, commands } = senderRole(event);
      if (typeof command !== 'string' || !commands.has(command)) throw new Error('unauthorized_command');
      return role;
    },
    authorizeShowControl(event, payload) {
      const { role } = senderRole(event);
      if (!['control', 'pet'].includes(role)) throw new Error('unauthorized_sender');
      if (payload === undefined) return {};
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_focus_token');
      if (payload.focus === undefined) return {};
      if (!FOCUS_TOKENS.has(payload.focus)) throw new Error('invalid_focus_token');
      return { focus: payload.focus };
    },
    authorizeChannel(event, channel) {
      const { role } = senderRole(event);
      const roles = CHANNEL_ROLES.get(channel);
      if (!roles?.has(role)) throw new Error('unauthorized_channel');
      return role;
    }
  };
}

export function createAiKeyHandler({ getControlWindow, setAiKey }) {
  return async (event, key) => {
    const controlWindow = getControlWindow();
    if (!controlWindow || controlWindow.isDestroyed() || event?.sender !== controlWindow.webContents) throw new Error('unauthorized_sender');
    if (typeof key !== 'string' || key.length > 512) throw new Error('invalid_ai_key');
    return setAiKey(key);
  };
}
