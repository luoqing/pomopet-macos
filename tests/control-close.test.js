import { describe, expect, it, vi } from 'vitest';
import { decideControlClose, decideControlCloseAfterPrompt, resolveControlClose } from '../src/platform/electron/control-close.mjs';

describe('control window close protection', () => {
  it('hides a clean window and never blocks application quit', async () => {
    const confirmDiscard = vi.fn();
    expect(await resolveControlClose({ dirty: false, quitting: false, confirmDiscard })).toBe('hide');
    expect(await resolveControlClose({ dirty: true, quitting: true, confirmDiscard })).toBe('close');
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('keeps editing or discards according to the native dialog response', async () => {
    expect(decideControlClose({ dirty: true, quitting: false })).toBe('confirm');
    await expect(resolveControlClose({ dirty: true, quitting: false, confirmDiscard: async () => 0 })).resolves.toBe('focus');
    await expect(resolveControlClose({ dirty: true, quitting: false, confirmDiscard: async () => 1 })).resolves.toBe('discard-hide');
  });

  it('ignores a pending dialog result when the app quits or the window is destroyed', async () => {
    expect(decideControlCloseAfterPrompt({ quitting: true, windowAvailable: true, response: 1 })).toBe('close');
    expect(decideControlCloseAfterPrompt({ quitting: false, windowAvailable: false, response: 1 })).toBe('ignore');
    expect(decideControlCloseAfterPrompt({ quitting: false, windowAvailable: true, response: 1 })).toBe('discard-hide');
  });
});
