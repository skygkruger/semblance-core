// Hardware Detection — Detects CPU, RAM, GPU, and OS for model selection.
// Uses the `sysinfo` crate for cross-platform system information.
// CRITICAL: No network calls. Local hardware inspection only.

use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub vram_mb: u64,
    pub compute_capable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareProfile {
    pub tier: String,
    pub cpu_cores: usize,
    pub cpu_arch: String,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub os: String,
    pub gpu: Option<GpuInfo>,
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

    // GPU detection — basic heuristic based on platform
    // Full GPU enumeration (vulkan/metal/cuda) is Sprint 4 scope.
    // For now, detect Apple Silicon (always has GPU compute) and report
    // no dedicated GPU otherwise. Users can override in settings.
    let gpu = detect_gpu();

    let tier = classify_tier(total_ram_mb, &gpu);

    HardwareProfile {
        tier,
        cpu_cores,
        cpu_arch,
        total_ram_mb,
        available_ram_mb,
        os,
        gpu,
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

/// Basic GPU detection. Returns GPU info if a compute-capable GPU is detected.
///
/// On macOS with Apple Silicon, the GPU is integrated and always compute-capable
/// (Metal). On other platforms, this returns None for now — full GPU enumeration
/// via Vulkan/CUDA is Sprint 4 scope.
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

    // Other platforms: no GPU detection yet (Sprint 4)
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
}
