"""Crop outer margin from logo PNG via flood-fill from image edges (handles white cube faces)."""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image


def is_outer_margin_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a < 40:
        return True
    return r >= 247 and g >= 247 and b >= 247


def crop_logo(src: Path, dst: Path, pad: int = 4) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    vis = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if not (0 <= x < w and 0 <= y < h):
            return
        if vis[y][x]:
            return
        r, g, b, a = px[x, y]
        if not is_outer_margin_pixel(r, g, b, a):
            return
        vis[y][x] = True
        q.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or vis[ny][nx]:
                continue
            r, g, b, a = px[nx, ny]
            if not is_outer_margin_pixel(r, g, b, a):
                continue
            vis[ny][nx] = True
            q.append((nx, ny))

    min_x, min_y = w, h
    max_x, max_y = -1, -1
    found = False
    for y in range(h):
        for x in range(w):
            if not vis[y][x]:
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if not found:
        raise SystemExit("Could not find logo content after margin flood-fill.")

    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(w - 1, max_x + pad)
    max_y = min(h - 1, max_y + pad)

    cropped = im.crop((min_x, min_y, max_x + 1, max_y + 1))
    cropped.save(dst, "PNG")
    print(f"Cropped {src.name} -> {dst} size={cropped.size}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: crop_logo.py <src.png> <dst.png>")
        sys.exit(1)
    crop_logo(Path(sys.argv[1]), Path(sys.argv[2]))
