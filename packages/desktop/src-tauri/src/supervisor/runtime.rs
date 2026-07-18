use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Parsed from core stdout: `CORE_READY <pid> <ipcSocketPath>`.
pub fn parse_core_ready_line(line: &str) -> Option<(u32, String)> {
    let rest = line.strip_prefix("CORE_READY ")?;
    let mut parts = rest.split_whitespace();
    let pid = parts.next()?.parse().ok()?;
    let ipc_path = parts.next()?.to_string();
    if ipc_path.is_empty() {
        return None;
    }
    Some((pid, ipc_path))
}

/// Parsed from gateway stdout: `GATEWAY_READY <pid>`.
pub fn parse_gateway_ready_line(line: &str) -> Option<u32> {
    line.strip_prefix("GATEWAY_READY ")
        .and_then(|pid| pid.trim().parse().ok())
}

pub fn inprocess_transport_allowed(project_root: &Path) -> bool {
    if std::env::var("SEMBLANCE_INPROCESS_TRANSPORT").ok().as_deref() != Some("1") {
        return false;
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = project_root;
        eprintln!("[supervisor] SEMBLANCE_INPROCESS_TRANSPORT=1 refused in release builds");
        return false;
    }

    #[cfg(debug_assertions)]
    {
        if std::env::var("SEMBLANCE_RELEASE").ok().as_deref() == Some("1") {
            eprintln!(
                "[supervisor] SEMBLANCE_INPROCESS_TRANSPORT=1 refused when SEMBLANCE_RELEASE=1"
            );
            return false;
        }

        let flag_path = project_root.join("release/features/inprocess-core-gateway.json");
        if flag_path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&flag_path) {
                if contents.contains("\"enabled\": true") || contents.contains("\"enabled\":true") {
                    eprintln!(
                        "[supervisor] inprocess-core-gateway rollback flag enabled — refusing"
                    );
                    return false;
                }
            }
        }

        eprintln!("[supervisor] In-process transport enabled (debug/test only)");
        true
    }
}

pub struct RuntimeSpawnState {
    #[allow(dead_code)]
    pub core_child: Arc<Mutex<Option<Child>>>,
    #[allow(dead_code)]
    pub gateway_child: Arc<Mutex<Option<Child>>>,
    pub core_pid: Arc<Mutex<Option<u32>>>,
    pub gateway_pid: Arc<Mutex<Option<u32>>>,
    pub core_ready: Arc<Mutex<bool>>,
    pub gateway_ready: Arc<Mutex<bool>>,
    pub core_ipc_path: Arc<Mutex<Option<String>>>,
}

impl RuntimeSpawnState {
    pub fn new() -> Self {
        Self {
            core_child: Arc::new(Mutex::new(None)),
            gateway_child: Arc::new(Mutex::new(None)),
            core_pid: Arc::new(Mutex::new(None)),
            gateway_pid: Arc::new(Mutex::new(None)),
            core_ready: Arc::new(Mutex::new(false)),
            gateway_ready: Arc::new(Mutex::new(false)),
            core_ipc_path: Arc::new(Mutex::new(None)),
        }
    }
}

pub struct RuntimeSpawnConfig<'a> {
    pub project_root: &'a PathBuf,
    pub sidecar_dir: PathBuf,
    pub node_path: PathBuf,
    pub kernel_socket_path: String,
    pub allow_inprocess: bool,
}

struct ResolvedRuntimeScript {
    executable: PathBuf,
    script_arg: PathBuf,
    working_dir: PathBuf,
    use_tsx: bool,
}

pub async fn spawn_supervised_runtimes(
    state: Arc<RuntimeSpawnState>,
    config: RuntimeSpawnConfig<'_>,
) -> Result<(), String> {
    let core_script = resolve_runtime_script(
        &config.sidecar_dir,
        config.project_root,
        "runtime-core-bridge",
    )?;

    let core_env = runtime_env_map(&config.kernel_socket_path, None, config.allow_inprocess);
    spawn_core_child(
        &config.node_path,
        &core_script,
        core_env,
        state.clone(),
    )
    .await?;

    let core_ipc_path = state
        .core_ipc_path
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Core IPC path unavailable after CORE_READY".to_string())?;

    let gateway_script = resolve_runtime_script(
        &config.sidecar_dir,
        config.project_root,
        "runtime-gateway-bridge",
    )?;
    let gateway_env = runtime_env_map(
        &config.kernel_socket_path,
        Some(&core_ipc_path),
        config.allow_inprocess,
    );
    spawn_gateway_child(
        &config.node_path,
        &gateway_script,
        gateway_env,
        state,
    )
    .await?;

    Ok(())
}

async fn spawn_core_child(
    node_path: &Path,
    script: &ResolvedRuntimeScript,
    env: HashMap<String, String>,
    state: Arc<RuntimeSpawnState>,
) -> Result<(), String> {
    let mut child = build_runtime_command(node_path, script, env).spawn().map_err(|e| {
        format!(
            "Failed to spawn core runtime {:?}: {}",
            script.script_arg, e
        )
    })?;

    *state.core_pid.lock().await = child.id();
    let stdout = child.stdout.take().ok_or("Failed to take core stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to take core stderr")?;
    *state.core_child.lock().await = Some(child);

    let ready_flag = state.core_ready.clone();
    let ipc_store = state.core_ipc_path.clone();
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some((reported_pid, ipc_path)) = parse_core_ready_line(&line) {
                eprintln!(
                    "[supervisor] Core ready pid={} ipc={}",
                    reported_pid, ipc_path
                );
                *ready_flag.lock().await = true;
                *ipc_store.lock().await = Some(ipc_path);
                break;
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[runtime-core] {}", line);
        }
    });

    wait_for_flag(state.core_ready.clone(), "CORE_READY", 60).await
}

