export function decideControlClose({ dirty, quitting }) {
  if (quitting) return 'close';
  return dirty ? 'confirm' : 'hide';
}

export function decideControlCloseAfterPrompt({ quitting, windowAvailable, response }) {
  if (quitting) return 'close';
  if (!windowAvailable) return 'ignore';
  return response === 1 ? 'discard-hide' : 'focus';
}

export async function resolveControlClose({ dirty, quitting, confirmDiscard, getCurrentState }) {
  const decision = decideControlClose({ dirty, quitting });
  if (decision !== 'confirm') return decision;
  const response = await confirmDiscard();
  const current = getCurrentState?.() || { quitting, windowAvailable: true };
  return decideControlCloseAfterPrompt({ ...current, response });
}
