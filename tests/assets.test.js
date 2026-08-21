import { access, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COPY } from '../src/core/copy.js';

describe('bundled companion assets', () => {
  it('contains every voice file referenced by built-in copy', async () => {
    const ids = new Set(Object.values(COPY).flat().map((line) => line.voice).filter(Boolean));
    expect([...ids].sort()).toEqual(['alarm', 'break', 'focus-complete', 'offwork']);
    for (const id of ids) { const file = 'src/ui/public/audio/' + id + '.mp3'; await access(file); expect((await stat(file)).size).toBeGreaterThan(1_000); }
  });
  it('contains independent illustrated pet and toy assets', async () => {
    for (const file of ['src/ui/public/assets/momo.svg', 'src/ui/public/assets/ball.svg']) { await access(file); expect((await stat(file)).size).toBeGreaterThan(200); }
  });
});
