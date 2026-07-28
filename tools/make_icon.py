#!/usr/bin/env python3
"""Erzeugt das SplitEmu-App-Icon in allen benoetigten Formaten.

Reines Python (zlib/struct aus der Standardbibliothek, kein PIL):
- packaging/icons/icon_<n>.png   (Linux/AppImage, Quellbilder)
- packaging/icons/icon.ico       (Windows, 256px PNG-basiert)
- packaging/icons/splitemu.icns  (macOS, via iconutil — nur auf macOS)

Motiv: dunkles, abgerundetes Quadrat mit 2x2 farbigen "Bildschirmen" —
der 4-Spieler-Splitscreen als Icon.
"""
import os
import shutil
import struct
import subprocess
import sys
import zlib

BG = (26, 27, 34)
COLORS = [(226, 76, 76), (86, 200, 120), (92, 140, 238), (238, 200, 82)]


def rounded(px, py, x, y, w, h, r):
    """Liegt der Punkt (px,py) im abgerundeten Rechteck?"""
    if px < x or px >= x + w or py < y or py >= y + h:
        return False
    cx = max(x + r, min(px, x + w - r))
    cy = max(y + r, min(py, y + h - r))
    dx = px - cx
    dy = py - cy
    return dx * dx + dy * dy <= r * r or (x + r <= px < x + w - r) or (y + r <= py < y + h - r)


def draw(size):
    img = bytearray(size * size * 4)
    outer_r = size * 0.225
    margin = size * 0.10
    gap = size * 0.045
    cell_w = (size - 2 * margin - gap) / 2
    cell_h = cell_w * 2 / 3  # GBA-Seitenverhaeltnis 3:2
    top = (size - 2 * cell_h - gap) / 2
    cell_r = max(1.5, size * 0.02)

    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            if not rounded(x, y, 0, 0, size, size, outer_r):
                continue  # transparent
            r, g, b = BG
            for n in range(4):
                cx = margin + (n % 2) * (cell_w + gap)
                cy = top + (n // 2) * (cell_h + gap)
                if rounded(x, y, cx, cy, cell_w, cell_h, cell_r):
                    r, g, b = COLORS[n]
                    break
            img[i:i + 4] = bytes((r, g, b, 255))
    return img


def write_png(path, size, img):
    raw = b"".join(
        b"\x00" + bytes(img[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(typ, data):
        out = struct.pack(">I", len(data)) + typ + data
        return out + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def ico_bmp_entry(size):
    """Klassischer unkomprimierter ICO-Eintrag (BGRA bottom-up + leere AND-Maske)
    — maximale Kompatibilitaet mit windres und alten Windows-Versionen."""
    img = draw(size)
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                         size * size * 4, 0, 0, 0, 0)
    rows = []
    for y in range(size - 1, -1, -1):
        row = bytearray()
        for x in range(size):
            i = (y * size + x) * 4
            r, g, b, a = img[i], img[i + 1], img[i + 2], img[i + 3]
            row += bytes((b, g, r, a))
        rows.append(bytes(row))
    mask_stride = ((size + 31) // 32) * 4
    mask = b"\x00" * (mask_stride * size)
    return header + b"".join(rows) + mask


def write_ico(path):
    sizes = [16, 32, 48, 64, 128, 256]
    entries = [ico_bmp_entry(s) for s in sizes]
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(sizes)))
        offset = 6 + 16 * len(sizes)
        for s, e in zip(sizes, entries):
            b = 0 if s == 256 else s
            f.write(struct.pack("<BBBBHHII", b, b, 0, 0, 1, 32, len(e), offset))
            offset += len(e)
        for e in entries:
            f.write(e)


def main():
    outdir = os.path.join(os.path.dirname(__file__), "..", "packaging", "icons")
    os.makedirs(outdir, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512, 1024]
    pngs = {}
    for s in sizes:
        path = os.path.join(outdir, f"icon_{s}.png")
        write_png(path, s, draw(s))
        pngs[s] = path
        print(f"{path} geschrieben")

    write_ico(os.path.join(outdir, "icon.ico"))
    print(f"{outdir}/icon.ico geschrieben")

    if shutil.which("iconutil"):
        iconset = os.path.join(outdir, "splitemu.iconset")
        os.makedirs(iconset, exist_ok=True)
        mapping = {
            "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
            "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
            "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
            "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
            "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
        }
        for name, s in mapping.items():
            shutil.copyfile(pngs[s], os.path.join(iconset, name))
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o",
                        os.path.join(outdir, "splitemu.icns")], check=True)
        shutil.rmtree(iconset)
        print(f"{outdir}/splitemu.icns geschrieben")


if __name__ == "__main__":
    sys.exit(main())
