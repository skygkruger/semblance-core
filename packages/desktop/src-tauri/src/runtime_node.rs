use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeManifest {
    pub platform: String,
    pub node_version: String,
    pub sha256: String,
    pub bundled_at: String,
    pub binary_relative_path: String,
}

/// Platform directory name under `runtimes/` (e.g. `darwin-arm64`).
pub fn platform_runtime_dir() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "darwin-arm64";
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return "darwin-x64";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "linux-x64";
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return "win32-x64";
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    compile_error!("Unsupported platform for bundled Node runtime");
}

fn node_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "node.exe"
    }
    #[cfg(not(windows))]
    {
        "node"
    }
}

fn allow_system_node_fallback() -> bool {
    cfg!(debug_assertions)
        || std::env::var("SEMBLANCE_ALLOW_SYSTEM_NODE")
            .ok()
            .as_deref()
            == Some("1")
}

fn which_node() -> Option<PathBuf> {
    #[cfg(windows)]
    let candidates = ["node.exe"];
    #[cfg(not(windows))]
    let candidates = ["node"];

    if let Ok(path_var) = std::env::var("PATH") {
        #[cfg(windows)]
        let separator = ';';
        #[cfg(not(windows))]
        let separator = ':';

        for dir in path_var.split(separator) {
            for name in &candidates {
                let full = PathBuf::from(dir).join(name);
                if full.exists() {
                    return Some(full);
                }
            }
        }
    }
    None
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn parse_runtime_manifest(contents: &str) -> Result<RuntimeManifest, String> {
    let value: serde_json::Value =
        serde_json::from_str(contents).map_err(|e| format!("Invalid runtime-manifest.json: {}", e))?;

    let platform = value
        .get("platform")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "runtime-manifest.json missing platform".to_string())?
        .to_string();
    let node_version = value
        .get("nodeVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "runtime-manifest.json missing nodeVersion".to_string())?
        .to_string();
    let sha256 = value
        .get("sha256")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "runtime-manifest.json missing sha256".to_string())?
        .to_string();
    let bundled_at = value
        .get("bundledAt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "runtime-manifest.json missing bundledAt".to_string())?
        .to_string();
    let binary_relative_path = value
        .get("binaryRelativePath")
        .and_then(|v| v.as_str())
        .unwrap_or(node_binary_name())
        .to_string();

    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("runtime-manifest.json sha256 must be a 64-char hex string".to_string());
    }

    Ok(RuntimeManifest {
        platform,
        node_version,
        sha256,
        bundled_at,
        binary_relative_path,
    })
}

fn validate_manifest_and_binary(platform_dir: &Path, node_path: &Path) -> Result<(), String> {
    let manifest_path = platform_dir.join("runtime-manifest.json");
    if !manifest_path.exists() {
        eprintln!(
            "[runtime] No runtime-manifest.json at {:?}; skipping sha256 validation",
            manifest_path
        );
        return Ok(());
    }

    let contents = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read runtime manifest: {}", e))?;
    let manifest = parse_runtime_manifest(&contents)?;

    let expected_platform = platform_runtime_dir();
    if manifest.platform != expected_platform {
        return Err(format!(
            "runtime-manifest.json platform mismatch: expected {}, got {}",
            expected_platform, manifest.platform
        ));
    }

    let actual_hash = sha256_file(node_path)?;
    if actual_hash != manifest.sha256 {
        return Err(format!(
            "Bundled Node sha256 mismatch: manifest {} actual {}",
            manifest.sha256, actual_hash
        ));
    }

    eprintln!(
        "[runtime] Verified bundled Node {} ({}) sha256={}",
        node_path.display(),
        manifest.node_version,
        actual_hash
    );
    Ok(())
}

fn bundled_node_candidates(
    app_handle: Option<&tauri::AppHandle>,
    project_root: &Path,
) -> Vec<PathBuf> {
    let platform = platform_runtime_dir();
    let binary = node_binary_name();
    let mut candidates = Vec::new();

    if let Some(handle) = app_handle {
        if let Ok(resource_dir) = handle.path().resource_dir() {
            candidates.push(resource_dir.join("runtimes").join(platform).join(binary));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("runtimes").join(platform).join(binary));
        }
    }

    candidates.push(
        project_root
            .join("packages")
            .join("desktop")
            .join("src-tauri")
            .join("runtimes")
            .join(platform)
            .join(binary),
    );

    candidates
}

/// Resolve the Node binary for production runtime spawn.
pub fn resolve_runtime_node(
    app_handle: Option<&tauri::AppHandle>,
    project_root: &Path,
) -> Result<PathBuf, String> {
    for candidate in bundled_node_candidates(app_handle, project_root) {
        if !candidate.exists() {
            continue;
        }

        let platform_dir = candidate
            .parent()
            .ok_or_else(|| "Bundled Node path has no parent directory".to_string())?;
        validate_manifest_and_binary(platform_dir, &candidate)?;
        eprintln!("[runtime] Using bundled Node at {:?}", candidate);
        return Ok(candidate);
    }

    if allow_system_node_fallback() {
        if let Some(system_node) = which_node() {
            eprintln!(
                "[runtime] Bundled Node missing; using system Node at {:?} (debug/env escape hatch)",
                system_node
            );
            return Ok(system_node);
        }
    }

    Err(
        "Bundled Node runtime missing; run node scripts/bundle-runtimes.js".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::{parse_runtime_manifest, platform_runtime_dir};

    #[test]
    fn platform_runtime_dir_matches_js_triple_format() {
        let dir = platform_runtime_dir();
        assert!(
            matches!(
                dir,
                "darwin-arm64" | "darwin-x64" | "linux-x64" | "win32-x64"
            ),
            "unexpected platform dir: {dir}"
        );
    }

    #[test]
    fn parse_runtime_manifest_reads_required_fields() {
        let manifest = parse_runtime_manifest(
            r#"{
              "platform": "darwin-arm64",
              "nodeVersion": "v20.11.0",
              "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              "bundledAt": "2026-07-18T12:00:00.000Z",
              "binaryRelativePath": "node"
            }"#,
        )
        .expect("manifest should parse");

        assert_eq!(manifest.platform, "darwin-arm64");
        assert_eq!(manifest.node_version, "v20.11.0");
        assert_eq!(manifest.binary_relative_path, "node");
        assert_eq!(manifest.sha256.len(), 64);
    }

    #[test]
    fn parse_runtime_manifest_rejects_invalid_sha256() {
        let err = parse_runtime_manifest(
            r#"{
              "platform": "darwin-arm64",
              "nodeVersion": "v20.11.0",
              "sha256": "not-a-hash",
              "bundledAt": "2026-07-18T12:00:00.000Z",
              "binaryRelativePath": "node"
            }"#,
        )
        .expect_err("invalid sha256 should fail");

        assert!(err.contains("sha256"));
    }
}
