import { describe, expect, it, vi } from 'vitest';
import { createBlockerSuppression } from '../src/platform/electron/blocker-suppression.mjs';

describe('off-work blocker suppression', () => {
  it('sends one begin/end pair across repeated show and hide lifecycle calls', async () => {
    const command = vi.fn(async () => {});
    const suppression = createBlockerSuppression(command);
    await suppression.setActive(true); await suppression.setActive(true);
    await suppression.setActive(false); await suppression.setActive(false);
    expect(command.mock.calls).toEqual([
      ['companion:suppress', { source: 'blocker', active: true }],
      ['companion:suppress', { source: 'blocker', active: false }]
    ]);
  });
});
