import { describe, expect, it } from 'vitest';
import { companionAnimationSrc, companionPoseSrc, voiceAssetBase } from '../src/ui/asset-paths.js';

describe('asset path helpers', () => {
  it('resolves companion poses beside the current page for packaged file URLs', () => {
    const href = 'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/index.html';

    expect(companionPoseSrc('pet', href)).toBe(
      'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/assets/pet/momo-pet.png'
    );
  });

  it('resolves voice clips beside the current page for packaged file URLs', () => {
    const href = 'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/pet.html';

    expect(voiceAssetBase(href)).toBe(
      'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/audio/'
    );
  });

  it('resolves animated companion GIFs beside the current page for packaged file URLs', () => {
    const href = 'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/pet.html';

    expect(companionAnimationSrc('comfort', href)).toBe(
      'file:///Applications/Pomopet.app/Contents/Resources/app.asar/dist/app/assets/pet/momo-comfort.gif'
    );
  });
});
