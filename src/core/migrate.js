import { localDayKey } from './time.js';

const GRACE_MS = 15 * 60_000;
const personaDefaults = { preset: 'gentle', petName: '末末', ownerName: '主人', customPrompt: '', teaseLevel: 35, chatFrequency: 'occasional' };
const tonePresets = { comfort: 'gentle', sarcastic: 'witty', angry: 'witty', cute: 'clever', happy: 'sunny' };

export const migrateTo016 = (data = {}, now = Date.now()) => {
  const migrated = structuredClone(data || {});
  const items = (migrated.todos?.items || []).map((item, index) => ({
    priority: 'P1', estimatePomos: 1, completedPomos: 0, spentMs: 0, done: false, createdAt: now + index, completedAt: null,
    ...item
  }));
  let activeId = migrated.todos?.activeId ?? null;
  if (!items.some((item) => item.id === activeId)) activeId = items.find((item) => item.day === localDayKey(now) && !item.done)?.id || null;
  migrated.todos = { ...(migrated.todos || {}), items, activeId };

  const preset = tonePresets[migrated.settings?.aiTone] || 'gentle';
  migrated.persona = { ...personaDefaults, preset, ...(migrated.persona || {}) };
  migrated.alarms = (migrated.alarms || []).map((alarm) => {
    const normalized = { enabled: true, pose: 'annoyed', at: null, time: null, weekdays: [], startTime: null, endTime: null, intervalMinutes: null, snoozes: [], ...alarm };
    if (normalized.type === 'once' && normalized.enabled && normalized.at < now - GRACE_MS) normalized.enabled = false;
    return normalized;
  });
  migrated.ledger = structuredClone(migrated.ledger || {});
  return migrated;
};
