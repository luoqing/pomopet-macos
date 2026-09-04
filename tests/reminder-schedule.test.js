import { describe, expect, it } from 'vitest';
import { nextReminderOccurrence } from '../src/ui/reminder-schedule.js';

describe('next reminder occurrence', () => {
  it('returns a future once occurrence and treats elapsed once reminders as expired', () => {
    const now = new Date(2026, 7, 31, 10, 0).getTime();
    expect(nextReminderOccurrence({ type: 'once', at: now + 60_000, enabled: true }, now)).toBe(now + 60_000);
    expect(nextReminderOccurrence({ type: 'once', at: now, enabled: true }, now)).toBeNull();
  });

  it('moves weekly reminders after today time to the next matching weekday', () => {
    const mondayAfterTime = new Date(2026, 7, 31, 10, 10).getTime();
    const next = nextReminderOccurrence({ type: 'weekly', weekdays: [1], time: '09:00', enabled: true }, mondayAfterTime);
    expect(next).toBe(new Date(2026, 8, 7, 9, 0).getTime());
  });

  it('uses the interval anchor after start and advances past the window to the next selected day', () => {
    const monday = new Date(2026, 7, 31, 10, 10).getTime();
    const alarm = { type: 'interval', weekdays: [1, 2], startTime: '09:30', endTime: '18:30', intervalMinutes: 60, enabled: true };
    expect(nextReminderOccurrence(alarm, monday)).toBe(new Date(2026, 7, 31, 10, 30).getTime());
    expect(nextReminderOccurrence(alarm, new Date(2026, 7, 31, 19, 0).getTime())).toBe(new Date(2026, 8, 1, 9, 30).getTime());
  });
});
