use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::runtime_node::resolve_runtime_node;

use super::health::{query_kernel_readiness, KernelReadinessSnapshot};
use super::runtime::{
    inprocess_transport_allowed, spawn_supervised_runtimes, RuntimeSpawnConfig, RuntimeSpawnState,
};

/// Parsed from kernel stdout: `KERNEL_READY <socketPath>`.
pub fn parse_kernel_ready_line(line: &str) -> Option<String> {
    line.strip_prefix("KERNEL_READY ")
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
}

#[derive(Debug, Clone, Serialize)]
pub struct SupervisorStatus {
    pub kernel_pid: Option<u32>,
    pub kernel_ready: bool,
    pub kernel_socket_path: Option<String>,
    pub core_pid: Option<u32>,
    pub gateway_pid: Option<u32>,
    pub model_pid: Option<u32>,
    pub core_ready: bool,
    pub gateway_ready: bool,
    pub model_ready: bool,
    pub core_ipc_path: Option<String>,
    /// True when core and gateway are both ready with different PIDs.
    pub distinct: bool,
    /// Legacy sidecar remains independent; true when AppBridge is managed elsewhere.
    pub sidecar_separate: bool,
}

pub struct SovereignSupervisor {
    /// Keeps the kernel child handle alive for the process lifetime.
    #[allow(dead_code)]
    child: Arc<Mutex<Option<Child>>>,
    kernel_pid: Arc<Mutex<Option<u32>>>,
    kernel_ready: Arc<Mutex<bool>>,
    kernel_socket_path: Arc<Mutex<Option<String>>>,
    cached_readiness: Arc<Mutex<Option<KernelReadinessSnapshot>>>,
    runtime_state: Arc<RuntimeSpawnState>,
    project_root: PathBuf,
    sidecar_dir: PathBuf,
    node_path: Option<PathBuf>,
}

impl SovereignSupervisor {
    pub async fn spawn_kernel(
        project_root: PathBuf,
        app_handle: tauri::AppHandle,
    ) -> Result<Self, String> {
        let strip_unc = |p: PathBuf| -> PathBuf {
            #[cfg(windows)]
            {
                if let Some(s) = p.to_str() {
                    if let Some(stripped) = s.strip_prefix(r"\\?\") {
                        return PathBuf::from(stripped);
                    }
                }
            }
            p
        };

        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(strip_unc)
            .unwrap_or_else(|| project_root.clone());

        let resource_bridge = app_handle
            .path()
            .resource_dir()
            .ok()
            .map(strip_unc)
            .map(|p| p.join("sidecar").join("kernel-bridge.cjs"));
        let exe_bridge = exe_dir.join("sidecar").join("kernel-bridge.cjs");

        let bundled_kernel = if resource_bridge.as_ref().map_or(false, |p| p.exists()) {
            resource_bridge.unwrap()
        } else if exe_bridge.exists() {
            exe_bridge
        } else {
            exe_bridge
        };

        let (node_path, script_path, working_dir) = if bundled_kernel.exists() {
            let node = resolve_runtime_node(Some(&app_handle), &project_root)?;
            let sidecar_dir = bundled_kernel
                .parent()
                .unwrap_or(&exe_dir)
                .to_path_buf();
            (
                strip_unc(node),
                strip_unc(bundled_kernel),
                strip_unc(sidecar_dir),
            )
        } else {
            #[cfg(windows)]
            let tsx_path = project_root.join("node_modules").join(".bin").join("tsx.cmd");
            #[cfg(not(windows))]
            let tsx_path = project_root.join("node_modules").join(".bin").join("tsx");

            let kernel_script = project_root
                .join("packages")
                .join("desktop")
                .join("src-tauri")
                .join("sidecar")
                .join("kernel-bridge.ts");

            if !tsx_path.exists() {
                return Err(format!(
                    "tsx not found at {:?}. Run `pnpm add -Dw tsx` in the project root.",
                    tsx_path
                ));
            }

            if !kernel_script.exists() {
                return Err(format!("Kernel bridge script not found at {:?}", kernel_script));
            }

            (tsx_path, kernel_script, project_root.clone())
        };

        let mut cmd = Command::new(&node_path);
        cmd.arg("--no-deprecation")
            .arg(&script_path)
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn kernel process: {}", e))?;

        let kernel_pid = child.id();
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to take kernel stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Failed to take kernel stderr")?;

        let supervisor = Self {
            child: Arc::new(Mutex::new(Some(child))),
            kernel_pid: Arc::new(Mutex::new(kernel_pid)),
            kernel_ready: Arc::new(Mutex::new(false)),
            kernel_socket_path: Arc::new(Mutex::new(None)),
            cached_readiness: Arc::new(Mutex::new(None)),
            runtime_state: Arc::new(RuntimeSpawnState::new()),
            project_root: project_root.clone(),
            sidecar_dir: working_dir.clone(),
            node_path: Some(node_path.clone()),
        };

        let ready_flag = supervisor.kernel_ready.clone();
        let socket_path_store = supervisor.kernel_socket_path.clone();
        let cached_readiness = supervisor.cached_readiness.clone();
        let runtime_supervisor = supervisor.clone_for_runtime_spawn();

        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(socket_path) = parse_kernel_ready_line(&line) {
                    eprintln!(
                        "[supervisor] Kernel ready on socket: {}",
                        socket_path
                    );
                    *ready_flag.lock().await = true;
                    *socket_path_store.lock().await = Some(socket_path.clone());

                    match query_kernel_readiness(&socket_path).await {
                        Ok(snapshot) => {
                            *cached_readiness.lock().await = Some(snapshot);
                        }
                        Err(err) => {
                            eprintln!(
                                "[supervisor] Kernel readiness query failed after ready signal: {}",
                                err
                            );
                        }
                    }

                    if let Err(err) = runtime_supervisor
                        .spawn_runtimes_after_kernel(&socket_path)
                        .await
                    {
                        eprintln!(
                            "[supervisor] Supervised runtime spawn failed (non-fatal): {}",
                            err
                        );
                    }
                    break;
                }
            }
        });

        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[kernel] {}", line);
            }
        });

        Ok(supervisor)
    }

    pub async fn status(&self, sidecar_separate: bool) -> SupervisorStatus {
        let core_pid = *self.runtime_state.core_pid.lock().await;
        let gateway_pid = *self.runtime_state.gateway_pid.lock().await;
        let model_pid = *self.runtime_state.model_pid.lock().await;
        let core_ready = *self.runtime_state.core_ready.lock().await;
        let gateway_ready = *self.runtime_state.gateway_ready.lock().await;
        let model_ready = *self.runtime_state.model_ready.lock().await;
        let distinct = core_ready
            && gateway_ready
            && core_pid.is_some()
            && gateway_pid.is_some()
            && core_pid != gateway_pid;

        SupervisorStatus {
            kernel_pid: *self.kernel_pid.lock().await,
            kernel_ready: *self.kernel_ready.lock().await,
            kernel_socket_path: self.kernel_socket_path.lock().await.clone(),
            core_pid,
            gateway_pid,
            model_pid,
            core_ready,
            gateway_ready,
            model_ready,
            core_ipc_path: self.runtime_state.core_ipc_path.lock().await.clone(),
            distinct,
            sidecar_separate,
        }
    }

    fn clone_for_runtime_spawn(&self) -> RuntimeSpawnHandle {
        RuntimeSpawnHandle {
            runtime_state: self.runtime_state.clone(),
            project_root: self.project_root.clone(),
            sidecar_dir: self.sidecar_dir.clone(),
            node_path: self.node_path.clone(),
        }
    }

    pub async fn kernel_readiness(&self) -> Result<Value, String> {
        if let Some(cached) = self.cached_readiness.lock().await.clone() {
            return Ok(serde_json::to_value(cached).map_err(|e| e.to_string())?);
        }

        let socket_path = self
            .kernel_socket_path
            .lock()
            .await
            .clone()
            .ok_or_else(|| "Kernel socket path is not available yet".to_string())?;

        let snapshot = query_kernel_readiness(&socket_path).await?;
        *self.cached_readiness.lock().await = Some(snapshot.clone());
        serde_json::to_value(snapshot).map_err(|e| e.to_string())
    }
}

