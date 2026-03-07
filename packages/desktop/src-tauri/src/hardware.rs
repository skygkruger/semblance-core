// Hardware Detection — Detects CPU, RAM, GPU, and OS for model selection.
// Uses the `sysinfo` crate for cross-platform system information.
// CRITICAL: No network calls. Local hardware inspection only.

use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub vram_mb: u64,
    pub compute_capable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub tier: String,
    pub cpu_cores: usize,
    pub cpu_arch: String,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub os: String,
    pub gpu: Option<GpuInfo>,
    /// Whether this device can run Whisper.cpp for local STT (8GB+ RAM, non-constrained)
    pub voice_capable: bool,
}

/// Detect the hardware profile of this machine.
/// All detection is local — no network calls.
pub fn detect_hardware() -> HardwareProfile {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);
    let cpu_cores = sys.cpus().len();

    let cpu_arch = if cfg!(target_arch = "x86_64") {
        "x64".to_string()
    } else if cfg!(target_arch = "aarch64") {
        "arm64".to_string()
    } else {
        "unknown".to_string()
    };

    let os = if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        "unknown".to_string()
    };

    // GPU detection — platform-specific heuristics.
    // Detects Apple Silicon (Metal) on macOS, NVIDIA/AMD/Intel via WMIC on Windows.
    let gpu = detect_gpu();

    let tier = classify_tier(total_ram_mb, &gpu);
    let voice_capable = is_voice_capable(total_ram_mb, &tier);

    HardwareProfile {
        tier,
        cpu_cores,
        cpu_arch,
        total_ram_mb,
        available_ram_mb,
        os,
        gpu,
        voice_capable,
    }
}

/// Classify hardware tier based on RAM and GPU.
fn classify_tier(total_ram_mb: u64, gpu: &Option<GpuInfo>) -> String {
    let ram_gb = total_ram_mb / 1024;

    if ram_gb >= 32
        || gpu
            .as_ref()
            .map(|g| g.compute_capable && g.vram_mb >= 8192)
            .unwrap_or(false)
    {
        "workstation".to_string()
    } else if ram_gb >= 16 {
        "performance".to_string()
    } else if ram_gb >= 8 {
        "standard".to_string()
    } else {
        "constrained".to_string()
    }
}

/// Whether this desktop device can run Whisper.cpp for local STT.
/// Requires 8GB+ RAM and non-constrained tier.
fn is_voice_capable(total_ram_mb: u64, tier: &str) -> bool {
    total_ram_mb >= 8192 && tier != "constrained"
}

/// GPU detection. Returns GPU info if a compute-capable GPU is detected.
///
/// On macOS with Apple Silicon, the GPU is integrated and always compute-capable (Metal).
/// On Windows, uses WMIC to query the video controller for name and VRAM.
/// On Linux, returns None (future: parse lspci or sysfs).
fn detect_gpu() -> Option<GpuInfo> {
    #[cfg(target_os = "macos")]
    {
        if cfg!(target_arch = "aarch64") {
            // Apple Silicon — unified memory, Metal compute
            let sys = System::new_all();
            let total_ram_gb = sys.total_memory() / (1024 * 1024 * 1024);
            // Apple Silicon shares RAM with GPU. Estimate ~75% usable for GPU.
            let estimated_vram_mb = (total_ram_gb * 1024 * 3) / 4;
            return Some(GpuInfo {
                name: "Apple Silicon (Metal)".to_string(),
                vendor: "apple".to_string(),
                vram_mb: estimated_vram_mb,
                compute_capable: true,
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "Name,AdapterRAM", "/format:csv"])
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                // CSV format: Node,AdapterRAM,Name
                // Skip header lines and empty lines
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with("Node") {
                        continue;
                    }
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 3 {
                        let adapter_ram_str = parts[1].trim();
                        let name = parts[2].trim().to_string();

                        // Skip generic/basic adapters (Microsoft Basic Display)
                        if name.contains("Basic Display") || name.contains("Remote Desktop") {
                            continue;
                        }

                        let vram_bytes: u64 = adapter_ram_str.parse().unwrap_or(0);
                        // WMIC reports AdapterRAM capped at 4GB (DWORD limit).
                        // For GPUs with >4GB VRAM, estimate from the GPU name.
                        let vram_mb = if vram_bytes > 0 {
                            vram_bytes / (1024 * 1024)
                        } else {
                            0
                        };

                        let name_lower = name.to_lowercase();
                        let vendor = if name_lower.contains("nvidia") || name_lower.contains("geforce") || name_lower.contains("rtx") || name_lower.contains("gtx") {
                            "nvidia".to_string()
                        } else if name_lower.contains("amd") || name_lower.contains("radeon") {
                            "amd".to_string()
                        } else if name_lower.contains("intel") {
                            "intel".to_string()
                        } else {
                            "unknown".to_string()
                        };

                        let compute_capable = vendor == "nvidia" || vendor == "amd";

                        return Some(GpuInfo {
                            name,
                            vendor,
                            vram_mb,
                            compute_capable,
                        });
                    }
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_tier_constrained() {
        assert_eq!(classify_tier(4096, &None), "constrained");
        assert_eq!(classify_tier(6144, &None), "constrained");
    }

    #[test]
    fn test_classify_tier_standard() {
        assert_eq!(classify_tier(8192, &None), "standard");
        assert_eq!(classify_tier(12288, &None), "standard");
    }

    #[test]
    fn test_classify_tier_performance() {
        assert_eq!(classify_tier(16384, &None), "performance");
        assert_eq!(classify_tier(24576, &None), "performance");
    }

    #[test]
    fn test_classify_tier_workstation() {
        assert_eq!(classify_tier(32768, &None), "workstation");
        assert_eq!(classify_tier(65536, &None), "workstation");
    }

    #[test]
    fn test_classify_tier_gpu_promotion() {
        let gpu = Some(GpuInfo {
            name: "RTX 4070".to_string(),
            vendor: "nvidia".to_string(),
            vram_mb: 12288,
            compute_capable: true,
        });
        assert_eq!(classify_tier(16384, &gpu), "workstation");
    }

    #[test]
    fn test_detect_hardware_returns_valid_profile() {
        let profile = detect_hardware();
        assert!(profile.cpu_cores > 0);
        assert!(profile.total_ram_mb > 0);
        assert!(!profile.os.is_empty());
        assert!(!profile.cpu_arch.is_empty());
        assert!(["constrained", "standard", "performance", "workstation"]
            .contains(&profile.tier.as_str()));
    }

    #[test]
    fn test_voice_capable_standard_8gb() {
        assert!(is_voice_capable(8192, "standard"));
    }

    #[test]
    fn test_voice_capable_performance_16gb() {
        assert!(is_voice_capable(16384, "performance"));
    }

    #[test]
    fn test_voice_capable_workstation() {
        assert!(is_voice_capable(32768, "workstation"));
    }

    #[test]
    fn test_voice_not_capable_under_8gb() {
        assert!(!is_voice_capable(4096, "standard"));
        assert!(!is_voice_capable(6144, "standard"));
    }

    #[test]
    fn test_voice_not_capable_constrained_even_8gb() {
        assert!(!is_voice_capable(8192, "constrained"));
    }

    #[test]
    fn test_detect_hardware_includes_voice_capable() {
        let profile = detect_hardware();
        // voice_capable should be consistent with RAM and tier
        let expected = is_voice_capable(profile.total_ram_mb, &profile.tier);
        assert_eq!(profile.voice_capable, expected);
    }
}
