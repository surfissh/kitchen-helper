#!/usr/bin/env python3
"""Generate the Kitchen Helper icon set.

The FusionUI public API only exposes rectangular views and images, so every
icon is a small transparent PNG rendered at 4x and downsampled.  The script is
kept in the repository so the assets can be regenerated without a design tool:

    python3 apps/kitchen-helper/tools/generate-icons.py

Output: apps/kitchen-helper/src/assets/icons/*.png (96x96 RGBA).
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 96
SS = 4  # supersampling factor
S = SIZE * SS
OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"

ORANGE = (255, 184, 107, 255)
FLAME = (255, 159, 67, 255)
FLAME_LIGHT = (255, 209, 102, 255)
YELLOW = (250, 204, 21, 255)
GREEN = (74, 222, 128, 255)
TEAL = (45, 212, 191, 255)
RED = (248, 113, 113, 255)
PURPLE = (167, 139, 250, 255)
BLUE = (125, 211, 252, 255)
SKY = (147, 197, 253, 255)
PINK = (249, 168, 212, 255)
WHITE = (230, 237, 243, 255)
SLATE = (159, 179, 200, 255)
AMBER = (251, 191, 36, 255)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def p(x: float, y: float) -> tuple[float, float]:
    return (x * S, y * S)


def box(x0: float, y0: float, x1: float, y1: float) -> tuple[float, float, float, float]:
    return (x0 * S, y0 * S, x1 * S, y1 * S)


def line(draw: ImageDraw.ImageDraw, points, color, width: float = 0.07):
    draw.line([p(x, y) for x, y in points], fill=color, width=max(1, int(width * S)), joint="curve")
    radius = width * S / 2
    for x, y in points:
        draw.ellipse(box(x - radius / S, y - radius / S, x + radius / S, y + radius / S), fill=color)


def ring(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color, width: float = 0.07):
    w = max(1, int(width * S))
    draw.ellipse(
        box(cx - r, cy - r, cx + r, cy + r),
        outline=color,
        width=w,
    )


def save(name: str, draw_fn) -> None:
    image, draw = canvas()
    draw_fn(draw)
    image = image.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{name}.png")
    print(f"  {name}.png")


def flame(draw):
    outer = [(0.50, 0.06), (0.66, 0.24), (0.80, 0.42), (0.82, 0.62), (0.72, 0.83), (0.50, 0.93),
             (0.28, 0.83), (0.18, 0.62), (0.22, 0.45), (0.36, 0.28), (0.42, 0.36), (0.40, 0.53)]
    draw.polygon([p(x, y) for x, y in outer], fill=FLAME)
    inner = [(0.50, 0.36), (0.63, 0.53), (0.65, 0.68), (0.58, 0.82), (0.44, 0.82), (0.36, 0.68),
             (0.39, 0.53)]
    draw.polygon([p(x, y) for x, y in inner], fill=FLAME_LIGHT)


def clock(draw):
    ring(draw, 0.5, 0.54, 0.36, YELLOW, 0.075)
    line(draw, [(0.5, 0.54), (0.5, 0.34)], YELLOW, 0.06)
    line(draw, [(0.5, 0.54), (0.66, 0.60)], YELLOW, 0.06)
    line(draw, [(0.36, 0.12), (0.64, 0.12)], YELLOW, 0.05)


def timer(draw):
    ring(draw, 0.5, 0.58, 0.32, YELLOW, 0.065)
    line(draw, [(0.5, 0.58), (0.5, 0.40)], YELLOW, 0.055)
    line(draw, [(0.5, 0.58), (0.68, 0.66)], YELLOW, 0.055)
    line(draw, [(0.34, 0.13), (0.66, 0.13)], YELLOW, 0.05)
    line(draw, [(0.5, 0.13), (0.5, 0.22)], YELLOW, 0.05)
    draw.ellipse(box(0.45, 0.53, 0.55, 0.63), fill=YELLOW)


def mic(draw):
    draw.rounded_rectangle(box(0.38, 0.06, 0.62, 0.46), radius=0.12 * S, fill=TEAL)
    draw.arc(box(0.26, 0.24, 0.74, 0.62), start=0, end=180, fill=TEAL, width=int(0.06 * S))
    line(draw, [(0.5, 0.60), (0.5, 0.82)], TEAL, 0.06)
    line(draw, [(0.35, 0.84), (0.65, 0.84)], TEAL, 0.06)


def check(draw):
    line(draw, [(0.22, 0.52), (0.42, 0.72), (0.78, 0.28)], GREEN, 0.11)


def warning(draw):
    draw.polygon([p(0.50, 0.10), p(0.92, 0.86), p(0.08, 0.86)], fill=RED)
    draw.rounded_rectangle(box(0.44, 0.34, 0.56, 0.64), radius=0.05 * S, fill=(30, 20, 24, 255))
    draw.ellipse(box(0.44, 0.70, 0.56, 0.80), fill=(30, 20, 24, 255))


def sparkle(draw):
    def star(cx, cy, r):
        pts = []
        for i in range(8):
            angle = math.pi / 2 * (i / 2) - math.pi / 2
            radius = r if i % 2 == 0 else r * 0.32
            pts.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
        draw.polygon([p(x, y) for x, y in pts], fill=YELLOW)

    star(0.42, 0.50, 0.33)
    star(0.76, 0.24, 0.14)


def chef_hat(draw):
    draw.ellipse(box(0.16, 0.16, 0.50, 0.48), fill=ORANGE)
    draw.ellipse(box(0.50, 0.16, 0.84, 0.48), fill=ORANGE)
    draw.ellipse(box(0.32, 0.08, 0.68, 0.40), fill=ORANGE)
    draw.rounded_rectangle(box(0.22, 0.40, 0.78, 0.66), radius=0.06 * S, fill=ORANGE)
    draw.rounded_rectangle(box(0.24, 0.68, 0.76, 0.84), radius=0.03 * S, fill=(255, 220, 178, 255))


def pot(draw):
    draw.rounded_rectangle(box(0.16, 0.36, 0.84, 0.80), radius=0.08 * S, fill=ORANGE)
    draw.rounded_rectangle(box(0.10, 0.30, 0.90, 0.40), radius=0.04 * S, fill=(255, 220, 178, 255))
    draw.ellipse(box(0.44, 0.22, 0.56, 0.32), fill=ORANGE)
    draw.rounded_rectangle(box(0.02, 0.44, 0.14, 0.56), radius=0.03 * S, fill=ORANGE)
    draw.rounded_rectangle(box(0.86, 0.44, 0.98, 0.56), radius=0.03 * S, fill=ORANGE)


def pan(draw):
    draw.ellipse(box(0.14, 0.36, 0.70, 0.80), fill=ORANGE)
    draw.ellipse(box(0.20, 0.42, 0.64, 0.74), fill=(26, 32, 40, 255))
    line(draw, [(0.66, 0.58), (0.94, 0.38)], ORANGE, 0.07)


def knife(draw):
    draw.polygon(
        [p(0.12, 0.62), p(0.62, 0.16), p(0.68, 0.28), p(0.26, 0.72), p(0.14, 0.72)],
        fill=SLATE,
    )
    line(draw, [(0.62, 0.22), (0.90, 0.16)], (120, 140, 160, 255), 0.11)


def board(draw):
    draw.rounded_rectangle(box(0.12, 0.24, 0.88, 0.78), radius=0.07 * S, fill=PURPLE)
    draw.ellipse(box(0.72, 0.32, 0.80, 0.40), fill=(26, 32, 40, 255))
    line(draw, [(0.30, 0.36), (0.30, 0.64)], (220, 210, 255, 255), 0.035)


def bowl(draw):
    draw.chord(box(0.12, 0.34, 0.88, 0.94), start=0, end=180, fill=BLUE)
    draw.rounded_rectangle(box(0.36, 0.78, 0.64, 0.90), radius=0.03 * S, fill=(90, 170, 220, 255))
    draw.ellipse(box(0.20, 0.30, 0.80, 0.44), fill=(200, 235, 255, 255))


def tomato(draw):
    draw.ellipse(box(0.14, 0.26, 0.86, 0.90), fill=RED)
    draw.ellipse(box(0.24, 0.34, 0.40, 0.48), fill=(255, 190, 190, 255))
    leaf = [(0.50, 0.30), (0.62, 0.16), (0.60, 0.30), (0.76, 0.26), (0.60, 0.36)]
    draw.polygon([p(x, y) for x, y in leaf], fill=GREEN)


def egg(draw):
    draw.ellipse(box(0.20, 0.10, 0.80, 0.90), fill=(253, 230, 138, 255))
    draw.ellipse(box(0.34, 0.38, 0.66, 0.70), fill=(251, 191, 36, 255))
    draw.ellipse(box(0.40, 0.42, 0.50, 0.52), fill=(255, 236, 170, 255))


def meat(draw):
    points = [(0.16, 0.46), (0.28, 0.24), (0.56, 0.18), (0.82, 0.34), (0.86, 0.60),
              (0.68, 0.80), (0.36, 0.82), (0.18, 0.66)]
    draw.polygon([p(x, y) for x, y in points], fill=(248, 113, 113, 255))
    draw.line([p(0.34, 0.36), p(0.56, 0.32), p(0.60, 0.52), p(0.40, 0.60), p(0.62, 0.66)],
              fill=(255, 205, 205, 255), width=int(0.045 * S), joint="curve")
    draw.ellipse(box(0.68, 0.46, 0.76, 0.54), fill=(255, 225, 225, 255))


def vegetable(draw):
    draw.polygon([p(0.24, 0.72), p(0.50, 0.16), p(0.62, 0.42), p(0.44, 0.76)], fill=GREEN)
    draw.polygon([p(0.52, 0.78), p(0.68, 0.38), p(0.82, 0.60), p(0.66, 0.82)], fill=(110, 231, 160, 255))
    line(draw, [(0.48, 0.78), (0.58, 0.90)], (52, 140, 90, 255), 0.045)


def tofu(draw):
    draw.polygon([p(0.20, 0.40), p(0.50, 0.26), p(0.80, 0.40), p(0.50, 0.56)], fill=(253, 230, 138, 255))
    draw.polygon([p(0.20, 0.40), p(0.50, 0.56), p(0.50, 0.84), p(0.20, 0.66)],
                 fill=(245, 208, 110, 255))
    draw.polygon([p(0.80, 0.40), p(0.50, 0.56), p(0.50, 0.84), p(0.80, 0.66)],
                 fill=(250, 220, 130, 255))


def seasoning(draw):
    draw.rounded_rectangle(box(0.28, 0.30, 0.72, 0.86), radius=0.08 * S, fill=(252, 211, 77, 255))
    draw.rounded_rectangle(box(0.24, 0.18, 0.76, 0.32), radius=0.04 * S, fill=(255, 236, 170, 255))
    draw.ellipse(box(0.40, 0.44, 0.46, 0.50), fill=(120, 80, 30, 255))
    draw.ellipse(box(0.54, 0.54, 0.60, 0.60), fill=(120, 80, 30, 255))
    draw.ellipse(box(0.42, 0.62, 0.48, 0.68), fill=(120, 80, 30, 255))


def oil(draw):
    draw.rounded_rectangle(box(0.34, 0.34, 0.66, 0.90), radius=0.08 * S, fill=(251, 191, 36, 255))
    draw.rounded_rectangle(box(0.42, 0.12, 0.58, 0.34), radius=0.03 * S, fill=(255, 220, 140, 255))
    draw.rounded_rectangle(box(0.40, 0.48, 0.60, 0.70), radius=0.02 * S, fill=(255, 240, 190, 255))


def water(draw):
    draw.polygon([p(0.50, 0.10), p(0.76, 0.54), p(0.68, 0.78), p(0.50, 0.90),
                  p(0.32, 0.78), p(0.24, 0.54)], fill=SKY)
    draw.ellipse(box(0.40, 0.52, 0.50, 0.64), fill=(230, 240, 255, 255))


def grain(draw):
    for offset in (-0.16, 0.0, 0.16):
        draw.arc(box(0.16 + offset, 0.18, 0.84 + offset, 0.84), start=200, end=340,
                 fill=(253, 186, 116, 255), width=int(0.06 * S))
    draw.arc(box(0.16, 0.54, 0.84, 0.94), start=0, end=180, fill=(251, 191, 36, 255),
             width=int(0.07 * S))


def other(draw):
    ring(draw, 0.5, 0.5, 0.30, SLATE, 0.06)
    draw.ellipse(box(0.43, 0.43, 0.57, 0.57), fill=SLATE)


def dish(draw):
    draw.ellipse(box(0.08, 0.44, 0.92, 0.90), fill=(230, 237, 243, 255))
    draw.ellipse(box(0.18, 0.50, 0.82, 0.80), fill=(52, 60, 72, 255))
    draw.ellipse(box(0.26, 0.42, 0.52, 0.62), fill=(248, 113, 113, 255))
    draw.ellipse(box(0.44, 0.36, 0.66, 0.60), fill=(74, 222, 128, 255))
    draw.ellipse(box(0.54, 0.46, 0.76, 0.64), fill=(251, 191, 36, 255))
    draw.ellipse(box(0.34, 0.46, 0.44, 0.54), fill=(255, 230, 180, 255))


def arrow(direction: str):
    def render(draw):
        if direction == "up":
            line(draw, [(0.22, 0.64), (0.50, 0.34), (0.78, 0.64)], WHITE, 0.10)
        elif direction == "down":
            line(draw, [(0.22, 0.36), (0.50, 0.66), (0.78, 0.36)], WHITE, 0.10)
        elif direction == "left":
            line(draw, [(0.64, 0.22), (0.34, 0.50), (0.64, 0.78)], WHITE, 0.10)
        else:
            line(draw, [(0.36, 0.22), (0.66, 0.50), (0.36, 0.78)], WHITE, 0.10)

    return render


def tap(draw):
    ring(draw, 0.5, 0.56, 0.20, TEAL, 0.055)
    ring(draw, 0.5, 0.56, 0.31, (45, 212, 191, 150), 0.035)
    draw.ellipse(box(0.45, 0.51, 0.55, 0.61), fill=TEAL)


def sound(draw):
    draw.polygon([p(0.16, 0.40), p(0.32, 0.40), p(0.50, 0.22), p(0.50, 0.78),
                  p(0.32, 0.60), p(0.16, 0.60)], fill=TEAL)
    draw.arc(box(0.42, 0.28, 0.66, 0.72), start=-60, end=60, fill=TEAL, width=int(0.04 * S))
    draw.arc(box(0.48, 0.18, 0.82, 0.82), start=-60, end=60, fill=(45, 212, 191, 160),
             width=int(0.035 * S))


def leaf(draw):
    draw.polygon([p(0.50, 0.10), p(0.82, 0.42), p(0.54, 0.90), p(0.28, 0.46)], fill=GREEN)
    line(draw, [(0.50, 0.16), (0.50, 0.86)], (30, 120, 70, 255), 0.03)


def main() -> None:
    print(f"rendering icons -> {OUT}")
    save("chef-hat", chef_hat)
    save("flame", flame)
    save("clock", clock)
    save("timer", timer)
    save("mic", mic)
    save("check", check)
    save("warning", warning)
    save("sparkle", sparkle)
    save("pot", pot)
    save("pan", pan)
    save("knife", knife)
    save("board", board)
    save("bowl", bowl)
    save("dish", dish)
    save("tomato", tomato)
    save("egg", egg)
    save("meat", meat)
    save("vegetable", vegetable)
    save("tofu", tofu)
    save("seasoning", seasoning)
    save("oil", oil)
    save("water", water)
    save("grain", grain)
    save("other", other)
    save("leaf", leaf)
    save("tap", tap)
    save("sound", sound)
    for direction in ("up", "down", "left", "right"):
        save(f"arrow-{direction}", arrow(direction))


if __name__ == "__main__":
    main()