struct RuntimeSpawnHandle {
    runtime_state: Arc<RuntimeSpawnState>,
    project_root: PathBuf,
    sidecar_dir: PathBuf,
    node_path: Option<PathBuf>,
}

impl RuntimeSpawnHandle {
    async fn spawn_runtimes_after_kernel(&self, kernel_socket_path: &str) -> Result<(), String> {
        let node_path = match self.node_path.clone() {
            Some(path) => path,
            None => resolve_runtime_node(None, &self.project_root)?,
        };

        let allow_inprocess = inprocess_transport_allowed(&self.project_root);

        spawn_supervised_runtimes(
            self.runtime_state.clone(),
            RuntimeSpawnConfig {
                project_root: &self.project_root,
                sidecar_dir: self.sidecar_dir.clone(),
                node_path,
                kernel_socket_path: kernel_socket_path.to_string(),
                allow_inprocess,
            },
        )
        .await?;

        let core_pid = *self.runtime_state.core_pid.lock().await;
        let gateway_pid = *self.runtime_state.gateway_pid.lock().await;
        let model_pid = *self.runtime_state.model_pid.lock().await;
        if core_pid.is_some() && gateway_pid.is_some() && core_pid == gateway_pid {
            return Err(format!(
                "Process isolation violation: core and gateway share PID {:?}",
                core_pid
            ));
        }

        eprintln!(
            "[supervisor] Supervised runtimes ready — core_pid={:?} gateway_pid={:?} model_pid={:?} distinct={}",
            core_pid,
            gateway_pid,
            model_pid,
            core_pid != gateway_pid
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::parse_kernel_ready_line;

    #[test]
    fn parse_kernel_ready_extracts_socket_path() {
        assert_eq!(
            parse_kernel_ready_line("KERNEL_READY /tmp/semblance/kernel.sock"),
            Some("/tmp/semblance/kernel.sock".to_string())
        );
    }

    #[test]
    fn parse_kernel_ready_rejects_invalid_lines() {
        assert_eq!(parse_kernel_ready_line("READY /tmp/x"), None);
        assert_eq!(parse_kernel_ready_line("KERNEL_READY "), None);
        assert_eq!(parse_kernel_ready_line(""), None);
    }
}
