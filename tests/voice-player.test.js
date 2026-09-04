import { describe, expect, it, vi } from 'vitest';
import { BrowserVoicePlayer } from '../src/ui/voice-player.js';

const fakeAudio = () => ({ play: vi.fn(() => Promise.resolve()), pause: vi.fn(), volume: 1, onended: null, onerror: null });
describe('BrowserVoicePlayer', () => {
  it('plays one clip at a time and advances after ending', () => {
    const created = []; const player = new BrowserVoicePlayer({ createAudio: () => { const audio = fakeAudio(); created.push(audio); return audio; } });
    player.enqueue({ id: 'break', priority: 2, volume: .4 }); player.enqueue({ id: 'idle', priority: 1 });
    expect(created).toHaveLength(1); expect(created[0].volume).toBe(.4); created[0].onended(); expect(created).toHaveLength(2);
  });
  it('interrupts a lower priority clip and does not overlap it', () => {
    const created = []; const player = new BrowserVoicePlayer({ createAudio: () => { const audio = fakeAudio(); created.push(audio); return audio; } });
    player.enqueue({ id: 'break', priority: 2 }); player.enqueue({ id: 'alarm', priority: 5 });
    expect(created[0].pause).toHaveBeenCalledOnce(); expect(created).toHaveLength(2); expect(player.current.id).toBe('alarm');
  });
  it('stops current and queued lower-priority clips before replacement synthesis finishes', () => {
    const created = []; const player = new BrowserVoicePlayer({ createAudio: () => { const audio = fakeAudio(); created.push(audio); return audio; } });
    player.enqueue({ id: 'ambient', priority: 10 }); player.enqueue({ id: 'interaction', priority: 100 });
    expect(player.interruptBelow(500)).toBe(true);
    expect(created[0].pause).toHaveBeenCalledOnce(); expect(player.current).toBeNull(); expect(player.pending).toEqual([]);
  });
  it('continues visually when audio playback rejects', async () => {
    const audio = fakeAudio(); audio.play.mockRejectedValue(new Error('no audio device'));
    const player = new BrowserVoicePlayer({ createAudio: () => audio }); expect(player.enqueue({ id: 'alarm', priority: 5 })).toBe(true);
    await Promise.resolve(); await Promise.resolve(); expect(player.current).toBe(null);
  });
  it('plays generated speech media urls', () => {
    const created = []; const player = new BrowserVoicePlayer({ createAudio: (url) => { const audio = fakeAudio(); audio.url = url; created.push(audio); return audio; } });
    expect(player.enqueueUrl({ url: 'file:///tmp/pomopet-voice.mp3', priority: 5, volume: .8 })).toBe(true);
    expect(created[0]).toMatchObject({ url: 'file:///tmp/pomopet-voice.mp3', volume: .8 });
  });
  it('speaks generated reminder text and returns to queued audio', () => {
    const spoken = []; const created = [];
    const voice = { name: 'Tingting' };
    const speechSynthesis = { speak: vi.fn((utterance) => spoken.push(utterance)), cancel: vi.fn(), getVoices: vi.fn(() => [voice]) };
    const player = new BrowserVoicePlayer({
      createAudio: () => { const audio = fakeAudio(); created.push(audio); return audio; },
      speechSynthesis,
      createUtterance: (text) => ({ text })
    });
    expect(player.speakText({ text: '喝水啦', priority: 5, volume: .6, rate: 1.1, pitch: 1.2, voiceName: 'Tingting' })).toBe(true);
    player.enqueue({ id: 'alarm', priority: 2 });
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect(spoken[0]).toMatchObject({ text: '喝水啦', lang: 'zh-CN', volume: .6, rate: 1.1, pitch: 1.2, voice });
    spoken[0].onend();
    expect(created).toHaveLength(1);
  });
});
