#!/bin/sh
# Baut SplitGBA (Release). Ergebnis: build/splitgba
set -e
cd "$(dirname "$0")"

# mGBA-Submodule nachladen, falls ohne --recursive geklont wurde
if [ ! -f third_party/mgba/CMakeLists.txt ]; then
	git submodule update --init --depth 1 third_party/mgba
fi

cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
echo
echo "Fertig: ./build/splitgba"
