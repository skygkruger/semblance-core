// build.rs — Compiles BitNet.cpp (llama.cpp fork with 1-bit kernels) via CMake.
//
// BitNet.cpp requires Clang (MSVC cannot compile the TL1/TL2 kernels).
// On Windows we use the Visual Studio generator with -T ClangCL toolset.
// On macOS/Linux, the system Clang or GCC is used automatically.
//
// The build produces two static libraries:
//   - llama (main inference library)
//   - ggml  (tensor operations, includes BitNet kernel dispatch)

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let bitnet_dir = manifest_dir
        .join("..")
        .join("..")
        .join("3rdparty")
        .join("BitNet");

    // Verify submodule is checked out
    if !bitnet_dir.join("CMakeLists.txt").exists() {
        panic!(
            "BitNet.cpp submodule not found at {:?}. Run: git submodule update --init --recursive",
            bitnet_dir
        );
    }
    if !bitnet_dir
        .join("3rdparty")
        .join("llama.cpp")
        .join("CMakeLists.txt")
        .exists()
    {
        panic!(
            "BitNet.cpp nested llama.cpp submodule not initialized. Run: \
             cd {:?} && git submodule update --init --depth 1 3rdparty/llama.cpp",
            bitnet_dir
        );
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let build_dir = out_dir.join("bitnet-build");
    let install_dir = out_dir.join("bitnet-install");
    fs::create_dir_all(&build_dir).expect("Failed to create build directory");
    fs::create_dir_all(&install_dir).expect("Failed to create install directory");

    let target = env::var("TARGET").unwrap();

    // ── CMake Configure ──────────────────────────────────────────────────────

    let mut configure = Command::new("cmake");
    configure
        .current_dir(&build_dir)
        .arg(dunce_canonicalize(&bitnet_dir))
        .arg(format!("-DCMAKE_INSTALL_PREFIX={}", dunce_canonicalize(&install_dir)))
        .arg("-DBUILD_SHARED_LIBS=OFF")
        .arg("-DLLAMA_BUILD_TESTS=OFF")
        .arg("-DLLAMA_BUILD_EXAMPLES=OFF")
        .arg("-DLLAMA_BUILD_SERVER=OFF")
        .arg("-DLLAMA_BUILD_COMMON=OFF")
        .arg("-DGGML_BUILD_TESTS=OFF")
        .arg("-DGGML_BUILD_EXAMPLES=OFF")
        .arg("-DGGML_OPENMP=OFF")
        .arg("-DGGML_VULKAN=OFF")
        .arg("-DGGML_CUDA=OFF")
        .arg("-DGGML_RPC=OFF");

    // BitNet kernel selection.
    //
    // BitNet.cpp provides three kernel paths for i2_s quantized models:
    //   1. MAD (multiply-accumulate-dot) — generic, works for ALL i2_s models
    //   2. TL1 (ARM NEON + dotprod) — LUT-based, model-specific dimensions
    //   3. TL2 (x86 AVX2/AVX512) — LUT-based, model-specific dimensions
    //
    // TL1/TL2 LUT kernels require pre-computed lookup tables in `bitnet-lut-kernels.h`.
    // Each model has different matrix dimensions, so the kernel code is model-specific.
    // The `preset_kernels/` directory only covers 3 models; our catalog has 8.
    //
    // DESIGN DECISION: Use MAD kernels for multi-model support. MAD handles all i2_s
    // models generically without per-model LUT headers. LUT optimization can be added
    // per-model at download time by generating headers via `python utils/generate-lut.py`.
    //
    // This is NOT the same as "no BitNet kernels" — MAD IS a BitNet.cpp kernel. It
    // provides correct 1-bit inference, just without the extra LUT speedup (~1.5-2x).
    //
    // IMPORTANT: Explicitly set both OFF to override any CMake cache from prior builds.
    configure.arg("-DBITNET_X86_TL2=OFF");
    configure.arg("-DBITNET_ARM_TL1=OFF");
    configure.arg("-DGGML_BITNET_X86_TL2=OFF");
    configure.arg("-DGGML_BITNET_ARM_TL1=OFF");

    if target.contains("x86_64") || target.contains("x86") {
        eprintln!("[bitnet-sys] x86_64 target: using MAD kernels (TL2 LUT deferred — requires per-model headers)");
    } else if target.contains("aarch64") || target.contains("arm") {
        eprintln!("[bitnet-sys] ARM target: using MAD kernels (TL1 LUT deferred — requires per-model headers)");
    } else {
        eprintln!("[bitnet-sys] Unknown arch: using MAD kernels");
    }

    if target.contains("windows") {
        // Use Visual Studio generator with ClangCL toolset
        // BitNet kernels REQUIRE Clang — MSVC will fail with FATAL_ERROR
        configure.arg("-T").arg("ClangCL");
        configure.arg("-DCMAKE_BUILD_TYPE=Release");
        eprintln!("[bitnet-sys] Windows build: using ClangCL toolset");
    } else if target.contains("apple") {
        configure.arg("-DCMAKE_BUILD_TYPE=Release");
        // Metal is auto-detected on macOS
    } else {
        configure.arg("-DCMAKE_BUILD_TYPE=Release");
    }

    eprintln!("[bitnet-sys] Running cmake configure...");
    let output = configure.output().expect("Failed to run cmake");
    if !output.status.success() {
        eprintln!(
            "[bitnet-sys] cmake configure STDOUT:\n{}",
            String::from_utf8_lossy(&output.stdout)
        );
        eprintln!(
            "[bitnet-sys] cmake configure STDERR:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
        panic!("cmake configure failed with status: {}", output.status);
    }
    eprintln!("[bitnet-sys] cmake configure OK");

    // ── CMake Build ──────────────────────────────────────────────────────────

    // Build ONLY the ggml and llama targets (skip examples, server, common).
    // BitNet's CMakeLists.txt forces LLAMA_BUILD_SERVER=ON which pulls in
    // common.cpp that has C++ standard issues with ClangCL.
    eprintln!("[bitnet-sys] Running cmake build (targets: ggml, llama)...");
    let output = Command::new("cmake")
        .current_dir(&build_dir)
        .arg("--build")
        .arg(".")
        .arg("--config")
        .arg("Release")
        .arg("--target")
        .arg("ggml")
        .arg("--target")
        .arg("llama")
        .arg("--parallel")
        .output()
        .expect("Failed to run cmake build");

    if !output.status.success() {
        eprintln!(
            "[bitnet-sys] cmake build STDOUT:\n{}",
            String::from_utf8_lossy(&output.stdout)
        );
        eprintln!(
            "[bitnet-sys] cmake build STDERR:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
        panic!("cmake build failed with status: {}", output.status);
    }
    eprintln!("[bitnet-sys] cmake build OK");

    // ── CMake Install ────────────────────────────────────────────────────────

    eprintln!("[bitnet-sys] Running cmake install...");
    let output = Command::new("cmake")
        .current_dir(&build_dir)
        .arg("--install")
        .arg(".")
        .arg("--config")
        .arg("Release")
        .output()
        .expect("Failed to run cmake install");

    if !output.status.success() {
        // Install might partially fail (server target etc.) — check if libs exist
        eprintln!(
            "[bitnet-sys] cmake install warning (may be partial):\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // ── Link Libraries ───────────────────────────────────────────────────────

    // Find library files in install dir and build dir
    let lib_search_dirs = vec![
        install_dir.join("lib"),
        install_dir.join("lib64"),
        build_dir.join("lib"),
        build_dir.join("lib64"),
        // MSVC puts Release builds in subdirectories
        build_dir.join("3rdparty").join("llama.cpp").join("src").join("Release"),
        build_dir.join("3rdparty").join("llama.cpp").join("ggml").join("src").join("Release"),
        build_dir.join("src").join("Release"),
        // Non-MSVC paths
        build_dir.join("3rdparty").join("llama.cpp").join("src"),
        build_dir.join("3rdparty").join("llama.cpp").join("ggml").join("src"),
        build_dir.join("src"),
    ];

    let mut found_llama = false;
    let mut found_ggml = false;

    for dir in &lib_search_dirs {
        if dir.exists() {
            println!("cargo:rustc-link-search=native={}", dunce_canonicalize(dir));
            // Check what we found
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.contains("llama") && (name.ends_with(".lib") || name.ends_with(".a")) {
                        found_llama = true;
                        eprintln!("[bitnet-sys] Found llama lib: {}/{}", dir.display(), name);
                    }
                    if name.contains("ggml") && (name.ends_with(".lib") || name.ends_with(".a")) {
                        found_ggml = true;
                        eprintln!("[bitnet-sys] Found ggml lib: {}/{}", dir.display(), name);
                    }
                }
            }
        }
    }

    if !found_llama {
        panic!("[bitnet-sys] Could not find llama static library in any search path");
    }
    if !found_ggml {
        panic!("[bitnet-sys] Could not find ggml static library in any search path");
    }

    // Link the core libraries
    println!("cargo:rustc-link-lib=static=llama");
    println!("cargo:rustc-link-lib=static=ggml");

    // ── System Dependencies ──────────────────────────────────────────────────

    if target.contains("windows") {
        // C++ standard library (clang-cl links against MSVC CRT)
        // These are typically linked automatically by the MSVC linker
    } else if target.contains("apple") {
        println!("cargo:rustc-link-lib=framework=Accelerate");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=MetalKit");
        println!("cargo:rustc-link-lib=c++");
    } else {
        println!("cargo:rustc-link-lib=dylib=pthread");
        println!("cargo:rustc-link-lib=dylib=dl");
        println!("cargo:rustc-link-lib=dylib=m");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }

    // Include path for downstream crates (not used directly, but available)
    let llama_include = bitnet_dir
        .join("3rdparty")
        .join("llama.cpp")
        .join("include");
    println!("cargo:include={}", dunce_canonicalize(&llama_include));

    // Only rerun if the build script itself changes
    println!("cargo:rerun-if-changed=build.rs");
}

/// Canonicalize a path, stripping the \\?\ prefix on Windows.
/// This prevents CMake from choking on Windows extended-length paths.
fn dunce_canonicalize(path: &PathBuf) -> String {
    match path.canonicalize() {
        Ok(p) => {
            let s = p.to_string_lossy().to_string();
            // Strip \\?\ prefix that Windows canonicalize adds
            if s.starts_with(r"\\?\") {
                s[4..].to_string()
            } else {
                s
            }
        }
        Err(_) => path.to_string_lossy().to_string(),
    }
}
