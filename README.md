# SplitGBA

**Four-player split-screen Game Boy Advance emulation on one screen — with a
working link cable, a shared race timer, and a global speed control (1x–4x).**

Deutsche Anleitung: [README.de.md](README.de.md)

![SplitGBA running four linked instances in a 2x2 grid](docs/screenshot.png)

## What is this?

SplitGBA is a small native frontend built around the
[mGBA](https://mgba.io) emulator core. It runs **up to four GBA instances in
a single window**, laid out like couch-multiplayer split-screen, and connects
all of them through mGBA's lockstep serial emulation — the same mechanism the
official mGBA multiplayer windows use. To the games it looks like four
consoles joined by a real 4-player link cable.

It was built for one very specific kind of evening: friends on a couch,
one TV, four Pokémon savegames. Everyone can see everyone else's progress,
you can race the same game against the clock, speed through grindy sections
together, and trade or battle through the in-game Cable Club — no netplay,
no second screen, no phones.

### Features

- **1–4 players in one window** — 2x2 grid; with three players the free
  quadrant becomes a big race-timer display
- **Link cable emulation** between all instances (trading and battling work
  exactly like on real hardware, including the in-game Cable Club)
- **Global speed control**: 1x–4x, switched live with one key press for all
  players at once, plus a hold-to-turbo key. All instances stay in
  frame-perfect sync
- **Race timer** overlay with a synchronized "reset all games" hotkey for
  fair starts
- **Hotplug controller support** via SDL — Xbox, PlayStation, Switch Pro,
  8BitDo and friends; connection order assigns players. Player 1 can also
  use the keyboard
- **Synchronized savestates** for all players at once (`F5`/`F9`)
- **Per-player saves** when the same ROM is loaded multiple times
  (`game.p1.sav` … `game.p4.sav` are created automatically)
- Audio mixing for all instances, solo/mute switching per player

## Download

Prebuilt packages for every release are on the
[releases page](https://github.com/JosipFX/splitgba/releases):

| Platform | Package |
|---|---|
| **macOS** (Apple Silicon + Intel) | `SplitGBA-<v>-macos.dmg` — drag the app to Applications. First launch: right-click → *Open* (unsigned open-source app) |
| **Windows** (64-bit) | `SplitGBA-<v>-windows-setup.exe` installer, or the portable `.zip` |
| **Linux** (x86_64) | `SplitGBA-<v>-linux-x86_64.AppImage` (`chmod +x`, run) or the `.tar.gz` |

Put your ROM dumps either in a `roms/` folder next to where you launch, or
in a `SplitGBA/` folder inside your home directory — the launcher finds
both.

## Building from source

The code is plain C++17 with SDL2 and CMake; it builds on macOS, Linux and
Windows (MinGW). Development happens on macOS (Apple Silicon).

Requirements: a C/C++ toolchain, CMake ≥ 3.20 and SDL2
(`brew install cmake sdl2` / `apt install cmake libsdl2-dev`).

```bash
git clone --recursive https://github.com/JosipFX/splitgba.git
cd splitgba
./build.sh
```

The mGBA core is embedded as a git submodule and built automatically as a
static library — no mGBA installation needed. If you cloned without
`--recursive`, `build.sh` fetches the submodule for you.

Result: `./build/splitgba`

## Usage

**Easiest: run without arguments** — a launcher screen opens where you pick
a ROM per player (from the `roms/` directory), set the player count (1–4)
and enter names. The selection is remembered for next time.

```bash
./build/splitgba
```

Or directly from the command line:

```bash
# Four different cartridges (e.g. for trading between versions):
./build/splitgba -f firered.gba leafgreen.gba ruby.gba emerald.gba

# Four copies of the same game — race mode! Each player gets their own save:
./build/splitgba -f -n 4 firered.gba

# Load up to four .gba files from a directory (alphabetical):
./build/splitgba -f roms/
```

`-f` starts fullscreen — that is what you want on a TV.

| Option | Effect |
|---|---|
| `-f`, `--fullscreen` | start fullscreen |
| `-n <1-4>` | run one ROM multiple times (separate save per player) |
| `--speed <1-4>` | initial emulation speed |
| `--no-link` | disable the link cable |
| `--smooth` | smooth scaling instead of crisp integer pixels |
| `--mute` | start without audio |

### Settings menu (`Esc`)

`Esc` opens an in-app menu (auto-pauses all games), navigable with the
keyboard **or** any controller (d-pad + A/B):

- **Player names** (shown in each player's split-screen label)
- **Per-player volume** (0–150 %) plus a global mute
- **Timer modes**: off / stopwatch / **countdown** with configurable
  duration (1–120 min; it stops at zero and shows "ZEIT!")
- Speed, HUD, smoothing, fullscreen, quit
- **Controls overview**: every keyboard and controller binding on one page

All settings persist in `~/.config/splitgba.ini`.

### Hotkeys

| Key | Function |
|---|---|
| `Esc` | open / close the settings menu |
| `1`–`4` / `F1`–`F4` | speed 1x / 2x / 3x / 4x (all players) |
| `Tab` (hold) | turbo 4x while held |
| `Space` | start / stop the timer |
| `R` | reset timer to zero |
| `Shift`+`R` | **hard-reset all games** + reset timer (race start) |
| `P` | pause all |
| `M` | toggle mute |
| `F5` / `F9` | save / load a savestate for all players at once |
| `F` | toggle fullscreen |
| `H` | toggle HUD |

Quit via the menu (`Esc` → "SplitGBA beenden") or `Cmd`+`Q`.

### Controllers

Plug in (USB or Bluetooth) and play — SDL's built-in mappings cover Xbox,
PlayStation, Switch Pro, 8BitDo and most others. **Connection order = player
order**; hotplugging during play works. Shoulder buttons are L/R,
Start/Menu is Start, Select/Share is Select, d-pad or left stick moves.

Player 1 can alternatively use the keyboard: arrow keys, `X` = A,
`Z`/`Y` = B, `A` = L, `S` = R, `Enter` = Start, `Backspace` = Select.

If a `gamecontrollerdb.txt`
([SDL community database](https://github.com/mdqinc/SDL_GameControllerDB))
is present in the working directory it is loaded automatically.

Nintendo Switch Pro Controllers are supported natively through SDL's HIDAPI
driver, over USB-C or Bluetooth, no extra files needed. Button labels are
respected: the button labeled **A acts as GBA A**. Run
`./build/splitgba --list-pads` to quickly check that all controllers are
detected, and `./build/splitgba roms-test/` for a full input test — each
panel flashes white while a button is held on its controller.

### Trading and battling (Pokémon)

The link cable is always connected unless you pass `--no-link`. In-game,
use the **Cable Club** on the upper floor of any Pokémon Center, exactly as
on real hardware. The usual cartridge rules apply: Gen III games
(Ruby/Sapphire/Emerald/FireRed/LeafGreen) link with each other;
FireRed/LeafGreen need the National Dex before trading with Ruby/Sapphire.

**The one rule that matters: player 1 must take part in every trade or
battle.** In GBA multiplayer mode only player 1 (top-left panel) clocks
the bus — exactly like the "parent" unit on a real link cable. If, say,
players 2 and 3 enter the Cable Club while player 1 stays outside, no
connection can be established. The HUD and the link row in the settings
menu show live who is in link mode and warn when player 1 is missing.

Practical tips:

- Cleanest trade setup: launch just the two participants (player 1 +
  partner), trade, then relaunch with four players.
- Drop to **1x speed** for trades and battles — most stable.
- Don't load savestates in the middle of a link transfer. If a link ever
  gets stuck, `Shift`+`R` resets all games cleanly.

### Race mode

1. `./build/splitgba -f -n 4 game.gba`
2. Everyone ready? `Shift`+`R` — all four games reboot in sync.
3. `Space` starts the shared timer.
4. Agree on a speed (`2` makes long grinds bearable) — it always applies to
   everyone, so nobody gets an unfair fast-forward.

## Trying it without games

The repository ships a generator for tiny homebrew test ROMs (hand-assembled
ARM, each just a colored screen that flashes white on button presses —
handy for checking layout and input assignment):

```bash
python3 tools/make_test_rom.py
./build/splitgba roms-test/
```

For development there are two headless flags: `--screenshot out.bmp
[--frames N]` renders N frames and writes an image, `--exit-after N` quits
after N seconds and prints per-player frame counts (useful for verifying
pacing: at 1x you should see ~60 fps per player, at 4x ~240).

## Legal

SplitGBA contains **no games** and downloads none. Use only ROM files you
dumped from cartridges you own. Nintendo, Game Boy Advance and Pokémon are
trademarks of their respective owners; this project is not affiliated with
or endorsed by them in any way.

SplitGBA's own code is licensed under the [MIT License](LICENSE). The
embedded mGBA core (`third_party/mgba`, git submodule) is licensed under the
Mozilla Public License 2.0 — full credit to [endrift and the mGBA
contributors](https://github.com/mgba-emu/mgba); this tool is a thin
frontend on top of their excellent work.
