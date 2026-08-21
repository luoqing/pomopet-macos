import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonStore } from '../src/platform/electron/store.mjs';

describe('JsonStore', () => {
  it('creates parent folders and atomically persists valid JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pomopet-store-'));
    const path = join(root, 'nested', 'state.json');
    const store = new JsonStore(path);
    await store.save({ timer: { status: 'running' }, text: '陪你工作' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ timer: { status: 'running' }, text: '陪你工作' });
    await expect(readFile(path + '.tmp', 'utf8')).rejects.toThrow();
  });

  it('merges saved top-level values and falls back after corrupt data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pomopet-store-'));
    const path = join(root, 'state.json'); const store = new JsonStore(path);
    await store.save({ voice: { volume: 0.4 } });
    expect(await store.load({ voice: { volume: 1 }, alarms: [] })).toEqual({ voice: { volume: 0.4 }, alarms: [] });
    await writeFile(path, '{broken');
    expect(await store.load({ safe: true })).toEqual({ safe: true });
  });
});
