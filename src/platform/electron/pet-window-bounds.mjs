export function resizePetBounds(bounds = {}, display = {}, requestedHeight = 280, minimumHeight = 126, width = 300, maxHeight = 480) {
  const area = {
    x: Number.isFinite(display.x) ? display.x : 0,
    y: Number.isFinite(display.y) ? display.y : 0,
    width: Number.isFinite(display.width) && display.width > 0 ? display.width : width,
    height: Number.isFinite(display.height) && display.height > 0 ? display.height : maxHeight
  };
  const height = Math.min(area.height, maxHeight, Math.max(minimumHeight, Math.round(requestedHeight)));
  const currentY = Number.isFinite(bounds.y) ? bounds.y : area.y;
  const currentHeight = Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : height;
  const currentBottom = currentY + currentHeight;
  const minY = area.y;
  const maxY = area.y + area.height - height;
  const y = Math.min(Math.max(currentBottom - height, minY), maxY);
  return {
    x: Math.round(Number.isFinite(bounds.x) ? bounds.x : area.x),
    y: Math.round(y),
    width,
    height
  };
}
