const pageHref = () => globalThis.window?.location?.href || 'http://localhost/';

export function companionPoseSrc(pose, href = pageHref()) {
  return new globalThis.URL(`assets/pet/momo-${pose}.png`, href).href;
}

export function voiceAssetBase(href = pageHref()) {
  return new globalThis.URL('audio/', href).href;
}
