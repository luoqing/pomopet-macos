import { describe, expect, it, vi } from 'vitest';
import { createPresentationRouter, sendPresentationWhenReady, showPresentationNotification } from '../src/platform/electron/presentation-routing.mjs';

describe('presentation routing', () => {
  it('waits for a loading pet renderer before delivering its presentation', () => {
    const send = vi.fn(); let ready;
    const win = {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => true,
        once: vi.fn((name, listener) => { if (name === 'did-finish-load') ready = listener; }),
        send
      }
    };

    expect(sendPresentationWhenReady(win, { category: 'offwork' })).toBe(true);
    expect(send).not.toHaveBeenCalled();
    ready();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('presentation', { category: 'offwork' });
  });

  it('sends ordinary events only to the pet and sends one explicit blocker event', () => {
    const sendPet = vi.fn(); const showBlocker = vi.fn();
    const router = createPresentationRouter({ sendPet, showBlocker, shouldShowBlocker: () => true });
    const offwork = { category: 'offwork', actions: { offwork: true }, text: '收工' };
    router.route(offwork); router.route({ category: 'alarm', text: '喝水' }); router.route({ category: 'ambientCompanion', text: '陪伴' });
    expect(showBlocker).toHaveBeenCalledOnce(); expect(showBlocker).toHaveBeenCalledWith(offwork);
    expect(sendPet.mock.calls.map(([event]) => event.category)).toEqual(['offwork', 'alarm', 'ambientCompanion']);
  });

  it('uses the final presentation copy in notifications and only opens the control on click', () => {
    const openControl = vi.fn(); const show = vi.fn(); let click;
    const notification = { show, on: vi.fn((name, listener) => { if (name === 'click') click = listener; }) };
    const event = { category: 'alarm', label: '喝水', text: 'AI 最终文案', actions: { alarmId: 'water', occurrenceId: 'water:1' } };

    expect(showPresentationNotification(event, {
      isSupported: () => true,
      createNotification: (options) => { expect(options).toEqual({ title: 'Pomopet · 喝水', body: event.text, silent: false }); return notification; },
      openControl
    })).toBe(true);
    expect(show).toHaveBeenCalledOnce();
    click();
    expect(openControl).toHaveBeenCalledOnce();
  });

  it('keeps the notification copy visible but silences its sound while muted', () => {
    const createNotification = vi.fn(() => ({ on: vi.fn(), show: vi.fn() }));
    const event = { category: 'alarm', label: '喝水', text: '主人，喝口水再继续。' };
    expect(showPresentationNotification(event, {
      isSupported: () => true, createNotification, openControl: vi.fn(), muted: true
    })).toBe(true);
    expect(createNotification).toHaveBeenCalledWith({ title: 'Pomopet · 喝水', body: event.text, silent: true });
  });

  it('does not notify for silent companion chatter', () => {
    const createNotification = vi.fn();
    expect(showPresentationNotification({ category: 'ambientCompanion', text: '安静陪你' }, {
      isSupported: () => true, createNotification, openControl: vi.fn()
    })).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
