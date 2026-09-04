import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaultVoices = {
  cute: 'zh-CN-XiaoxiaoNeural',
  comfort: 'zh-CN-XiaoxiaoNeural',
  sarcastic: 'zh-CN-liaoning-XiaobeiNeural',
  sleepy: 'zh-CN-XiaoxiaoNeural'
};
const styleArgs = {
  cute: { rate: '+8%', pitch: '+20Hz' },
  comfort: { rate: '-8%', pitch: '-10Hz' },
  sarcastic: { rate: '+4%', pitch: '-5Hz' },
  sleepy: { rate: '-18%', pitch: '-25Hz' }
};

export class EdgeTtsSynthesizer {
  constructor({ cacheDir, command = process.env.POMOPET_EDGE_TTS_BIN || 'uvx', execFileImpl = execFileAsync, timeoutMs = 20_000 } = {}) {
    this.cacheDir = cacheDir;
    this.command = command;
    this.execFileImpl = execFileImpl;
    this.timeoutMs = timeoutMs;
  }

  async synthesize({ text, voice = '', style = 'cute' } = {}) {
    const content = String(text || '').trim();
    if (!content || !this.cacheDir) return null;
    await mkdir(this.cacheDir, { recursive: true });
    const selectedVoice = voice || defaultVoices[style] || defaultVoices.cute;
    const tuning = styleArgs[style] || styleArgs.cute;
    const key = createHash('sha256').update(JSON.stringify({ content, selectedVoice, tuning })).digest('hex').slice(0, 24);
    const mediaPath = join(this.cacheDir, `${key}.mp3`);
    if (await exists(mediaPath)) return { url: pathToFileURL(mediaPath).href, voice: selectedVoice, cached: true };

    await this.execFileImpl(this.command, [
      'edge-tts',
      '--text', content,
      '--write-media', mediaPath,
      '--voice', selectedVoice,
      `--rate=${tuning.rate}`,
      `--pitch=${tuning.pitch}`
    ], {
      timeout: this.timeoutMs,
      env: { ...process.env, UV_CACHE_DIR: join(this.cacheDir, '.uv-cache') }
    });
    return { url: pathToFileURL(mediaPath).href, voice: selectedVoice, cached: false };
  }
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}
