#!/usr/bin/env python3
"""Erzeugt ein GBA-Link-Test-ROM (SIO-Multiplayer-Modus).

Jede Instanz sendet dauerhaft 0xAB00|ID ueber den 4-Spieler-Link (derselbe
SIO-MULTI-Modus, den Pokemon Gen 3 im Kabelclub benutzt). Der Bildschirm
zeigt 4 Baender (Spieler 1-4):
  gruen = von diesem Spieler kommen Daten an (Link funktioniert)
  rot   = keine/ungueltige Daten (nicht verbunden)

Damit laesst sich die Lockstep-Verbindung ohne echte Spiele beweisen.
"""
import os
import struct
import sys

ROM_SIZE = 32 * 1024
HEADER_SIZE = 0xC0


def build_code():
    code = []
    labels = {}
    fixups = []  # (index, label, cond)

    def emit(word):
        code.append(word)

    def label(name):
        labels[name] = len(code)

    def branch(name, cond=0xEA):
        fixups.append((len(code), name, cond))
        emit(0)

    # --- Setup ---
    emit(0xE3A00301)  # mov  r0, #0x04000000
    emit(0xE3A01B01)  # mov  r1, #0x400
    emit(0xE3811003)  # orr  r1, r1, #3
    emit(0xE1C010B0)  # strh r1, [r0]           DISPCNT = 0x0403 (Mode 3)
    emit(0xE2805C01)  # add  r5, r0, #0x100     SIO-Basis 0x04000100
    emit(0xE3A01000)  # mov  r1, #0
    emit(0xE1C513B4)  # strh r1, [r5, #0x34]    RCNT = 0 (SIO-Modus)
    emit(0xE3A01A02)  # mov  r1, #0x2000        Multi-Modus
    emit(0xE3811003)  # orr  r1, r1, #3         Baud 115200
    emit(0xE1C512B8)  # strh r1, [r5, #0x28]    SIOCNT

    # --- Hauptschleife ---
    label("loop")
    emit(0xE1D562B8)  # ldrh r6, [r5, #0x28]    SIOCNT lesen
    emit(0xE1A07226)  # mov  r7, r6, lsr #4
    emit(0xE2077003)  # and  r7, r7, #3         eigene Multi-ID
    emit(0xE3877CAB)  # orr  r7, r7, #0xAB00    Kennung
    emit(0xE1C572BA)  # strh r7, [r5, #0x2A]    SIOMLT_SEND
    emit(0xE3160004)  # tst  r6, #4             SI-Bit: 0 = Master
    branch("skip_start", 0x1A)  # bne skip_start (Slave startet nicht)
    emit(0xE3866080)  # orr  r6, r6, #0x80      Start-Bit
    emit(0xE1C562B8)  # strh r6, [r5, #0x28]
    label("wait_done")
    emit(0xE1D562B8)  # ldrh r6, [r5, #0x28]
    emit(0xE3160080)  # tst  r6, #0x80
    branch("wait_done", 0x1A)   # bne: warten bis Transfer fertig

    label("skip_start")
    emit(0xE3A02406)  # mov  r2, #0x06000000    VRAM
    emit(0xE3A09000)  # mov  r9, #0             Band-Index
    label("band_loop")
    emit(0xE0854089)  # add  r4, r5, r9, lsl #1
    emit(0xE1D462B0)  # ldrh r6, [r4, #0x20]    SIOMULTI[r9]
    emit(0xE1A03426)  # mov  r3, r6, lsr #8
    emit(0xE35300AB)  # cmp  r3, #0xAB
    emit(0x03A03E3E)  # moveq r3, #0x3E0        gruen
    emit(0x13A0301F)  # movne r3, #0x1F         rot
    emit(0xE1833803)  # orr  r3, r3, r3, lsl #16
    emit(0xE3A0AD4B)  # mov  r10, #0x12C0       4800 Woerter = 40 Zeilen
    label("fill")
    emit(0xE4823004)  # str  r3, [r2], #4
    emit(0xE25AA001)  # subs r10, r10, #1
    branch("fill", 0x1A)
    emit(0xE2899001)  # add  r9, r9, #1
    emit(0xE3590004)  # cmp  r9, #4
    branch("band_loop", 0xBA)   # blt
    emit(0xE3A0A701)  # mov  r10, #0x40000      kleine Pause
    label("delay")
    emit(0xE25AA001)  # subs r10, r10, #1
    branch("delay", 0x1A)
    branch("loop")

    for idx, name, cond in fixups:
        offset = labels[name] - idx - 2
        code[idx] = (cond << 24) | (offset & 0xFFFFFF)

    return b"".join(struct.pack("<I", w) for w in code)


def build_header():
    header = bytearray(HEADER_SIZE)
    header[0:4] = struct.pack("<I", 0xEA000000 | 46)  # b 0x080000C0
    header[0xA0:0xAC] = b"LINKTEST\x00\x00\x00\x00"
    header[0xAC:0xB0] = b"ALTE"
    header[0xB0:0xB2] = b"01"
    header[0xB2] = 0x96
    chk = 0
    for i in range(0xA0, 0xBD):
        chk = (chk - header[i]) & 0xFF
    header[0xBD] = (chk - 0x19) & 0xFF
    return bytes(header)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "roms-test"
    os.makedirs(outdir, exist_ok=True)
    rom = bytearray(ROM_SIZE)
    rom[:HEADER_SIZE] = build_header()
    code = build_code()
    rom[HEADER_SIZE:HEADER_SIZE + len(code)] = code
    path = os.path.join(outdir, "linktest.gba")
    with open(path, "wb") as f:
        f.write(rom)
    print(f"{path} geschrieben")


if __name__ == "__main__":
    main()
