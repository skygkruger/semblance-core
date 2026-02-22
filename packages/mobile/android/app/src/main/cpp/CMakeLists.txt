# CMakeLists.txt — NDK build configuration for Semblance llama.cpp JNI bridge.
#
# Fetches llama.cpp from GitHub at build time and links it as a static library.
# The JNI bridge exposes model loading, generation, embedding, and memory management.

cmake_minimum_required(VERSION 3.22.1)

project("semblance_llama" LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ─── Fetch llama.cpp ──────────────────────────────────────────────────────────

include(FetchContent)

FetchContent_Declare(
    llama_cpp
    GIT_REPOSITORY https://github.com/ggerganov/llama.cpp.git
    GIT_TAG        b4568
    GIT_SHALLOW    TRUE
)

# Configure llama.cpp build options for Android
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)  # Enable if Vulkan NDK support needed
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)  # OpenMP not well supported on Android NDK

FetchContent_MakeAvailable(llama_cpp)

# ─── JNI Bridge Library ───────────────────────────────────────────────────────

add_library(
    semblance_llama
    SHARED
    semblance_llama_jni.cpp
)

target_include_directories(
    semblance_llama
    PRIVATE
    ${llama_cpp_SOURCE_DIR}/include
    ${llama_cpp_SOURCE_DIR}/ggml/include
)

target_link_libraries(
    semblance_llama
    PRIVATE
    llama
    ggml
    log
)

# Strip debug symbols in release for smaller APK
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set_target_properties(semblance_llama PROPERTIES LINK_FLAGS "-s")
endif()
