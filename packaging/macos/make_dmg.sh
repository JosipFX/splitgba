#!/bin/sh
# Baut das macOS-Release: universelles Binary (arm64 + x86_64) mit statischem
# SDL2, verpackt als SplitEmu.app in einer .dmg. Ergebnis: dist/SplitEmu-<v>-macos.dmg
set -e
cd "$(dirname "$0")/../.."

VERSION=$(sed -nE 's/^project\(splitemu VERSION ([0-9.]+).*/\1/p' CMakeLists.txt)

cmake -S . -B build-release -DCMAKE_BUILD_TYPE=Release -DVENDOR_SDL2=ON \
	-DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build build-release -j "$(sysctl -n hw.ncpu)"

APP=dist/SplitEmu.app
rm -rf dist
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build-release/splitemu "$APP/Contents/MacOS/splitemu"
cp packaging/icons/splitemu.icns "$APP/Contents/Resources/splitemu.icns"
sed "s/@VERSION@/$VERSION/g" packaging/macos/Info.plist > "$APP/Contents/Info.plist"

# Ad-hoc-Signatur (keine Apple-Developer-ID noetig; Gatekeeper-Hinweis siehe README)
codesign --force -s - "$APP"

ln -s /Applications dist/Applications
cat > dist/LIESMICH.txt <<'EOF'
SplitEmu — 4-Spieler-Splitscreen-GBA-Emulator mit Link-Kabel

1. SplitEmu.app in den Ordner "Applications" ziehen.
2. Eigene ROM-Dumps (.gba) in den Ordner "SplitEmu" im Benutzerordner legen
   (wird beim ersten Start angelegt bzw. einfach selbst anlegen).
3. Beim ersten Start: Rechtsklick auf die App -> "Oeffnen" (unsignierte
   Open-Source-App, macOS fragt einmal nach).

Anleitung & Quellcode: https://github.com/JosipFX/splitemu
EOF

hdiutil create -volname "SplitEmu" -srcfolder dist -ov -format UDZO \
	"dist/SplitEmu-$VERSION-macos.dmg"
echo "Fertig: dist/SplitEmu-$VERSION-macos.dmg"
