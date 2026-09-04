export const PRIORITY = { offworkBlocker: 600, alarm: 500, focusComplete: 400, break: 300, offwork: 200, interaction: 100, ambient: 10 };

export class PresentationQueue {
  constructor({ now = Date.now } = {}) { this.pending = []; this.current = null; this.seen = new Set(); this.now = now; this.sequence = 0; this.order = new WeakMap(); }
  enqueue(event) {
    if (event.durableId && this.seen.has(event.durableId)) return { accepted: false, interrupted: false };
    this.#pruneExpired();
    if (isEphemeral(event) && this.current && this.current.priority >= event.priority) {
      return { accepted: false, interrupted: false, reason: isAmbient(event) ? 'ambient-blocked' : 'ephemeral-blocked' };
    }
    if (event.durableId) this.seen.add(event.durableId);
    this.order.set(event, this.sequence++);
    const interrupted = Boolean(this.current && event.priority > this.current.priority);
    if (interrupted && !isEphemeral(this.current)) this.pending.push(this.current);
    if (!isEphemeral(event)) this.pending = this.pending.filter((pending) => !isEphemeral(pending));
    if (!this.current || interrupted) this.current = event; else this.pending.push(event);
    this.#sortPending();
    return { accepted: true, interrupted };
  }
  complete() { const done = this.current; this.current = null; this.#pruneExpired(); this.current = this.pending.shift() || null; return done; }
  snapshot() { this.#pruneExpired(); return { current: this.current ? { ...this.current } : null, pending: this.pending.map((e) => ({ ...e })), seen: [...this.seen] }; }
  #pruneExpired() { this.pending = this.pending.filter((event) => !isExpired(event, this.now())); }
  #sortPending() {
    this.pending.sort((a, b) => b.priority - a.priority
      || triggerTime(a) - triggerTime(b)
      || this.order.get(a) - this.order.get(b));
  }
}

const isAmbient = (event) => event?.category === 'ambientCompanion';
const isEphemeral = (event) => isAmbient(event) || event?.category === 'focusStart' || String(event?.category || '').startsWith('interaction');
const isExpired = (event, now) => Number.isFinite(event?.expiresAt) && event.expiresAt <= now;
const triggerTime = (event) => Number(event?.occurredAt ?? event?.createdAt ?? 0);

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
