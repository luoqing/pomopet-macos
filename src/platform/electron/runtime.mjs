import { AlarmScheduler, OccurrenceLedger } from '../../core/alarms.js';
import { CopyPicker } from '../../core/copy.js';
import { OffworkScheduler, defaultOffwork } from '../../core/offwork.js';
import { PresentationQueue, PRIORITY } from '../../core/presentation.js';
import { SystemClock, localDayKey } from '../../core/time.js';
import { TimerEngine, createTimerState } from '../../core/timer.js';

const defaults = {
  timer: createTimerState(), alarms: [], ledger: {}, copyLast: {}, offwork: defaultOffwork(),
  settings: { preset: '25/5', customFocus: 25, customBreak: 5, voiceMode: 'key', volume: 0.75, interactions: true, launchAtLogin: false },
  pet: { visible: true, position: null }
};

export class AppRuntime {
  constructor({ store, onState = () => {}, onPresentation = () => {}, onNotify = () => {}, clock = new SystemClock() }) {
    this.store = store; this.onState = onState; this.onPresentation = onPresentation; this.onNotify = onNotify; this.clock = clock;
    this.presentations = new PresentationQueue(); this.active = null; this.activeTimeout = null; this.dirty = false;
  }
  async init() {
    this.data = await this.store.load(defaults);
    this.timer = new TimerEngine(this.clock, this.data.timer);
    this.alarms = new AlarmScheduler(this.clock, this.data.alarms, new OccurrenceLedger(this.data.ledger));
    this.copy = new CopyPicker(this.data.copyLast); this.offwork = new OffworkScheduler(this.clock, this.data.offwork);
    await this.#handle(this.timer.tick({ recovery: true })); await this.persist(); this.emit();
  }
  view() {
    const timer = this.timer.snapshot();
    return { timer: { ...timer, remainingMs: this.timer.remaining(), todayCount: timer.completedByDay[localDayKey(this.clock.now())] || 0 },
      alarms: this.alarms.snapshot().alarms, offwork: this.offwork.snapshot(), settings: this.data.settings, pet: this.data.pet, now: this.clock.now() };
  }
  emit() { this.onState(this.view()); }
  async tick() {
    await this.#handle([...this.timer.tick(), ...this.alarms.due(), ...this.offwork.tick()]); this.emit();
    if (this.dirty) await this.persist();
  }
  async command(name, payload = {}) {
    let events = [];
    if (name === 'timer:start') events = this.timer.start(payload);
    if (name === 'timer:pause') events = this.timer.pause();
    if (name === 'timer:resume') events = this.timer.resume();
    if (name === 'timer:stop') events = this.timer.stop();
    if (name === 'timer:complete') events = this.timer.complete();
    if (name === 'timer:skipBreak') events = this.timer.skipBreak();
    if (name === 'alarm:add') this.alarms.add(payload);
    if (name === 'alarm:update') this.alarms.update(payload.id, payload.patch);
    if (name === 'alarm:remove') this.alarms.remove(payload.id);
    if (name === 'alarm:enabled') this.alarms.setEnabled(payload.id, payload.enabled);
    if (name === 'alarm:snooze') this.alarms.snooze(payload.alarmId, payload.occurrenceId, payload.minutes || 10);
    if (name === 'alarm:dismiss') this.alarms.dismiss(payload.alarmId, payload.occurrenceId);
    if (name === 'offwork:update') this.offwork.state = { ...this.offwork.state, ...payload };
    if (name === 'offwork:snooze') this.offwork.snooze();
    if (name === 'offwork:dismiss') this.offwork.dismissToday();
    if (name === 'settings:update') this.data.settings = { ...this.data.settings, ...payload };
    if (name === 'pet:position') this.data.pet.position = payload;
    if (name === 'pet:visible') this.data.pet.visible = payload.visible;
    if (name === 'interaction' && this.data.settings.interactions) this.#present({ category: payload.kind, kind: payload.kind, priority: PRIORITY.interaction, durableId: null, duration: 12_000 });
    await this.#handle(events); await this.persist(); this.emit(); return this.view();
  }
  async persist() {
    this.data.timer = this.timer.snapshot(); const alarms = this.alarms.snapshot(); this.data.alarms = alarms.alarms; this.data.ledger = alarms.ledger;
    this.data.copyLast = this.copy.snapshot(); this.data.offwork = this.offwork.snapshot(); await this.store.save(this.data); this.dirty = false;
  }
  async #handle(events) {
    for (const event of events) {
      if (event.type === 'focus-started') this.#present({ category: 'focusStart', kind: 'focus', priority: PRIORITY.ambient, durableId: null, duration: 6_000 });
      if (event.type === 'focus-completed' && event.celebrate) this.#present({ category: 'focusComplete', kind: 'reward', priority: PRIORITY.focusComplete, durableId: event.sessionId, duration: 10_000 });
      if (event.type === 'break-started') this.#present({ category: 'break', kind: 'break', priority: PRIORITY.break, durableId: 'break:' + this.timer.state.sessionId, duration: 12_000 });
      if (event.type === 'alarm-fired') {
        this.#present({ category: 'alarm', kind: event.pose || 'alarm', priority: PRIORITY.alarm, durableId: event.occurrenceId, duration: 20_000, actions: { alarmId: event.alarmId, occurrenceId: event.occurrenceId }, label: event.label });
        this.onNotify({ title: 'Pomopet 闹钟 · ' + event.label, body: '到点啦！这是过去的你寄来的加急小纸条。' });
      }
      if (event.type === 'offwork') {
        const kind = event.level === 1 ? (this.offwork.state.pose === 'fainted' ? 'fainted' : 'offwork') : 'annoyed';
        this.#present({ category: event.level === 1 ? 'offwork' : 'ignored', kind, priority: PRIORITY.offwork, durableId: 'offwork:' + event.day + ':' + event.level, duration: 20_000, actions: { offwork: true } });
      }
    }
    if (events.length) this.dirty = true;
  }
  #present(input) {
    const line = this.copy.pick(input.category); const presentation = { ...input, ...line, createdAt: this.clock.now() };
    const result = this.presentations.enqueue(presentation); if (!result.accepted) return;
    if (!this.active || result.interrupted) this.#showCurrent();
  }
  #showCurrent() {
    clearTimeout(this.activeTimeout); this.active = this.presentations.current; if (!this.active) return;
    this.onPresentation(this.active); this.activeTimeout = setTimeout(() => { this.presentations.complete(); this.active = null; this.#showCurrent(); }, this.active.duration);
  }
}
