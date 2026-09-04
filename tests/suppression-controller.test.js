import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSuppressionController } from '../src/ui/suppression-controller.js';

describe('suppression controller', () => {
  afterEach(() => vi.useRealTimers());

  it('retries a failed activation and confirms only after IPC succeeds', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValueOnce(new Error('ipc down')).mockResolvedValue(undefined);
    const controller = createSuppressionController({ send, retryDelayMs: 20, maxRetries: 2 });
    await controller.setDesired('typing', true);
    expect(controller.snapshot('typing')).toMatchObject({ desired: true, confirmed: false, inFlight: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(send).toHaveBeenCalledTimes(2); expect(controller.snapshot('typing')).toMatchObject({ desired: true, confirmed: true, inFlight: false });
    controller.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a failed release without falsely confirming it', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ipc down')).mockResolvedValue(undefined);
    const controller = createSuppressionController({ send, retryDelayMs: 20, maxRetries: 2 });
    await controller.setDesired('editing', true);
    await controller.setDesired('editing', false);
    expect(controller.snapshot('editing')).toMatchObject({ desired: false, confirmed: true, inFlight: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(send).toHaveBeenCalledTimes(3); expect(controller.snapshot('editing')).toMatchObject({ desired: false, confirmed: false, inFlight: false });
    controller.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
});
