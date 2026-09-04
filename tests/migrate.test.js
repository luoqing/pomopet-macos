import { describe, expect, it } from 'vitest';
import { migrateTo016 } from '../src/core/migrate.js';

const monday = new Date(2026, 7, 24, 10, 0).getTime();

describe('migrateTo016', () => {
  it('adds deterministic Todo defaults and stable createdAt values in source order', () => {
    const migrated = migrateTo016({ todos: { items: [{ id: 'first', day: '2026-08-24', title: '一' }, { id: 'second', day: '2026-08-24', title: '二' }] } }, monday);
    expect(migrated.todos.items).toEqual([
      expect.objectContaining({ id: 'first', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false, createdAt: monday }),
      expect.objectContaining({ id: 'second', priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false, createdAt: monday + 1 })
    ]);
    expect(migrateTo016(migrated, monday + 99_000).todos.items.map((item) => item.createdAt)).toEqual([monday, monday + 1]);
  });

  it('repairs an invalid active Todo ID with the first unfinished Todo for today', () => {
    const data = { todos: { activeId: 'missing', items: [
      { id: 'done', day: '2026-08-24', title: '完成', done: true },
      { id: 'active', day: '2026-08-24', title: '继续', done: false },
      { id: 'other-day', day: '2026-08-23', title: '昨天', done: false }
    ] } };
    expect(migrateTo016(data, monday).todos.activeId).toBe('active');
  });

  it('maps aiTone to a persona and fills persona defaults', () => {
    const migrated = migrateTo016({ settings: { aiTone: 'sarcastic' } }, monday);
    expect(migrated.persona).toEqual({ preset: 'witty', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' });
    expect(migrateTo016({ settings: { aiTone: 'unknown' } }, monday).persona.preset).toBe('gentle');
  });

  it('adds alarm enabled, pose and snooze defaults without creating templates', () => {
    const migrated = migrateTo016({ alarms: [{ id: 'weekly', label: '站会', type: 'weekly', time: '09:00', weekdays: [1] }] }, monday);
    expect(migrated.alarms).toEqual([expect.objectContaining({ id: 'weekly', enabled: true, pose: 'annoyed', snoozes: [] })]);
    expect(migrated.alarms[0]).not.toHaveProperty('activeFrom');
    expect(migrateTo016({}, monday).alarms).toEqual([]);
  });

  it('preserves the occurrence ledger', () => {
    const ledger = { 'weekly:123': 456, 'once:789': 999 };
    expect(migrateTo016({ ledger }, monday).ledger).toEqual(ledger);
  });

  it('keeps a recoverable expired once alarm enabled and closes one beyond grace', () => {
    const migrated = migrateTo016({ alarms: [
      { id: 'recover', type: 'once', at: monday - 15 * 60_000 },
      { id: 'expired', type: 'once', at: monday - 15 * 60_000 - 1 }
    ] }, monday);
    expect(migrated.alarms.map((alarm) => alarm.enabled)).toEqual([true, false]);
  });

  it('is idempotent when already migrated data is migrated twice', () => {
    const source = { settings: { aiTone: 'cute' }, todos: { activeId: null, items: [{ id: 'one', day: '2026-08-24', title: '任务' }] },
      alarms: [{ id: 'weekly', label: '站会', type: 'weekly', time: '09:00', weekdays: [1] }], ledger: { 'weekly:1': 2 } };
    const once = migrateTo016(source, monday);
    expect(migrateTo016(once, monday + 60_000)).toEqual(once);
  });
});
