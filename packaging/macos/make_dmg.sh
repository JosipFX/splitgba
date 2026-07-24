#!/bin/sh
# Baut das macOS-Release: universelles Binary (arm64 + x86_64) mit statischem
# SDL2, verpackt als SplitGBA.app in einer .dmg. Ergebnis: dist/SplitGBA-<v>-macos.dmg
set -e
cd "$(dirname "$0")/../.."

VERSION=$(sed -nE 's/^project\(splitgba VERSION ([0-9.]+).*/\1/p' CMakeLists.txt)

cmake -S . -B build-release -DCMAKE_BUILD_TYPE=Release -DVENDOR_SDL2=ON \
	-DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build build-release -j "$(sysctl -n hw.ncpu)"

APP=dist/SplitGBA.app
rm -rf dist
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build-release/splitgba "$APP/Contents/MacOS/splitgba"
cp packaging/icons/splitgba.icns "$APP/Contents/Resources/splitgba.icns"
sed "s/@VERSION@/$VERSION/g" packaging/macos/Info.plist > "$APP/Contents/Info.plist"

# Ad-hoc-Signatur (keine Apple-Developer-ID noetig; Gatekeeper-Hinweis siehe README)
codesign --force -s - "$APP"

ln -s /Applications dist/Applications
cat > dist/LIESMICH.txt <<'EOF'
SplitGBA — 4-Spieler-Splitscreen-GBA-Emulator mit Link-Kabel

1. SplitGBA.app in den Ordner "Applications" ziehen.
2. Eigene ROM-Dumps (.gba) in den Ordner "SplitGBA" im Benutzerordner legen
   (wird beim ersten Start angelegt bzw. einfach selbst anlegen).
3. Beim ersten Start: Rechtsklick auf die App -> "Oeffnen" (unsignierte
   Open-Source-App, macOS fragt einmal nach).

Anleitung & Quellcode: https://github.com/JosipFX/splitgba
EOF

hdiutil create -volname "SplitGBA" -srcfolder dist -ov -format UDZO \
	"dist/SplitGBA-$VERSION-macos.dmg"
echo "Fertig: dist/SplitGBA-$VERSION-macos.dmg"
