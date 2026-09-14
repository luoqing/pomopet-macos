import { describe, expect, it } from 'vitest';
import { resizePetBounds } from '../src/platform/electron/pet-window-bounds.mjs';

describe('pet window resize bounds', () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 };

  it('expands downward instead of clipping the pet when the window is near the top edge', () => {
    expect(resizePetBounds({ x: 900, y: 0, width: 300, height: 126 }, display, 280, 280)).toEqual({
      x: 900,
      y: 0,
      width: 300,
      height: 280
    });
  });

  it('keeps the bottom edge stable when there is room above the current window', () => {
    expect(resizePetBounds({ x: 900, y: 500, width: 300, height: 126 }, display, 280, 126)).toEqual({
      x: 900,
      y: 346,
      width: 300,
      height: 280
    });
  });

  it('keeps an expanded speech bubble inside the work area', () => {
    expect(resizePetBounds({ x: 900, y: 760, width: 300, height: 280 }, display, 420, 126)).toEqual({
      x: 900,
      y: 480,
      width: 300,
      height: 420
    });
  });
});
