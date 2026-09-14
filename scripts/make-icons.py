#!/usr/bin/env python3
"""Minimal PNG writer — two overlapping blocks on ink."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def pixel(x: int, y: int, size: int) -> bytes:
    s = size / 64
    ink = (16, 14, 12)
    rose = (251, 113, 133)
    teal = (45, 212, 191)

    def inside(cx: float, cy: float, w: float, h: float, r: float) -> bool:
        px, py = x / s, y / s
        dx = abs(px - (cx + w / 2)) - (w / 2 - r)
        dy = abs(py - (cy + h / 2)) - (h / 2 - r)
        if dx <= 0 and dy <= 0:
            return True
        if dx <= 0:
            return dy <= r
        if dy <= 0:
            return dx <= r
        return dx * dx + dy * dy <= r * r

    color = ink
    if inside(10, 14, 28, 28, 8):
        color = rose
    if inside(26, 22, 28, 28, 8):
        color = teal
    return bytes(color) + b"\xff"


def write_png(path: Path, size: int) -> None:
    raw = b"".join(b"\x00" + b"".join(pixel(x, y, size) for x in range(size)) for y in range(size))
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    out = Path("public/icons")
    out.mkdir(parents=True, exist_ok=True)
    write_png(out / "icon-192.png", 192)
    write_png(out / "icon-512.png", 512)


if __name__ == "__main__":
    main()
