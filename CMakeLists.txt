cmake_minimum_required(VERSION 3.20)
project(splitgba VERSION 0.3.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
	set(CMAKE_BUILD_TYPE Release)
endif()

# Fuer Release-Pakete: SDL2 aus dem Quellcode statisch mitbauen, damit die
# Binaries ohne installierte Abhaengigkeiten laufen.
option(VENDOR_SDL2 "SDL2 statisch mitbauen (fuer eigenstaendige Release-Builds)" OFF)

# mGBA 0.10.x deklariert eine sehr alte CMake-Mindestversion; ab CMake 4
# braucht es diese Freigabe, um weiterhin konfiguriert werden zu koennen.
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# libmgba als eingebettete statische Bibliothek (EXCLUDE_FROM_ALL aktiviert
# in mGBAs CMake automatisch LIBMGBA_ONLY: keine Frontends, keine Extras).
add_subdirectory(third_party/mgba EXCLUDE_FROM_ALL)

if(VENDOR_SDL2)
	include(FetchContent)
	set(SDL_SHARED OFF CACHE BOOL "" FORCE)
	set(SDL_STATIC ON CACHE BOOL "" FORCE)
	set(SDL_TEST OFF CACHE BOOL "" FORCE)
	set(SDL2_DISABLE_INSTALL ON CACHE BOOL "" FORCE)
	FetchContent_Declare(SDL2
		GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
		GIT_TAG release-2.30.9
		GIT_SHALLOW TRUE
	)
	FetchContent_MakeAvailable(SDL2)
	set(SPLITGBA_SDL_TARGETS SDL2::SDL2-static SDL2::SDL2main)
else()
	find_package(SDL2 REQUIRED CONFIG)
	set(SPLITGBA_SDL_TARGETS SDL2::SDL2)
endif()

add_executable(splitgba src/main.cpp)

if(WIN32)
	# GUI-Anwendung ohne Konsolenfenster; SDL2main liefert den Einstiegspunkt
	set_target_properties(splitgba PROPERTIES WIN32_EXECUTABLE TRUE)
	# App-Icon in die .exe einbetten
	set(SPLITGBA_ICON_PATH ${CMAKE_CURRENT_SOURCE_DIR}/packaging/icons/icon.ico)
	configure_file(packaging/windows/splitgba.rc.in ${CMAKE_CURRENT_BINARY_DIR}/splitgba.rc @ONLY)
	target_sources(splitgba PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/splitgba.rc)
endif()

target_include_directories(splitgba PRIVATE
	${CMAKE_CURRENT_SOURCE_DIR}/third_party/mgba/include
	${CMAKE_CURRENT_BINARY_DIR}/third_party/mgba/include
)

# Header-Layouts (Threading, Farbformat, optionale Felder) muessen exakt zur
# gebauten Bibliothek passen — deshalb die Defines des mgba-Targets spiegeln.
get_target_property(MGBA_COMPILE_DEFS mgba COMPILE_DEFINITIONS)
if(MGBA_COMPILE_DEFS)
	target_compile_definitions(splitgba PRIVATE ${MGBA_COMPILE_DEFS})
endif()
if(WIN32)
	# entspricht mGBAs MinGW-Defines (Header-Kompatibilitaet)
	target_compile_definitions(splitgba PRIVATE _WIN32_WINNT=0x0600 _GNU_SOURCE)
else()
	target_compile_definitions(splitgba PRIVATE USE_PTHREADS)
endif()
target_compile_definitions(splitgba PRIVATE SPLITGBA_VERSION="${PROJECT_VERSION}")

target_link_libraries(splitgba PRIVATE mgba ${SPLITGBA_SDL_TARGETS})

if(WIN32)
	# mgba (statisch) braucht diese System-Bibliotheken; bei MinGW zusaetzlich
	# die Runtime statisch linken, damit die .exe ohne DLLs laeuft.
	target_link_libraries(splitgba PRIVATE ws2_32 shlwapi)
	if(MINGW)
		target_link_options(splitgba PRIVATE -static)
	endif()
endif()
