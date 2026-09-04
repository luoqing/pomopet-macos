import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

describe('desktop pet recall', () => {
  it('repairs the pet window position and brings it to the front before showing it', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain('function recallPet({ recreate = false } = {})');
    expect(main).toContain('win.setBounds(recalledBounds, false)');
    expect(main).toContain('win.show()');
    expect(main).toContain('win.moveTop()');
    expect(main).toMatch(/if \(name === 'pet:visible'\)[\s\S]*payload\.visible \? recallPet\(\{ recreate: true \}\) : petWindow\?\.hide\(\)/);
  });

  it('does not let an unavailable tray break desktop pet recall', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toMatch(/function refreshTray\(\) \{\s*if \(!tray \|\| tray\.isDestroyed\(\)\) return false;/);
    expect(main).toMatch(/function createTray\(\) \{[\s\S]*catch \(error\)[\s\S]*tray = undefined;[\s\S]*return false;/);
  });

  it('recreates a missing pet window and recalls it into full-screen Spaces', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain('function ensurePetWindow()');
    expect(main).toMatch(/function recallPet\(\{ recreate = false \} = \{\}\) \{[\s\S]*const win = ensurePetWindow\(\);/);
    expect(main).toContain("visibleOnFullScreen: true");
    expect(main).toContain('win.setOpacity(1)');
    expect(main).toContain('win.show()');
    expect(main).toMatch(/petWindow\.on\('closed',[\s\S]*petWindow = undefined/);
    expect(main).toMatch(/petWindow\.webContents\.on\('render-process-gone',[\s\S]*petWindow = undefined/);
  });

  it('force-recreates the pet at an obvious position when the user recalls it', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain('function recallPet({ recreate = false } = {})');
    expect(main).toMatch(/if \(recreate && petWindow && !petWindow\.isDestroyed\(\)\)[\s\S]*petWindow\.destroy\(\)/);
    expect(main).toContain('x: Math.round(display.x + display.width - PET_WIDTH - 24)');
    expect(main).toContain('y: Math.round(display.y + display.height - height - 24)');
  });

  it('normalizes a saved x/y-only position before asking Electron for its display', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain('const normalized = { x, y, width, height };');
    expect(main).toContain('screen.getDisplayMatching(normalized).workArea');
  });

  it('temporarily wakes formal presentations without overwriting the saved display mode', async () => {
    const main = await readFile(new URL('../src/platform/electron/main.mjs', import.meta.url), 'utf8');
    expect(main).toContain("new Set(['focusComplete', 'breakComplete', 'alarm', 'offwork', 'ignored'])");
    expect(main).toMatch(/if \(wake\) showTemporaryPet\(\)/);
    expect(main).toMatch(/else if \(payload\.restoreDisplay\) applyPetDisplayMode\(\)/);
    expect(main).not.toContain('runtime.data.pet.visible = true');
  });
});
