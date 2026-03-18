// Hardware Detection — Detects CPU, RAM, GPU, and OS for model selection.
// Uses the `sysinfo` crate for cross-platform system information.
// CRITICAL: No network calls. Local hardware inspection only.

use serde::{Deserialize, Serialize};
use sysinfo::{Components, Disks, System};

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

// ─── Live Hardware Stats (Sprint F) ────────────────────────────────────────────
// Real-time hardware monitoring via native OS APIs.
// No shell commands. Uses sysinfo crate directly.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskStat {
    pub mount_point: String,
    pub total_gb: f64,
    pub available_gb: f64,
    pub used_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveHardwareStats {
    pub cpu_usage_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub memory_available_mb: u64,
    pub disk_stats: Vec<DiskStat>,
    pub cpu_temp_celsius: Option<f32>,
    pub gpu_temp_celsius: Option<f32>,
    pub gpu_usage_percent: Option<f32>,
    pub sampled_at: String,
}

/// Get live hardware stats — CPU usage, memory, disk, temperature.
/// All detection is local — no network calls, no shell commands.
pub fn get_live_stats() -> LiveHardwareStats {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU usage (global average)
    // Need a short sleep for accurate CPU measurement
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();
    let cpu_usage_percent = sys.global_cpu_usage();

    // Memory
    let memory_total_mb = sys.total_memory() / (1024 * 1024);
    let memory_available_mb = sys.available_memory() / (1024 * 1024);
    let memory_used_mb = sys.used_memory() / (1024 * 1024);

    // Disks
    let disks = Disks::new_with_refreshed_list();
    let disk_stats: Vec<DiskStat> = disks
        .iter()
        .map(|d| {
            let total_bytes = d.total_space();
            let available_bytes = d.available_space();
            let total_gb = total_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let available_gb = available_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let used_percent = if total_bytes > 0 {
                ((total_bytes - available_bytes) as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };
            DiskStat {
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_gb: (total_gb * 100.0).round() / 100.0,
                available_gb: (available_gb * 100.0).round() / 100.0,
                used_percent: (used_percent * 10.0).round() / 10.0,
            }
        })
        .collect();

    // CPU temperature — from sysinfo components
    let components = Components::new_with_refreshed_list();
    let cpu_temp_celsius = components
        .iter()
        .find(|c| {
            let label = c.label().to_lowercase();
            label.contains("cpu") || label.contains("core") || label.contains("package")
        })
        .map(|c| c.temperature());

    // GPU temperature — best-effort from components
    let gpu_temp_celsius = components
        .iter()
        .find(|c| {
            let label = c.label().to_lowercase();
            label.contains("gpu") || label.contains("radeon") || label.contains("geforce")
        })
        .map(|c| c.temperature());

    let sampled_at = chrono_iso_now();

    LiveHardwareStats {
        cpu_usage_percent,
        memory_used_mb,
        memory_total_mb,
        memory_available_mb,
        disk_stats,
        cpu_temp_celsius,
        gpu_temp_celsius,
        gpu_usage_percent: None, // Future: platform-specific GPU utilization
        sampled_at,
    }
}

/// ISO 8601 timestamp without chrono dependency
fn chrono_iso_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    // Simple UTC format
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Approximate date calculation (good enough for timestamps)
    let mut year = 1970u64;
    let mut remaining_days = days;
    loop {
        let days_in_year = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366 } else { 365 };
        if remaining_days < days_in_year { break; }
        remaining_days -= days_in_year;
        year += 1;
    }
    let is_leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days: [u64; 12] = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 0u64;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining_days < md { month = i as u64 + 1; break; }
        remaining_days -= md;
    }
    if month == 0 { month = 12; }
    let day = remaining_days + 1;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hours, minutes, seconds)
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
