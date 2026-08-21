export const PRIORITY = { alarm: 500, focusComplete: 400, offwork: 300, break: 200, interaction: 100, ambient: 10 };

export class PresentationQueue {
  constructor() { this.pending = []; this.current = null; this.seen = new Set(); }
  enqueue(event) {
    if (event.durableId && this.seen.has(event.durableId)) return { accepted: false, interrupted: false };
    if (event.durableId) this.seen.add(event.durableId);
    const interrupted = Boolean(this.current && event.priority > this.current.priority);
    if (interrupted) this.pending.push(this.current);
    if (!this.current || interrupted) this.current = event; else this.pending.push(event);
    this.pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return { accepted: true, interrupted };
  }
  complete() { const done = this.current; this.current = this.pending.shift() || null; return done; }
  snapshot() { return { current: this.current ? { ...this.current } : null, pending: this.pending.map((e) => ({ ...e })), seen: [...this.seen] }; }
}

export class VoiceQueue {
  constructor({ onPlay = () => {}, onStop = () => {}, assetExists = () => true } = {}) {
    this.onPlay = onPlay; this.onStop = onStop; this.assetExists = assetExists; this.current = null; this.pending = [];
  }
  enqueue(clip) {
    if (!clip?.id || !this.assetExists(clip.id)) return { accepted: false, reason: 'missing-asset' };
    if (!this.current) { this.current = clip; this.onPlay(clip); return { accepted: true }; }
    if (clip.priority > this.current.priority) { this.onStop(this.current); this.current = clip; this.onPlay(clip); return { accepted: true, interrupted: true }; }
    this.pending.push(clip); this.pending.sort((a, b) => b.priority - a.priority); return { accepted: true, queued: true };
  }
  ended() { this.current = this.pending.shift() || null; if (this.current) this.onPlay(this.current); return this.current; }
  clear() { if (this.current) this.onStop(this.current); this.current = null; this.pending = []; }
}
