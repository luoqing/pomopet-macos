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
  it('continues visually when audio playback rejects', async () => {
    const audio = fakeAudio(); audio.play.mockRejectedValue(new Error('no audio device'));
    const player = new BrowserVoicePlayer({ createAudio: () => audio }); expect(player.enqueue({ id: 'alarm', priority: 5 })).toBe(true);
    await Promise.resolve(); await Promise.resolve(); expect(player.current).toBe(null);
  });
});
