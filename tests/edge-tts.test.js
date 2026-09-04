import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { EdgeTtsSynthesizer } from '../src/platform/electron/edge-tts.mjs';

describe('EdgeTtsSynthesizer', () => {
  it('generates cached mp3 files through uvx edge-tts', async () => {
    const cacheDir = join(tmpdir(), `pomopet-edge-tts-${Date.now()}`);
    await mkdir(cacheDir, { recursive: true });
    const execFileImpl = vi.fn(async (_command, args) => {
      const mediaPath = args[args.indexOf('--write-media') + 1];
      await mkdir(cacheDir, { recursive: true });
      await writeFile(mediaPath, 'mp3');
    });
    const tts = new EdgeTtsSynthesizer({ cacheDir, command: 'uvx', execFileImpl });
    const result = await tts.synthesize({ text: '喝水啦', style: 'cute' });
    const cached = await tts.synthesize({ text: '喝水啦', style: 'cute' });

    expect(result).toMatchObject({ voice: 'zh-CN-XiaoxiaoNeural', cached: false });
    expect(result.url).toMatch(/^file:\/\//);
    expect(cached).toMatchObject({ cached: true, url: result.url });
    expect(execFileImpl).toHaveBeenCalledTimes(1);
    expect(execFileImpl.mock.calls[0][1]).toEqual(expect.arrayContaining(['edge-tts', '--text', '喝水啦', '--voice', 'zh-CN-XiaoxiaoNeural', '--rate=+8%', '--pitch=+20Hz']));
  });
});
