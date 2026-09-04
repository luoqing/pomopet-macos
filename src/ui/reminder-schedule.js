import { nextIntervalOccurrence, nextRepeatingOccurrence } from '../core/alarms.js';

export function nextReminderOccurrence(alarm, after = Date.now()) {
  if (!alarm?.enabled) return null;
  if (alarm.type === 'once') return Number(alarm.at) > after ? Number(alarm.at) : null;
  try {
    if (alarm.type === 'weekly') return nextRepeatingOccurrence(alarm, after);
    if (alarm.type === 'interval') return nextIntervalOccurrence(alarm, after);
  } catch {
    return null;
  }
  return null;
}

export function formatNextReminderText(alarm, after = Date.now()) {
  if (!alarm?.enabled) return '已暂停';
  const nextAt = nextReminderOccurrence(alarm, after);
  if (nextAt == null) return alarm.type === 'once' ? '已过期' : '暂无下次';
  const next = new Date(nextAt).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `下次 ${next}`;
}
