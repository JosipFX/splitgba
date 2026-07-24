#!/usr/bin/env python3
"""Erzeugt Mini-GBA-Test-ROMs fuer SplitGBA.

Jedes ROM zeigt eine Vollbild-Farbflaeche (Mode 3). Solange irgendein
Knopf gedrueckt ist, wird der Bildschirm weiss — damit laesst sich die
Input-Zuordnung pro Spieler visuell pruefen.

Nur fuer Entwicklungs-/Smoke-Tests gedacht, keine echten Spiele.
"""
import os
import struct
import sys

ROM_SIZE = 16 * 1024
HEADER_SIZE = 0xC0


def build_code(base_mov, base_orr):
    """Hand-assembliertes ARM7-Programm (laeuft ab 0x080000C0)."""
    code = []

    def emit(word):
        code.append(word)

    emit(0xE3A00301)  # mov  r0, #0x04000000     (IO-Basis)
    emit(0xE3A01B01)  # mov  r1, #0x400
    emit(0xE3811003)  # orr  r1, r1, #3
    emit(0xE1C010B0)  # strh r1, [r0]            DISPCNT = 0x0403 (Mode 3, BG2)
    emit(0xE3A05301)  # mov  r5, #0x04000000
    frame = len(code)
    emit(0xE5956130)  # ldr  r6, [r5, #0x130]    KEYINPUT (active low)
    emit(0xE3A08C03)  # mov  r8, #0x300
    emit(0xE38880FF)  # orr  r8, r8, #0xFF       r8 = 0x3FF (alle Tasten)
    emit(0xE0066008)  # and  r6, r6, r8
    emit(base_mov)    # mov  r3, #BASE_TEIL_A    (Spielerfarbe, BGR555)
    emit(base_orr)    # orr  r3, r3, #BASE_TEIL_B
    emit(0xE1833803)  # orr  r3, r3, r3, lsl #16 (Pixel-Paar)
    emit(0xE1560008)  # cmp  r6, r8              nichts gedrueckt?
    emit(0x13E03902)  # mvnne r3, #0x8000        gedrueckt -> weiss (0x7FFF)
    emit(0xE3A02406)  # mov  r2, #0x06000000     VRAM
    emit(0xE3A04C4B)  # mov  r4, #0x4B00         19200 Woerter = 240*160 Pixel
    fill = len(code)
    emit(0xE4823004)  # str  r3, [r2], #4
    emit(0xE2544001)  # subs r4, r4, #1
    emit(0x1A000000 | ((fill - len(code) - 2) & 0xFFFFFF))   # bne fill
    emit(0xEA000000 | ((frame - len(code) - 2) & 0xFFFFFF))  # b   frame

    return b"".join(struct.pack("<I", w) for w in code)


def build_header(title):
    header = bytearray(HEADER_SIZE)
    # Entry: b 0x080000C0  -> Offset ((0xC0 - 0x08) / 4) = 46
    header[0:4] = struct.pack("<I", 0xEA000000 | 46)
    # Logo-Bereich bleibt leer; mGBA prueft ihn ohne BIOS nicht.
    header[0xA0:0xA0 + 12] = title.encode("ascii")[:12].ljust(12, b"\x00")
    header[0xAC:0xB0] = b"ATSE"
    header[0xB0:0xB2] = b"01"
    header[0xB2] = 0x96
    chk = 0
    for i in range(0xA0, 0xBD):
        chk = (chk - header[i]) & 0xFF
    header[0xBD] = (chk - 0x19) & 0xFF
    return bytes(header)


PLAYERS = [
    # (Name, mov r3, orr r3)  Farben in BGR555
    ("P1 ROT",  0xE3A0301F, 0xE3833000),  # 0x001F rot
    ("P2 GRUEN", 0xE3A03E3E, 0xE3833000),  # 0x03E0 gruen
    ("P3 BLAU", 0xE3A03B1F, 0xE3833000),  # 0x7C00 blau
    ("P4 GELB", 0xE3A0301F, 0xE3833E3E),  # 0x03FF gelb
]


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "roms-test"
    os.makedirs(outdir, exist_ok=True)
    for i, (name, mov, orr) in enumerate(PLAYERS, start=1):
        rom = bytearray(ROM_SIZE)
        header = build_header("SPLITTEST")
        code = build_code(mov, orr)
        rom[:len(header)] = header
        rom[HEADER_SIZE:HEADER_SIZE + len(code)] = code
        path = os.path.join(outdir, f"test_p{i}.gba")
        with open(path, "wb") as f:
            f.write(rom)
        print(f"{path} geschrieben ({name})")


if __name__ == "__main__":
    main()
