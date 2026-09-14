export function normalizeWindowBounds(bounds = {}, fallback = {}) {
  const width = Number.isFinite(Number(bounds.width)) && Number(bounds.width) > 0 ? Number(bounds.width) : fallback.width;
  const height = Number.isFinite(Number(bounds.height)) && Number(bounds.height) > 0 ? Number(bounds.height) : fallback.height;
  return {
    x: Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : fallback.x,
    y: Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : fallback.y,
    width,
    height
  };
}

export function clampToArea(bounds, area) {
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height)
  };
}

export function virtualWorkArea(displays = []) {
  const areas = displays.map((display) => display.workArea).filter(Boolean);
  if (!areas.length) return null;
  const left = Math.min(...areas.map((area) => area.x));
  const top = Math.min(...areas.map((area) => area.y));
  const right = Math.max(...areas.map((area) => area.x + area.width));
  const bottom = Math.max(...areas.map((area) => area.y + area.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

