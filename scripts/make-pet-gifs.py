from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PET_DIR = ROOT / "src/ui/public/assets/pet"
SOURCE_DIR = ROOT / "src/ui/source"


def load(name):
    return Image.open(PET_DIR / f"momo-{name}.png").convert("RGBA")


def frame(base, scale=1.0, rotate=0, x=0, y=0, overlay=None):
    canvas = Image.new("RGBA", base.size, (0, 0, 0, 0))
    w, h = base.size
    img = base.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)
    img = img.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=True)
    canvas.alpha_composite(img, ((w - img.width) // 2 + x, (h - img.height) // 2 + y))
    if overlay:
        overlay(canvas)
    return canvas


def flood_transparent(im, tolerance=38):
    im = im.convert("RGBA")
    pix = im.load()
    w, h = im.size
    seen = set()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]

    def bgish(px):
        r, g, b, a = px
        return a > 0 and r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance

    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= w or y >= h:
            continue
        seen.add((x, y))
        if not bgish(pix[x, y]):
            continue
        pix[x, y] = (255, 255, 255, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return im


def normalize_sprite_sequence(cells, size=(365, 405)):
    sprites = []
    for cell in cells:
        cell = keep_largest_alpha_component(flood_transparent(cell))
        alpha = cell.getchannel("A").filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(0.7))
        cell.putalpha(alpha)
        sprites.append(cell.crop(cell.getchannel("A").getbbox()))

    scale = min(
        (size[0] - 12) / max(sprite.width for sprite in sprites),
        (size[1] - 12) / max(sprite.height for sprite in sprites),
    )
    frames = []
    for sprite in sprites:
        resized = sprite.convert("RGBa").resize(
            (round(sprite.width * scale), round(sprite.height * scale)),
            Image.Resampling.LANCZOS,
        ).convert("RGBA")
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.alpha_composite(resized, ((size[0] - resized.width) // 2, size[1] - resized.height - 6))
        frames.append(canvas)
    return frames


def keep_largest_alpha_component(im):
    im = im.convert("RGBA")
    alpha = im.getchannel("A")
    w, h = im.size
    seen = set()
    best = []

    for y in range(h):
        for x in range(w):
            if (x, y) in seen or alpha.getpixel((x, y)) == 0:
                continue
            stack = [(x, y)]
            component = []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if (nx, ny) in seen or nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    seen.add((nx, ny))
                    if alpha.getpixel((nx, ny)) > 0:
                        stack.append((nx, ny))
            if len(component) > len(best):
                best = component

    mask = Image.new("L", im.size, 0)
    pix = mask.load()
    for x, y in best:
        pix[x, y] = 255
    cleaned = Image.new("RGBA", im.size, (0, 0, 0, 0))
    cleaned.alpha_composite(im)
    cleaned.putalpha(Image.composite(alpha, Image.new("L", im.size, 0), mask))
    return cleaned


def save_sheet_gif(name, sheet_name, frame_count, timeline):
    sheet = Image.open(SOURCE_DIR / sheet_name).convert("RGBA")
    cell_w = sheet.width // frame_count
    cells = []
    for index in range(frame_count):
        right = (index + 1) * cell_w if index < frame_count - 1 else sheet.width
        cells.append(sheet.crop((index * cell_w, 0, right, sheet.height)))
    frames = normalize_sprite_sequence(cells)
    sequence = []
    durations = []
    for index, duration in timeline:
        sequence.append(frames[index])
        durations.append(duration)

    sequence[0].save(PET_DIR / f"momo-{name}.png")
    sequence[0].save(
        PET_DIR / f"momo-{name}.gif",
        save_all=True,
        append_images=sequence[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(PET_DIR / f"momo-{name}.gif")


def tickle_overlay(step):
    def draw(canvas):
        d = ImageDraw.Draw(canvas)
        cx, cy = int(canvas.width * 0.54), int(canvas.height * 0.58)
        color = (245, 188, 54, 210)
        for i in range(3):
            off = i * 18 + step * 3
            d.arc((cx - 42 + off, cy - 25, cx + 8 + off, cy + 28), 210, 335, fill=color, width=4)
        d.ellipse((cx + 30, cy + 8, cx + 39, cy + 17), fill=(255, 220, 111, 220))
        d.ellipse((cx + 52, cy - 12, cx + 59, cy - 5), fill=(255, 220, 111, 200))
    return draw


def save_gif(name, source, specs, durations=None):
    base = load(source)
    frames = [frame(base, **spec) for spec in specs]
    out = PET_DIR / f"momo-{name}.gif"
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=durations or [90] * len(frames),
        loop=0,
        disposal=2,
        optimize=False,
    )
    print(out)


save_gif("focus", "focus", [
    {"scale": 1.0, "y": 0}, {"scale": 0.998, "y": 1, "rotate": -0.3},
    {"scale": 0.995, "y": 3, "rotate": -0.5}, {"scale": 0.992, "y": 5, "rotate": 0.2},
    {"scale": 0.996, "y": 3, "rotate": 0.4}, {"scale": 1.0, "y": 0},
    {"scale": 1.004, "y": -2, "rotate": 0.2}, {"scale": 1.0, "y": 0},
], [150, 150, 170, 220, 170, 150, 160, 190])
save_gif("reward", "reward", [
    {"scale": 1.0, "y": 0}, {"scale": 0.97, "y": 10, "rotate": -2},
    {"scale": 1.04, "y": -18, "rotate": -6}, {"scale": 1.07, "y": -42, "rotate": 3},
    {"scale": 1.035, "y": -26, "rotate": 7}, {"scale": 0.985, "y": 8, "rotate": 3},
    {"scale": 1.018, "y": -6, "rotate": -2}, {"scale": 1.0, "y": 0},
], [80, 80, 80, 100, 90, 85, 95, 130])
save_gif("ball", "ball", [
    {"x": 0, "y": 0}, {"x": -7, "y": 2, "rotate": -2}, {"x": 12, "y": -6, "rotate": 4},
    {"x": 30, "y": -11, "rotate": 8}, {"x": 18, "y": -4, "rotate": 5},
    {"x": -25, "y": -2, "rotate": -8}, {"x": -12, "y": 2, "rotate": -3}, {"x": 0, "y": 0},
], [70, 70, 75, 90, 70, 95, 80, 110])
save_gif("sleepy", "sleepy", [
    {"scale": 1.0, "y": 0}, {"scale": 0.999, "y": 1, "rotate": -0.2},
    {"scale": 0.996, "y": 3, "rotate": -0.4}, {"scale": 0.992, "y": 6, "rotate": 0.3},
    {"scale": 0.995, "y": 4, "rotate": 0.4}, {"scale": 0.998, "y": 2},
    {"scale": 1.0, "y": 0}, {"scale": 1.002, "y": -1},
], [170, 150, 170, 260, 180, 150, 170, 210])
save_gif("fainted", "fainted", [
    {"rotate": 0}, {"rotate": -1, "y": 1}, {"rotate": -2, "y": 3},
    {"rotate": 1, "y": -1}, {"rotate": 0.5, "y": 0}, {"rotate": 0},
], [180, 150, 210, 130, 150, 230])
save_gif("annoyed", "annoyed", [
    {"x": 0}, {"x": -4, "rotate": -1}, {"x": 7, "rotate": 1.5},
    {"x": -7, "rotate": -1.5}, {"x": 6, "rotate": 1}, {"x": -3, "rotate": -0.5},
    {"x": 0}, {"x": 0, "y": 1},
], [60, 55, 55, 55, 55, 65, 90, 180])
save_gif("pet", "pet", [
    {"scale": 1.0, "y": 0}, {"scale": 1.006, "x": -2, "y": 2, "rotate": -1},
    {"scale": 1.018, "x": -5, "y": 6, "rotate": -4}, {"scale": 1.024, "x": 5, "y": 8, "rotate": 4},
    {"scale": 1.015, "x": 4, "y": 4, "rotate": 2}, {"scale": 1.004, "y": 1},
    {"scale": 1.0, "y": 0},
], [90, 80, 90, 110, 90, 90, 140])
save_gif("feed", "feed", [
    {"scale": 1.0, "y": 0}, {"scale": 1.012, "y": 2}, {"scale": 1.025, "y": 5},
    {"scale": 0.982, "y": 9}, {"scale": 1.028, "y": 0}, {"scale": 0.99, "y": 6},
    {"scale": 1.01, "y": 1}, {"scale": 1.0, "y": 0},
], [75, 70, 70, 95, 75, 95, 80, 120])
save_gif("comfort", "fainted", [
    {"rotate": -1, "overlay": tickle_overlay(0)}, {"rotate": 0.5, "y": -2, "overlay": tickle_overlay(1)},
    {"rotate": 1.5, "y": -4, "overlay": tickle_overlay(2)}, {"rotate": -1.5, "y": 2, "overlay": tickle_overlay(2)},
    {"rotate": 0.5, "y": 0, "overlay": tickle_overlay(1)}, {"rotate": 0, "overlay": tickle_overlay(0)},
], [90, 80, 95, 95, 90, 140])
save_sheet_gif(
    "water",
    "momo-water-expression-sheet.png",
    4,
    [
        (0, 720),
        (1, 240),
        (0, 480),
        (2, 560),
        (3, 320),
        (2, 360),
        (0, 720),
    ],
)
