# -*- coding: utf-8 -*-
"""產生 App 圖示 icons/icon-*.png

用法：
    pip install pillow
    python tools/gen_icons.py
"""
import math
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")
SIZES = (180, 192, 512)

BG_TOP = (255, 201, 60)
BG_BOTTOM = (255, 143, 40)
STAR = (255, 255, 255)
CHECK = (52, 199, 123)


def star_points(cx, cy, outer, inner, points=5, rotation=-math.pi / 2):
    out = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = rotation + i * math.pi / points
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
    return mask


def make(size):
    scale = 4  # 先畫大張再縮小，邊緣比較平滑
    s = size * scale
    img = Image.new("RGB", (s, s), BG_TOP)
    draw = ImageDraw.Draw(img)

    # 由上到下的漸層背景
    for y in range(s):
        t = y / (s - 1)
        draw.line(
            [(0, y), (s, y)],
            fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)),
        )

    # 星星
    draw.polygon(star_points(s * 0.5, s * 0.46, s * 0.31, s * 0.135), fill=STAR)

    # 右下角的打勾圈圈
    cx, cy, r = s * 0.72, s * 0.73, s * 0.175
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CHECK, outline=(255, 255, 255), width=int(s * 0.022))
    draw.line(
        [(cx - r * 0.45, cy), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.38)],
        fill=(255, 255, 255),
        width=int(s * 0.035),
        joint="curve",
    )

    img = img.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), rounded_mask(size, round(size * 0.22)))
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        make(size).save(path)
        print("已產生", os.path.normpath(path))


if __name__ == "__main__":
    main()
