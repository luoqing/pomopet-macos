import { access, readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COPY } from '../src/core/copy.js';

describe('bundled companion assets', () => {
  it('contains every voice file referenced by built-in copy', async () => {
    const ids = new Set(Object.values(COPY).flat().map((line) => line.voice).filter(Boolean));
    expect([...ids].sort()).toEqual(['alarm', 'break', 'focus-complete', 'offwork']);
    for (const id of ids) { const file = 'src/ui/public/audio/' + id + '.mp3'; await access(file); expect((await stat(file)).size).toBeGreaterThan(1_000); }
  });
  it('contains every illustrated pet pose and the application icon', async () => {
    const poses = ['focus', 'reward', 'ball', 'sleepy', 'fainted', 'annoyed', 'pet', 'feed', 'water'];
    const animations = [...poses, 'comfort', 'water'];
    const files = [
      ...poses.map((pose) => `src/ui/public/assets/pet/momo-${pose}.png`),
      ...animations.map((pose) => `src/ui/public/assets/pet/momo-${pose}.gif`),
      'build/icon.png'
    ];
    for (const file of files) { await access(file); expect((await stat(file)).size).toBeGreaterThan(10_000); }
  });
  it('uses a CommonJS preload so the packaged desktop controls reach Electron IPC', async () => {
    const main = await readFile('src/platform/electron/main.mjs', 'utf8');
    const preload = await readFile('src/platform/electron/preload.cjs', 'utf8');
    expect(main).toContain("preload.cjs");
    expect(preload).toContain("contextBridge.exposeInMainWorld('pomopet'");
  });
});