async fn spawn_gateway_child(
    node_path: &Path,
    script: &ResolvedRuntimeScript,
    env: HashMap<String, String>,
    state: Arc<RuntimeSpawnState>,
) -> Result<(), String> {
    let mut child = build_runtime_command(node_path, script, env)
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to spawn gateway runtime {:?}: {}",
                script.script_arg, e
            )
        })?;

    *state.gateway_pid.lock().await = child.id();
    let stdout = child.stdout.take().ok_or("Failed to take gateway stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to take gateway stderr")?;
    *state.gateway_child.lock().await = Some(child);

    let ready_flag = state.gateway_ready.clone();
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(reported_pid) = parse_gateway_ready_line(&line) {
                eprintln!("[supervisor] Gateway ready pid={}", reported_pid);
                *ready_flag.lock().await = true;
                break;
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[runtime-gateway] {}", line);
        }
    });

    wait_for_flag(state.gateway_ready.clone(), "GATEWAY_READY", 60).await
}

fn build_runtime_command(
    node_path: &Path,
    script: &ResolvedRuntimeScript,
    env: HashMap<String, String>,
) -> Command {
    let mut cmd = if script.use_tsx {
        let mut tsx_cmd = Command::new(&script.executable);
        tsx_cmd.arg(&script.script_arg);
        tsx_cmd
    } else {
        let mut node_cmd = Command::new(node_path);
        node_cmd
            .arg("--no-deprecation")
            .arg(&script.script_arg);
        node_cmd
    };

    cmd.current_dir(&script.working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    for (key, value) in env {
        cmd.env(key, value);
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd
}

async fn wait_for_flag(
    ready_store: Arc<Mutex<bool>>,
    label: &str,
    attempts: usize,
) -> Result<(), String> {
    for _ in 0..attempts {
        if *ready_store.lock().await {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(format!("Timed out waiting for {}", label))
}

fn runtime_env_map(
    kernel_socket_path: &str,
    core_ipc_path: Option<&str>,
    allow_inprocess: bool,
) -> HashMap<String, String> {
    let mut env = HashMap::new();
    env.insert(
        "SEMBLANCE_KERNEL_SOCKET".to_string(),
        kernel_socket_path.to_string(),
    );
    if let Some(build_hash) = std::env::var("SEMBLANCE_BUILD_HASH").ok() {
        env.insert("SEMBLANCE_BUILD_HASH".to_string(), build_hash);
    }
    if let Some(policy_epoch) = std::env::var("SEMBLANCE_POLICY_EPOCH").ok() {
        env.insert("SEMBLANCE_POLICY_EPOCH".to_string(), policy_epoch);
    }
    if let Some(data_dir) = std::env::var("SEMBLANCE_DATA_DIR").ok() {
        env.insert("SEMBLANCE_DATA_DIR".to_string(), data_dir);
    }
    if let Some(core_ipc) = core_ipc_path {
        env.insert("SEMBLANCE_CORE_IPC".to_string(), core_ipc.to_string());
    }
    if allow_inprocess {
        env.insert("SEMBLANCE_INPROCESS_TRANSPORT".to_string(), "1".to_string());
    }
    env
}

fn resolve_runtime_script(
    sidecar_dir: &Path,
    project_root: &Path,
    bridge_name: &str,
) -> Result<ResolvedRuntimeScript, String> {
    let bundled = sidecar_dir.join(format!("{bridge_name}.cjs"));
    if bundled.exists() {
        return Ok(ResolvedRuntimeScript {
            executable: bundled.clone(),
            script_arg: bundled,
            working_dir: sidecar_dir.to_path_buf(),
            use_tsx: false,
        });
    }

    #[cfg(windows)]
    let tsx_path = project_root.join("node_modules").join(".bin").join("tsx.cmd");
    #[cfg(not(windows))]
    let tsx_path = project_root.join("node_modules").join(".bin").join("tsx");

    let ts_script = sidecar_dir.join(format!("{bridge_name}.ts"));
    if tsx_path.exists() && ts_script.exists() {
        return Ok(ResolvedRuntimeScript {
            executable: tsx_path,
            script_arg: ts_script,
            working_dir: project_root.to_path_buf(),
            use_tsx: true,
        });
    }

    Err(format!(
        "Runtime bridge not found: {:?} (run bundle scripts)",
        bundled
    ))
}

#[cfg(test)]
mod tests {
    use super::{parse_core_ready_line, parse_gateway_ready_line};

    #[test]
    fn parse_core_ready_extracts_pid_and_ipc() {
        assert_eq!(
            parse_core_ready_line("CORE_READY 12345 /tmp/core.sock"),
            Some((12345, "/tmp/core.sock".to_string()))
        );
    }

    #[test]
    fn parse_gateway_ready_extracts_pid() {
        assert_eq!(parse_gateway_ready_line("GATEWAY_READY 67890"), Some(67890));
    }
}
