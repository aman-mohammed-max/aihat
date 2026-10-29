cmake_minimum_required(VERSION 3.13)
project(aihatphonon CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# The JNI glue around the Phonon-2 engine. The engine itself (jniLibs/arm64-v8a) is opened with dlopen at run time,
# in the tier this processor supports, so nothing links against it here.
add_library(aihatphonon SHARED src/main/cpp/phonon_jni.cpp)
target_compile_options(aihatphonon PRIVATE -O3 -fvisibility=hidden -Wall)
target_link_libraries(aihatphonon PRIVATE dl)
target_link_options(aihatphonon PRIVATE "-Wl,-z,max-page-size=16384")
