import { voiceAssetBase } from './asset-paths.js';

export class BrowserVoicePlayer {
  constructor({ createAudio = (url) => new Audio(url), assetBase = voiceAssetBase(), speechSynthesis = globalThis.speechSynthesis, createUtterance = (text) => new globalThis.SpeechSynthesisUtterance(text) } = {}) {
    this.createAudio = createAudio; this.assetBase = assetBase; this.speechSynthesis = speechSynthesis; this.createUtterance = createUtterance; this.current = null; this.pending = [];
  }
  enqueue({ id, priority, volume = 1 }) {
    if (!id) return false; const clip = { kind: 'audio', id, priority, volume };
    return this.#enqueueClip(clip);
  }
  enqueueUrl({ url, priority, volume = 1 }) {
    if (!url) return false; const clip = { kind: 'audio', url, priority, volume };
    return this.#enqueueClip(clip);
  }
  interruptBelow(priority) {
    const threshold = Number(priority) || 0;
    const pendingCount = this.pending.length;
    this.pending = this.pending.filter((clip) => clip.priority >= threshold);
    const interrupted = Boolean(this.current && this.current.priority < threshold);
    if (interrupted) { this.#stopCurrent(); this.#next(); }
    return interrupted || this.pending.length !== pendingCount;
  }
  #enqueueClip(clip) {
    if (!this.current) return this.#playAudio(clip);
    if (clip.priority > this.current.priority) { this.#stopCurrent(); this.pending.unshift(clip); this.#next(); return true; }
    this.pending.push(clip); this.pending.sort((a, b) => b.priority - a.priority); return true;
  }
  speakText({ text, priority, volume = 1, rate = 1, pitch = 1, lang = 'zh-CN', voiceName = '' }) {
    if (!text || !this.speechSynthesis) return false;
    const clip = { kind: 'speech', text, priority, volume, rate, pitch, lang, voiceName };
    if (!this.current) return this.#speak(clip);
    if (priority > this.current.priority) { this.#stopCurrent(); this.pending.unshift(clip); this.#next(); return true; }
    this.pending.push(clip); this.pending.sort((a, b) => b.priority - a.priority); return true;
  }
  #playAudio(clip) {
    const audio = this.createAudio(clip.url || this.assetBase + clip.id + '.mp3'); clip.audio = audio; audio.volume = clip.volume;
    audio.onended = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    audio.onerror = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    this.current = clip; Promise.resolve(audio.play()).catch(() => { if (this.current === clip) { this.current = null; this.#next(); } }); return true;
  }
  #speak(clip) {
    let utterance;
    try {
      utterance = this.createUtterance(clip.text);
    } catch {
      return false;
    }
    utterance.lang = clip.lang;
    utterance.volume = Math.max(0, Math.min(1, clip.volume));
    utterance.rate = clip.rate;
    utterance.pitch = clip.pitch;
    if (clip.voiceName) utterance.voice = this.speechSynthesis.getVoices?.().find((voice) => voice.name === clip.voiceName) || null;
    utterance.onend = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    utterance.onerror = () => { if (this.current === clip) { this.current = null; this.#next(); } };
    clip.utterance = utterance;
    this.current = clip;
    this.speechSynthesis.speak(utterance);
    return true;
  }
  #stopCurrent() {
    if (this.current?.kind === 'audio') this.current.audio.pause();
    if (this.current?.kind === 'speech') this.speechSynthesis.cancel();
    this.current = null;
  }
  #next() {
    const clip = this.pending.shift();
    if (!clip) return;
    if (clip.kind === 'speech') this.#speak(clip);
    else this.#playAudio(clip);
  }
}
