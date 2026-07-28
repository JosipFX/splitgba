#!/usr/bin/env python3
"""Erzeugt docs/de.html aus docs/index.html per Textersetzung.

Nach jeder Aenderung an index.html ausfuehren, damit die deutsche Seite
Design und Struktur automatisch uebernimmt. Nicht gefundene Quelltexte
werden gemeldet (dann ist die Tabelle zu aktualisieren).
"""
import os
import sys

TR = [
    ('<html lang="en">', '<html lang="de">'),
    ('<title>SplitGBA · Up to 4 friends. One screen.</title>',
     '<title>SplitGBA · Bis zu 4 Freunde. Ein Bildschirm.</title>'),
    ('content="Split screen couch multiplayer for the Game Boy Advance. Up to four games side by side on one TV, with racing, trading and a shared speed control. Open source for macOS, Windows and Linux."',
     'content="Splitscreen Couch-Multiplayer für den Game Boy Advance. Bis zu vier Spiele nebeneinander auf einem TV, mit Races, Tausch und gemeinsamem Tempo. Open Source für macOS, Windows und Linux."'),
    ('<link rel="alternate" hreflang="de" href="de.html">',
     '<link rel="alternate" hreflang="en" href="index.html">'),
    ('<a href="#screenshots">Screenshots</a>\n\t\t<a href="#link">Link Guide</a>\n\t\t<a href="#get-started">Get Started</a>',
     '<a href="#screenshots">Screenshots</a>\n\t\t<a href="#link">Link-Guide</a>\n\t\t<a href="#get-started">Loslegen</a>'),
    ('</svg>EN</summary>', '</svg>DE</summary>'),
    ('<a role="menuitem" href="index.html">English <span class="on">✓</span></a>\n\t\t\t\t<a role="menuitem" href="de.html">Deutsch</a>',
     '<a role="menuitem" href="index.html">English</a>\n\t\t\t\t<a role="menuitem" href="de.html">Deutsch <span class="on">✓</span></a>'),
    ('UP TO 4 FRIENDS. ONE SCREEN.', 'BIS ZU 4 FREUNDE. EIN SCREEN.'),
    ('Split screen couch multiplayer for the Game Boy Advance.\n\t\tBring the controllers, pile onto the sofa and play together like it is 2004:\n\t\trace the same save, explore side by side, trade when you need to.',
     'Splitscreen Couch-Multiplayer für den Game Boy Advance.\n\t\tController einstecken, aufs Sofa setzen und zusammen spielen wie 2004:\n\t\tum die Wette leveln, nebeneinander erkunden, tauschen wenn es sein muss.'),
    ('macOS (Apple Silicon and Intel) · Windows 64-bit installer or portable ·\n\t\tLinux AppImage or tar.gz. Fully self contained, nothing else to install.',
     'macOS (Apple Silicon und Intel) · Windows 64-bit Installer oder portabel ·\n\t\tLinux AppImage oder tar.gz. Komplett eigenständig, nichts weiter zu installieren.'),
    ('<b>LIVE DEMO</b> · four linked instances, recorded in real time on Apple Silicon',
     '<b>LIVE-DEMO</b> · vier verlinkte Instanzen, in Echtzeit aufgenommen auf Apple Silicon'),
    ('// BUILT FOR GAME NIGHT', '// GEBAUT FUER SPIELEABENDE'),
    ("Everything you need to put four Game Boys on one television, and nothing you don't.",
     'Alles, was vier Game Boys auf einen Fernseher bringt. Und nichts darüber hinaus.'),
    ('<h3>1 to 4 players, one screen</h3>', '<h3>1 bis 4 Spieler, ein Bildschirm</h3>'),
    ('<p>Frame perfect split screen. Xbox, PlayStation, Switch Pro and 8BitDo pads work\n\t\tout of the box: hotplug them or assign per player in the menu. Player 1 can use\n\t\tthe keyboard.</p>',
     '<p>Framegenauer Splitscreen. Xbox, PlayStation, Switch Pro und 8BitDo funktionieren\n\t\tsofort: einfach einstecken oder im Menü pro Spieler zuweisen. Spieler 1 kann\n\t\tauch die Tastatur nutzen.</p>'),
    ('<h3>Link cable built in</h3>', '<h3>Link-Kabel eingebaut</h3>'),
    ('<p>All instances share an emulated 4 player link bus. Trading and battling work\n\t\texactly like on hardware, with live link status in the HUD.</p>',
     '<p>Alle Instanzen hängen am emulierten 4-Spieler-Link. Tauschen und Kämpfen\n\t\tfunktioniert wie auf echter Hardware, mit Live-Status im HUD.</p>'),
    ('<h3>Race mode</h3>', '<h3>Race-Modus</h3>'),
    ('<p>One hotkey resets every game in sync. A stopwatch or countdown runs big on\n\t\tscreen. Who gets furthest in 30 minutes?</p>',
     '<p>Ein Hotkey startet alle Spiele synchron neu. Stoppuhr oder Countdown laufen\n\t\tgross im Bild. Wer kommt in 30 Minuten am weitesten?</p>'),
    ('<h3>Global speed 1x to 4x</h3>', '<h3>Tempo 1x bis 4x für alle</h3>'),
    ('<p>One key press fast forwards everyone at once. Grinding gets bearable and\n\t\tnobody can secretly speed ahead.</p>',
     '<p>Ein Tastendruck beschleunigt alle gleichzeitig. Grinden wird erträglich und\n\t\tniemand kann heimlich vorspulen.</p>'),
    ('<h3>Save states for all</h3>', '<h3>Savestates für alle</h3>'),
    ('<p>F5 snapshots all four games at the same moment, F9 restores them. Separate\n\t\tcartridge saves per player, even with one shared ROM.</p>',
     '<p>F5 sichert alle vier Spiele im selben Moment, F9 lädt sie zurück. Eigene\n\t\tSpielstände pro Spieler, auch mit nur einem ROM.</p>'),
    ('<h3>English and German</h3>', '<h3>Deutsch und Englisch</h3>'),
    ('<p>Launcher, menus and the controls overview ship in English by default and\n\t\tswitch to German live from the settings. Everything persists.</p>',
     '<p>Launcher, Menüs und Steuerungs-Übersicht starten auf Englisch und lassen sich\n\t\tin den Einstellungen live auf Deutsch umschalten. Alles wird gespeichert.</p>'),
    ('Click any image to enlarge. Shown with the freely distributable\n\thomebrew <a href="https://www.bitethechili.com/anguna">Anguna</a>; bring your own\n\tcartridge dumps for the real thing.',
     'Bilder anklicken zum Vergrössern. Gezeigt mit der frei erhältlichen\n\tHomebrew <a href="https://www.bitethechili.com/anguna">Anguna</a>; für den Ernstfall\n\tbringt ihr eure eigenen Modul-Dumps mit.'),
    ('data-cap="Four instances, one screen. Each player keeps their own save file."',
     'data-cap="Vier Instanzen, ein Bildschirm. Jeder Spieler behält seinen eigenen Spielstand."'),
    ('<figcaption>Four instances, one screen. Each player keeps their own save file.</figcaption>',
     '<figcaption>Vier Instanzen, ein Bildschirm. Jeder mit eigenem Spielstand.</figcaption>'),
    ('data-cap="The launcher: pick a ROM per player, set the player count, enter names."',
     'data-cap="Das Startmenü: ROM pro Spieler, Spielerzahl, Namen."'),
    ('<figcaption>The launcher: ROM per player, player count, names.</figcaption>',
     '<figcaption>Das Startmenü: ROM pro Spieler, Spielerzahl, Namen.</figcaption>'),
    ('data-cap="In game settings: names, per player volume, timer modes, save states."',
     'data-cap="Einstellungen im Spiel: Namen, Lautstärke pro Spieler, Timer, Savestates."'),
    ('<figcaption>In game settings: names, volume, timers, save states.</figcaption>',
     '<figcaption>Einstellungen: Namen, Lautstärke, Timer, Savestates.</figcaption>'),
    ('data-cap="Assign controllers: pick a player, press a button on the pad. Done."',
     'data-cap="Controller zuweisen: Spieler wählen, Knopf drücken. Fertig."'),
    ('<figcaption>Assign controllers: pick a player, press a button.</figcaption>',
     '<figcaption>Controller zuweisen: Spieler wählen, Knopf drücken.</figcaption>'),
    ('data-cap="With three players the free quadrant becomes a big race timer."',
     'data-cap="Bei drei Spielern wird die freie Ecke zum grossen Race-Timer."'),
    ('<figcaption>Three players? The free quadrant becomes the race timer.</figcaption>',
     '<figcaption>Drei Spieler? Die freie Ecke wird zum Race-Timer.</figcaption>'),
    ('// LINK GUIDE', '// LINK-GUIDE'),
    ('The link behaves exactly like the real 4 player adapter, including its one golden rule.',
     'Der Link verhält sich exakt wie der echte 4-Spieler-Adapter, inklusive seiner goldenen Regel.'),
    ('<li><strong>Player 1 must take part in every trade or battle.</strong> Just like the\n\t\tparent unit on real hardware, only player 1 clocks the bus. The HUD shows live who\n\t\tis in link mode and warns when player 1 is missing.</li>',
     '<li><strong>Spieler 1 muss bei jedem Tausch oder Kampf dabei sein.</strong> Wie das\n\t\tParent-Gerät am echten Kabel taktet nur Spieler 1 den Bus. Das HUD zeigt live, wer\n\t\tim Link-Modus ist, und warnt, wenn Spieler 1 fehlt.</li>'),
    ('<li>Both players walk into the in game <strong>Cable Club</strong> (upstairs in any\n\t\tPokémon Center) at the same time.</li>',
     '<li>Beide Spieler gehen im Spiel gleichzeitig in den <strong>Kabelclub</strong>\n\t\t(obere Etage im Pokémon-Center).</li>'),
    ('<li>Switch to <strong>1x speed</strong> for trades. The cleanest setup is launching\n\t\tjust the two participants.</li>',
     '<li>Zum Tauschen auf <strong>Tempo 1x</strong> schalten. Am saubersten: nur die\n\t\tzwei Beteiligten starten.</li>'),
    ('<li>Generation 3 rules still apply: FireRed and LeafGreen need the National Dex\n\t\tto trade with Ruby, Sapphire or Emerald.</li>',
     '<li>Gen-3-Regeln gelten weiter: Feuerrot und Blattgrün brauchen den Nationaldex\n\t\tfür den Tausch mit Rubin, Saphir oder Smaragd.</li>'),
    ('// GET STARTED', '// LOSLEGEN'),
    ('No dependencies and no setup wizard. Download, drop your ROMs, play.',
     'Keine Abhängigkeiten, kein Setup-Assistent. Herunterladen, ROMs ablegen, spielen.'),
    ('<h3>Download and install</h3>', '<h3>Herunterladen und installieren</h3>'),
    ('<p>Grab the <a href="https://github.com/JosipFX/splitgba/releases/latest">latest release</a>\n\t\tfor your platform. On macOS: right click, then Open on first launch (unsigned open source app).</p>',
     '<p>Das <a href="https://github.com/JosipFX/splitgba/releases/latest">neueste Release</a>\n\t\tfür deine Plattform laden. Auf macOS beim ersten Start: Rechtsklick, dann Öffnen (unsignierte Open-Source-App).</p>'),
    ('<h3>Add your games</h3>', '<h3>Spiele hinzufügen</h3>'),
    ('<p>Put <code>.gba</code> files dumped from your own cartridges into a\n\t\t<code>roms/</code> folder or <code>SplitGBA/</code> in your home directory.</p>',
     '<p><code>.gba</code>-Dateien von euren eigenen Modulen in einen Ordner\n\t\t<code>roms/</code> oder <code>SplitGBA/</code> im Benutzerordner legen.</p>'),
    ('<h3>Press start</h3>', '<h3>Start drücken</h3>'),
    ('<p>The launcher opens automatically: pick games, set the player count, plug in\n\t\tcontrollers, go. Press <code>F</code> for fullscreen on the TV.</p>',
     '<p>Das Startmenü öffnet sich automatisch: Spiele wählen, Spielerzahl setzen,\n\t\tController einstecken, los. <code>F</code> für Vollbild am TV.</p>'),
    ('<span class="c"># prefer building from source?</span>', '<span class="c"># lieber selbst bauen?</span>'),
    ('<span class="c"># opens the launcher</span>', '<span class="c"># öffnet das Startmenü</span>'),
    ('// LEGAL', '// RECHTLICHES'),
    ('SplitGBA ships no games and downloads none. Use only ROM files dumped from\n\tcartridges you own, for example with a GB&nbsp;Operator. Nintendo, Game Boy Advance and\n\tPokémon are trademarks of their respective owners; this project is not affiliated with\n\tor endorsed by them. A generator for free test ROMs is included, and homebrew like\n\tAnguna is freely available for trying things out.',
     'SplitGBA enthält keine Spiele und lädt keine herunter. Verwendet nur ROM-Dateien\n\tvon Modulen, die euch gehören, zum Beispiel per GB&nbsp;Operator gesichert. Nintendo,\n\tGame Boy Advance und Pokémon sind Marken ihrer jeweiligen Inhaber; dieses Projekt steht\n\tin keiner Verbindung zu ihnen. Ein Generator für freie Test-ROMs liegt bei, und Homebrew\n\twie Anguna ist gratis erhältlich.'),
    ('MIT licensed</a> ·\n\tbuilt on the excellent <a href="https://mgba.io">mGBA</a> core (MPL-2.0) ·\n\t100% open source',
     'MIT-lizenziert</a> ·\n\tbaut auf dem grossartigen <a href="https://mgba.io">mGBA</a>-Core auf (MPL-2.0) ·\n\t100% Open Source'),
]


def main():
    root = os.path.join(os.path.dirname(__file__), "..", "docs")
    src = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    missed = []
    for a, b in TR:
        if a not in src:
            missed.append(a[:70])
        src = src.replace(a, b)
    open(os.path.join(root, "de.html"), "w", encoding="utf-8").write(src)
    print(f"docs/de.html geschrieben, {len(missed)} Eintraege nicht gefunden")
    for m in missed:
        print("  FEHLT:", m)
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
