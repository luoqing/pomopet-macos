import { voiceAssetBase } from './asset-paths.js';

export class BrowserVoicePlayer {
  constructor({ createAudio = (url) => new Audio(url), assetBase = voiceAssetBase() } = {}) {
    this.createAudio = createAudio; this.assetBase = assetBase; this.current = null; this.pending = [];
  }
  enqueue({ id, priority, volume = 1 }) {
    if (!id) return false; const clip = { id, priority, volume };
    if (!this.current) return this.#play(clip);
    if (priority > this.current.priority) { this.current.audio.pause(); this.current = null; this.pending.unshift(clip); this.#next(); return true; }
    this.pending.push(clip); this.pending.sort((a, b) => b.priority - a.priority); return true;
  }
  #play(clip) {
    const audio = this.createAudio(this.assetBase + clip.id + '.mp3'); clip.audio = audio; audio.volume = clip.volume;
    audio.onended = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    audio.onerror = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    this.current = clip; Promise.resolve(audio.play()).catch(() => { if (this.current === clip) { this.current = null; this.#next(); } }); return true;
  }
  #next() { const clip = this.pending.shift(); if (clip) this.#play(clip); }
}
