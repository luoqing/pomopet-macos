from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PET_DIR = ROOT / "src/ui/public/assets/pet"


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


def water_overlay(step):
    def draw(canvas):
        d = ImageDraw.Draw(canvas)
        cx, cy = int(canvas.width * 0.50), int(canvas.height * 0.67)
        bob = [0, -3, -5, -2, 0][step % 5]
        d.rounded_rectangle((cx - 40, cy - 30 + bob, cx + 44, cy + 28 + bob), radius=14, fill=(108, 181, 221, 240), outline=(63, 126, 168, 255), width=4)
        d.rectangle((cx - 34, cy - 22 + bob, cx + 38, cy - 6 + bob), fill=(176, 231, 250, 230))
        d.arc((cx + 35, cy - 18 + bob, cx + 68, cy + 15 + bob), -70, 82, fill=(63, 126, 168, 255), width=5)
        for i in range(3):
            drop_x = cx - 18 + i * 20
            d.ellipse((drop_x, cy - 54 + bob + i * 3, drop_x + 8, cy - 43 + bob + i * 3), fill=(124, 204, 241, 210))
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
    {"scale": 1.0, "y": 0}, {"scale": 0.995, "y": 3}, {"scale": 0.99, "y": 5},
    {"scale": 0.995, "y": 3}, {"scale": 1.0, "y": 0}, {"scale": 1.005, "y": -2},
])
save_gif("reward", "reward", [
    {"scale": 1.0, "y": 0}, {"scale": 1.03, "y": -18, "rotate": -3}, {"scale": 1.06, "y": -34, "rotate": 2},
    {"scale": 1.02, "y": -12, "rotate": 4}, {"scale": 0.99, "y": 2}, {"scale": 1.0, "y": 0},
])
save_gif("ball", "ball", [
    {"x": 0, "y": 0}, {"x": 13, "y": -5, "rotate": 3}, {"x": 26, "y": -9, "rotate": 6},
    {"x": -18, "y": -2, "rotate": -5}, {"x": -8, "y": 1, "rotate": -2}, {"x": 0, "y": 0},
])
save_gif("sleepy", "sleepy", [
    {"scale": 1.0, "y": 0}, {"scale": 0.998, "y": 2}, {"scale": 0.995, "y": 4},
    {"scale": 0.998, "y": 2}, {"scale": 1.0, "y": 0},
], [140, 140, 180, 140, 140])
save_gif("fainted", "fainted", [
    {"rotate": 0}, {"rotate": -2, "y": 2}, {"rotate": 1, "y": -1}, {"rotate": 0},
])
save_gif("annoyed", "annoyed", [
    {"x": 0}, {"x": 6, "rotate": 1}, {"x": -6, "rotate": -1}, {"x": 5, "rotate": 1}, {"x": 0},
], [70, 70, 70, 70, 120])
save_gif("pet", "pet", [
    {"scale": 1.0, "y": 0}, {"scale": 1.01, "y": 4}, {"scale": 1.02, "y": 7},
    {"scale": 1.01, "y": 3}, {"scale": 1.0, "y": 0},
])
save_gif("feed", "feed", [
    {"scale": 1.0, "y": 0}, {"scale": 1.02, "y": 3}, {"scale": 0.985, "y": 7},
    {"scale": 1.02, "y": 1}, {"scale": 1.0, "y": 0},
], [90, 90, 110, 90, 110])
save_gif("comfort", "fainted", [
    {"rotate": -1, "overlay": tickle_overlay(0)}, {"rotate": 1, "y": -2, "overlay": tickle_overlay(1)},
    {"rotate": -2, "y": 2, "overlay": tickle_overlay(2)}, {"rotate": 0, "overlay": tickle_overlay(1)},
])
save_gif("water", "focus", [
    {"scale": 1.0, "y": 0, "overlay": water_overlay(0)}, {"scale": 1.01, "y": -2, "overlay": water_overlay(1)},
    {"scale": 1.015, "y": -4, "overlay": water_overlay(2)}, {"scale": 1.01, "y": -2, "overlay": water_overlay(3)},
    {"scale": 1.0, "y": 0, "overlay": water_overlay(4)},
], [100, 100, 120, 100, 130])
