cmake_minimum_required(VERSION 3.20)
project(splitgba C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
	set(CMAKE_BUILD_TYPE Release)
endif()

# libmgba als eingebettete statische Bibliothek (EXCLUDE_FROM_ALL aktiviert
# in mGBAs CMake automatisch LIBMGBA_ONLY: keine Frontends, keine Extras).
add_subdirectory(third_party/mgba EXCLUDE_FROM_ALL)

find_package(SDL2 REQUIRED CONFIG)

add_executable(splitgba src/main.cpp)

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
target_compile_definitions(splitgba PRIVATE USE_PTHREADS)

target_link_libraries(splitgba PRIVATE mgba SDL2::SDL2)
