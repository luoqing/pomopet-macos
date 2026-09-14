import { describe, expect, it } from 'vitest';
import { clampToArea, normalizeWindowBounds, virtualWorkArea } from '../src/platform/electron/window-bounds.mjs';

describe('desktop window bounds helpers', () => {
  it('builds a virtual work area across right, left, and vertical displays', () => {
    const area = virtualWorkArea([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      { workArea: { x: 1920, y: 0, width: 1440, height: 900 } },
      { workArea: { x: -1280, y: 120, width: 1280, height: 800 } },
      { workArea: { x: 0, y: -900, width: 1600, height: 900 } }
    ]);

    expect(area).toEqual({ x: -1280, y: -900, width: 4640, height: 1980 });
  });

  it('allows dragging a pet window across the display boundary', () => {
    const virtual = virtualWorkArea([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      { workArea: { x: 1920, y: 0, width: 1440, height: 900 } }
    ]);

    const dragged = normalizeWindowBounds({ x: 1660, y: 700, width: 300, height: 280 }, { x: 0, y: 0, width: 300, height: 280 });
    expect(clampToArea(dragged, { x: 0, y: 0, width: 1920, height: 1080 }).x).toBe(1620);
    expect(clampToArea(dragged, virtual).x).toBe(1660);
  });

  it('still keeps dragged windows inside the union of all visible work areas', () => {
    const virtual = virtualWorkArea([
      { workArea: { x: -1280, y: 0, width: 1280, height: 800 } },
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
    ]);

    expect(clampToArea({ x: -1500, y: 900, width: 300, height: 280 }, virtual)).toEqual({ x: -1280, y: 800 });
    expect(clampToArea({ x: 1900, y: -200, width: 300, height: 280 }, virtual)).toEqual({ x: 1620, y: 0 });
  });
});

