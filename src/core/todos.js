import { localDayKey } from './time.js';

const newId = (now) => `todo-${now}-${Math.random().toString(36).slice(2, 8)}`;
const priorities = new Set(['P0', 'P1', 'P2']);
const priorityOrder = { P0: 0, P1: 1, P2: 2 };

export const createTodoState = () => ({ items: [], activeId: null, appliedEventIds: {} });

export class TodoLedger {
  constructor(clock, state = createTodoState()) {
    this.clock = clock;
    this.state = { ...createTodoState(), ...structuredClone(state), items: structuredClone(state.items || []), appliedEventIds: structuredClone(state.appliedEventIds || {}) };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  todayItems() {
    const today = localDayKey(this.clock.now());
    return this.state.items.filter((item) => item.day === today);
  }

  activeItem() {
    return this.state.items.find((item) => item.id === this.state.activeId) || null;
  }

  unfinishedItem(id) {
    return this.state.items.find((item) => item.id === id && !item.done) || null;
  }

  orderedUnfinished({ preferredId = null } = {}) {
    return this.todayItems()
      .filter((item) => !item.done)
      .sort((left, right) => {
        if (left.id === preferredId) return -1;
        if (right.id === preferredId) return 1;
        return (priorityOrder[left.priority] ?? priorityOrder.P1) - (priorityOrder[right.priority] ?? priorityOrder.P1)
          || left.createdAt - right.createdAt
          || left.id.localeCompare(right.id);
      });
  }

  recommend(options = {}) {
    return this.orderedUnfinished(options)[0] || null;
  }

  add({ title = '', priority = 'P1', estimatePomos = 1 } = {}) {
    const cleanTitle = String(title).trim();
    if (!cleanTitle) throw new Error('todo_title_required');
    const now = this.clock.now();
    const item = {
      id: newId(now),
      day: localDayKey(now),
      title: cleanTitle,
      priority: priorities.has(priority) ? priority : 'P1',
      estimatePomos: Math.min(12, Math.max(1, Number(estimatePomos) || 1)),
      completedPomos: 0,
      spentMs: 0,
      done: false,
      createdAt: now,
      completedAt: null
    };
    this.state.items.unshift(item);
    this.state.activeId = item.id;
    return item;
  }

  update(id, patch = {}) {
    const item = this.state.items.find((todo) => todo.id === id);
    if (!item) return null;
    if (Object.hasOwn(patch, 'title')) {
      const title = String(patch.title || '').trim();
      if (title) item.title = title;
    }
    if (Object.hasOwn(patch, 'priority') && priorities.has(patch.priority)) item.priority = patch.priority;
    if (Object.hasOwn(patch, 'estimatePomos')) item.estimatePomos = Math.min(12, Math.max(1, Number(patch.estimatePomos) || item.estimatePomos));
    return item;
  }

  remove(id) {
    this.state.items = this.state.items.filter((item) => item.id !== id);
    if (this.state.activeId === id) this.state.activeId = this.todayItems()[0]?.id || null;
  }

  activate(id) {
    if (this.state.items.some((item) => item.id === id)) this.state.activeId = id;
  }

  toggle(id, done = null) {
    const item = this.state.items.find((todo) => todo.id === id);
    if (!item) return null;
    item.done = done === null ? !item.done : Boolean(done);
    item.completedAt = item.done ? this.clock.now() : null;
    return item;
  }

  recordPomodoro(id, spentMs) {
    return this.recordFocus(id, spentMs, { completed: true });
  }

  recordFocus(id, spentMs, { completed = false, eventId = null } = {}) {
    if (eventId && this.state.appliedEventIds[eventId]) return this.state.items.find((todo) => todo.id === id) || null;
    const item = this.state.items.find((todo) => todo.id === id);
    if (!item) return null;
    if (completed) item.completedPomos += 1;
    item.spentMs += Math.max(0, Number(spentMs) || 0);
    if (eventId) this.state.appliedEventIds[eventId] = this.clock.now();
    return item;
  }
}
