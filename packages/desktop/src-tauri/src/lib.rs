// Semblance Desktop — Tauri 2.0 application library
//
// AUTONOMOUS DECISION: Sidecar process model with NDJSON stdin/stdout IPC.
// Reasoning: SemblanceCore and Gateway are TypeScript packages that require
// a Node.js runtime. The Rust backend spawns a single Node.js sidecar process
// that hosts both Core and Gateway, communicating via NDJSON over stdin/stdout.
// This is the simplest integration approach for end-to-end functionality.
// Production process isolation (OS-level sandboxing) is a future enhancement.
//
// All network access is mediated by the Core's OllamaProvider (localhost-only)
// and the Gateway's validation pipeline. No direct network calls from this
// Rust process or the frontend.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Listener;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

mod hardware;
mod native_runtime;
use native_runtime::RuntimeStatus;

// ─── Data Types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaStatus {
    pub status: String,
    pub active_model: Option<String>,
    pub available_models: Vec<String>,
    pub inference_engine: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexingStatus {
    pub state: String,
    pub files_scanned: u32,
    pub files_total: u32,
    pub chunks_created: u32,
    pub current_file: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStats {
    pub document_count: u32,
    pub chunk_count: u32,
    pub index_size_bytes: u64,
    pub last_indexed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActionLogEntry {
    pub id: String,
    pub timestamp: String,
    pub action: String,
    pub status: String,
    pub description: String,
    pub autonomy_tier: String,
    pub payload_hash: String,
    pub audit_ref: String,
    pub estimated_time_saved_seconds: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrivacyStatus {
    pub all_local: bool,
    pub connection_count: u32,
    pub last_audit_entry: Option<String>,
    pub anomaly_detected: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutonomyConfig {
    pub domains: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceCredentialInfo {
    pub id: String,
    pub service_type: String,
    pub protocol: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub use_tls: bool,
    pub display_name: String,
    pub created_at: String,
    pub last_verified_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub error: Option<String>,
    pub calendars: Option<Vec<CalendarInfo>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarInfo {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    #[serde(rename = "readOnly")]
    pub read_only: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountStatus {
    pub id: String,
    pub service_type: String,
    pub protocol: String,
    pub display_name: String,
    pub host: String,
    pub username: String,
    pub last_verified_at: Option<String>,
    pub status: String,
}

// ─── Sidecar Bridge ───────────────────────────────────────────────────────────

/// Manages communication with the Node.js sidecar process that hosts
/// SemblanceCore and Gateway.
struct SidecarBridge {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: Arc<Mutex<u64>>,
    child: Arc<Mutex<Child>>,
}

impl SidecarBridge {
    /// Spawn the sidecar process and start reading its stdout.
    /// Events from the sidecar are forwarded as Tauri events to the frontend.
    async fn spawn(project_root: PathBuf, app_handle: tauri::AppHandle, runtime: native_runtime::SharedNativeRuntime) -> Result<Self, String> {
        // Production: use bundled bridge.cjs with system node
        // Development: use tsx to run bridge.ts from source
        // Use the exe's parent directory — resources are placed alongside the exe
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| project_root.clone());
        let bundled_bridge = exe_dir.join("sidecar").join("bridge.cjs");
        eprintln!("[tauri] Looking for bundled bridge at: {:?} exists={}", bundled_bridge, bundled_bridge.exists());

        let (node_path, script_path, working_dir) = if bundled_bridge.exists() {
            // Production mode: bundled bridge.cjs, use system node
            let node = which_node().ok_or("Node.js not found. Install Node.js 20+ to run Semblance.")?;
            eprintln!("[tauri] Production mode: node={:?} script={:?}", node, bundled_bridge);
            (node, bundled_bridge, exe_dir.join("sidecar"))
        } else {
            // Development mode: tsx from node_modules
            #[cfg(windows)]
            let tsx_path = project_root.join("node_modules").join(".bin").join("tsx.cmd");
            #[cfg(not(windows))]
            let tsx_path = project_root.join("node_modules").join(".bin").join("tsx");

            let sidecar_script = project_root
                .join("packages")
                .join("desktop")
                .join("src-tauri")
                .join("sidecar")
                .join("bridge.ts");

            if !tsx_path.exists() {
                return Err(format!(
                    "tsx not found at {:?}. Run `pnpm add -Dw tsx` in the project root.",
                    tsx_path
                ));
            }

            if !sidecar_script.exists() {
                return Err(format!("Sidecar script not found at {:?}", sidecar_script));
            }

            (tsx_path, sidecar_script, project_root.clone())
        };

        let mut cmd = Command::new(&node_path);
        cmd.arg("--max-old-space-size=4096")
            .arg("--expose-gc")
            .arg(&script_path)
            .current_dir(&working_dir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to take sidecar stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to take sidecar stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Failed to take sidecar stderr")?;

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let bridge = SidecarBridge {
            stdin: Arc::new(Mutex::new(stdin)),
            pending: pending.clone(),
            next_id: Arc::new(Mutex::new(1)),
            child: Arc::new(Mutex::new(child)),
        };

        // Background task: read stdout lines from sidecar, dispatch events, responses, and callbacks
        let pending_for_stdout = pending.clone();
        let app_for_stdout = app_handle.clone();
        let stdin_for_callbacks = bridge.stdin.clone();
        let runtime_for_callbacks = runtime.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                    // Step 9: NDJSON callback requests from sidecar → Rust NativeRuntime
                    if msg.get("type").and_then(|v| v.as_str()) == Some("callback") {
                        let callback_id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let params = msg.get("params").cloned().unwrap_or(Value::Null);

                        // Dispatch callback to NativeRuntime in background
                        let stdin_ref = stdin_for_callbacks.clone();
                        let runtime_ref = runtime_for_callbacks.clone();
                        tauri::async_runtime::spawn(async move {
                            let response = dispatch_native_callback(runtime_ref, &method, params).await;
                            let response_msg = match response {
                                Ok(result) => serde_json::json!({
                                    "type": "callback_response",
                                    "id": callback_id,
                                    "result": result,
                                }),
                                Err(error) => serde_json::json!({
                                    "type": "callback_response",
                                    "id": callback_id,
                                    "error": error,
                                }),
                            };

                            let line = format!("{}\n", serde_json::to_string(&response_msg).unwrap());
                            let mut stdin = stdin_ref.lock().await;
                            let _ = stdin.write_all(line.as_bytes()).await;
                            let _ = stdin.flush().await;
                        });
                    } else if let Some(event_name) = msg.get("event").and_then(|v| v.as_str()) {
                        // Forward sidecar event as Tauri event
                        let data = msg.get("data").cloned().unwrap_or(Value::Null);
                        let full_event = format!("semblance://{}", event_name);
                        let _ = app_for_stdout.emit(&full_event, &data);
                    } else if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                        // Response to a pending request
                        let mut pending_map = pending_for_stdout.lock().await;
                        if let Some(sender) = pending_map.remove(&id) {
                            if let Some(error) = msg.get("error").and_then(|v| v.as_str()) {
                                let _ = sender.send(Err(error.to_string()));
                            } else {
                                let result =
                                    msg.get("result").cloned().unwrap_or(Value::Null);
                                let _ = sender.send(Ok(result));
                            }
                        }
                    }
                }
            }
            // stdout closed — sidecar died
            let _ = app_for_stdout.emit(
                "semblance://status-update",
                serde_json::json!({"ollamaStatus": "disconnected", "gatewayStatus": "disconnected", "error": "Sidecar process exited unexpectedly"}),
            );
        });

        // Background task: read stderr from sidecar (logging + file)
        let log_dir = {
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".semblance").join("data")
        };
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("sidecar.log");

        tauri::async_runtime::spawn(async move {
            use std::io::Write;
            // Append mode — File::create was truncating on every restart,
            // destroying all diagnostic history. Append preserves all sessions.
            let mut log_file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .ok();
            // Session separator so multiple restarts are distinguishable
            if let Some(ref mut f) = log_file {
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = writeln!(f, "\n=== SESSION START unix={} ===", ts);
                let _ = f.flush();
            }

            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[sidecar] {}", line);
                if let Some(ref mut f) = log_file {
                    let _ = writeln!(f, "{}", line);
                    let _ = f.flush();
                }
            }
        });

        Ok(bridge)
    }

    /// Send a JSON-RPC request to the sidecar and wait for the response.
    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = {
            let mut next = self.next_id.lock().await;
            let id = *next;
            *next += 1;
            id
        };

        // Register a response channel
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        // Write the request to stdin
        let request = serde_json::json!({
            "id": id,
            "method": method,
            "params": params,
        });

        {
            let mut stdin = self.stdin.lock().await;
            let line = format!("{}\n", serde_json::to_string(&request).unwrap());
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;
        }

        // Wait for the response (with timeout)
        match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Sidecar response channel closed".to_string()),
            Err(_) => {
                // Remove pending entry on timeout
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                Err("Sidecar request timed out (120s)".to_string())
            }
        }
    }

    /// Send a fire-and-forget request that also registers for a response.
    /// Used for send_message and start_indexing which respond immediately
    /// and then emit events asynchronously.
    async fn call_fire(&self, method: &str, params: Value) -> Result<Value, String> {
        // Same as call() but with a shorter timeout since these return quickly
        let id = {
            let mut next = self.next_id.lock().await;
            let id = *next;
            *next += 1;
            id
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        let request = serde_json::json!({
            "id": id,
            "method": method,
            "params": params,
        });

        {
            let mut stdin = self.stdin.lock().await;
            let line = format!("{}\n", serde_json::to_string(&request).unwrap());
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;
        }

        // Short timeout for the initial response
        match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Sidecar response channel closed".to_string()),
            Err(_) => {
                let mut pending = self.pending.lock().await;
                pending.remove(&id);
                Err("Sidecar initial response timed out".to_string())
            }
        }
    }

    /// Shut down the sidecar process gracefully.
    async fn shutdown(&self) {
        // Try graceful shutdown
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            self.call("shutdown", Value::Null),
        )
        .await;

        // Force kill if still running
        let mut child = self.child.lock().await;
        let _ = child.kill().await;
    }
}

/// Wrapper struct for Tauri managed state.
struct AppBridge {
    bridge: SidecarBridge,
}

// ─── Tauri Commands ────────────────────────────────────────────────────────

/// Send a message to the Orchestrator. Streams tokens back via events.
#[tauri::command]
async fn send_message(
    state: tauri::State<'_, AppBridge>,
    message: String,
    conversation_id: Option<String>,
    attachments: Option<Value>,
) -> Result<Value, String> {
    state
        .bridge
        .call_fire("send_message", serde_json::json!({
            "message": message,
            "conversation_id": conversation_id,
            "attachments": attachments,
        }))
        .await
}

/// Check Ollama connection status and list available models.
#[tauri::command]
async fn get_ollama_status(state: tauri::State<'_, AppBridge>) -> Result<OllamaStatus, String> {
    let result = state.bridge.call("get_ollama_status", Value::Null).await?;

    Ok(OllamaStatus {
        status: result
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("disconnected")
            .to_string(),
        active_model: result
            .get("active_model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        available_models: result
            .get("available_models")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        inference_engine: result
            .get("inferenceEngine")
            .and_then(|v| v.as_str())
            .unwrap_or("none")
            .to_string(),
    })
}

/// Switch the active LLM model.
#[tauri::command]
async fn select_model(
    state: tauri::State<'_, AppBridge>,
    model_id: String,
) -> Result<(), String> {
    state
        .bridge
        .call("select_model", serde_json::json!({"model_id": model_id}))
        .await?;
    Ok(())
}

/// Start indexing the given directories.
#[tauri::command]
async fn start_indexing(
    state: tauri::State<'_, AppBridge>,
    directories: Vec<String>,
) -> Result<(), String> {
    state
        .bridge
        .call_fire(
            "start_indexing",
            serde_json::json!({"directories": directories}),
        )
        .await?;
    Ok(())
}

/// Get current indexing state.
#[tauri::command]
async fn get_indexing_status(
    state: tauri::State<'_, AppBridge>,
) -> Result<IndexingStatus, String> {
    let result = state
        .bridge
        .call("get_indexing_status", Value::Null)
        .await?;

    Ok(serde_json::from_value(result).map_err(|e| format!("Failed to parse indexing status: {}", e))?)
}

/// Query the audit trail for paginated action log entries.
#[tauri::command]
async fn get_action_log(
    state: tauri::State<'_, AppBridge>,
    limit: u32,
    offset: u32,
) -> Result<Vec<ActionLogEntry>, String> {
    let result = state
        .bridge
        .call(
            "get_action_log",
            serde_json::json!({"limit": limit, "offset": offset}),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse action log: {}", e))
}

/// Get privacy status from the Gateway.
#[tauri::command]
async fn get_privacy_status(state: tauri::State<'_, AppBridge>) -> Result<PrivacyStatus, String> {
    let result = state
        .bridge
        .call("get_privacy_status", Value::Null)
        .await?;

    Ok(PrivacyStatus {
        all_local: result
            .get("all_local")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        connection_count: result
            .get("connection_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        last_audit_entry: result
            .get("last_audit_entry")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        anomaly_detected: result
            .get("anomaly_detected")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

/// Persist the user's chosen name for their Semblance.
#[tauri::command]
async fn set_user_name(state: tauri::State<'_, AppBridge>, name: String) -> Result<(), String> {
    state
        .bridge
        .call("set_user_name", serde_json::json!({"name": name}))
        .await?;
    Ok(())
}

/// Retrieve the user's chosen name.
#[tauri::command]
async fn get_user_name(state: tauri::State<'_, AppBridge>) -> Result<Option<String>, String> {
    let result = state.bridge.call("get_user_name", Value::Null).await?;
    Ok(result
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

/// Update autonomy tier for a domain.
#[tauri::command]
async fn set_autonomy_tier(
    state: tauri::State<'_, AppBridge>,
    domain: String,
    tier: String,
) -> Result<(), String> {
    state
        .bridge
        .call(
            "set_autonomy_tier",
            serde_json::json!({"domain": domain, "tier": tier}),
        )
        .await?;
    Ok(())
}

/// Get current autonomy configuration.
#[tauri::command]
async fn get_autonomy_config(
    state: tauri::State<'_, AppBridge>,
) -> Result<AutonomyConfig, String> {
    let result = state
        .bridge
        .call("get_autonomy_config", Value::Null)
        .await?;

    let domains = result
        .get("domains")
        .and_then(|v| serde_json::from_value::<HashMap<String, String>>(v.clone()).ok())
        .unwrap_or_default();

    Ok(AutonomyConfig { domains })
}

/// Get list of currently indexed directories.
#[tauri::command]
async fn get_indexed_directories(
    state: tauri::State<'_, AppBridge>,
) -> Result<Vec<String>, String> {
    let result = state
        .bridge
        .call("get_indexed_directories", Value::Null)
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse indexed directories: {}", e))
}

/// Get knowledge graph statistics.
#[tauri::command]
async fn get_knowledge_stats(
    state: tauri::State<'_, AppBridge>,
) -> Result<KnowledgeStats, String> {
    let result = state
        .bridge
        .call("get_knowledge_stats", Value::Null)
        .await?;

    Ok(serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse knowledge stats: {}", e))?)
}

/// Get chat history (paginated).
#[tauri::command]
async fn get_chat_history(
    state: tauri::State<'_, AppBridge>,
    limit: u32,
    offset: u32,
) -> Result<Vec<ChatMessage>, String> {
    let result = state
        .bridge
        .call(
            "get_chat_history",
            serde_json::json!({"limit": limit, "offset": offset}),
        )
        .await?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse chat history: {}", e))
}

/// Set onboarding complete flag.
#[tauri::command]
async fn set_onboarding_complete(state: tauri::State<'_, AppBridge>) -> Result<(), String> {
    state
        .bridge
        .call("set_onboarding_complete", Value::Null)
        .await?;
    Ok(())
}

/// Check if onboarding has been completed.
#[tauri::command]
async fn get_onboarding_complete(state: tauri::State<'_, AppBridge>) -> Result<bool, String> {
    let result = state
        .bridge
        .call("get_onboarding_complete", Value::Null)
        .await?;
    Ok(result
        .get("complete")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

// ─── Credential Management Commands ─────────────────────────────────────────

/// Add a new service credential (email or calendar).
#[tauri::command]
async fn add_credential(
    state: tauri::State<'_, AppBridge>,
    service_type: String,
    protocol: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    use_tls: bool,
    display_name: String,
) -> Result<ServiceCredentialInfo, String> {
    let result = state
        .bridge
        .call(
            "add_credential",
            serde_json::json!({
                "serviceType": service_type,
                "protocol": protocol,
                "host": host,
                "port": port,
                "username": username,
                "password": password,
                "useTLS": use_tls,
                "displayName": display_name,
            }),
        )
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse credential response: {}", e))
}

/// List credentials by service type ("email", "calendar", or "all").
#[tauri::command]
async fn list_credentials(
    state: tauri::State<'_, AppBridge>,
    service_type: String,
) -> Result<Vec<ServiceCredentialInfo>, String> {
    let result = state
        .bridge
        .call(
            "list_credentials",
            serde_json::json!({"service_type": service_type}),
        )
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse credentials list: {}", e))
}

/// Remove a credential by ID.
#[tauri::command]
async fn remove_credential(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<(), String> {
    state
        .bridge
        .call("remove_credential", serde_json::json!({"id": id}))
        .await?;
    Ok(())
}

/// Test a credential's connection (IMAP, SMTP, or CalDAV).
#[tauri::command]
async fn test_credential(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<ConnectionTestResult, String> {
    let result = state
        .bridge
        .call("test_credential", serde_json::json!({"id": id}))
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse connection test result: {}", e))
}

/// Discover available calendars for a CalDAV credential.
#[tauri::command]
async fn discover_calendars(
    state: tauri::State<'_, AppBridge>,
    credential_id: String,
) -> Result<Vec<CalendarInfo>, String> {
    let result = state
        .bridge
        .call(
            "discover_calendars",
            serde_json::json!({"credential_id": credential_id}),
        )
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse calendars: {}", e))
}

/// Get status of all configured accounts.
#[tauri::command]
async fn get_accounts_status(
    state: tauri::State<'_, AppBridge>,
) -> Result<Vec<AccountStatus>, String> {
    let result = state
        .bridge
        .call("get_accounts_status", Value::Null)
        .await?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse accounts status: {}", e))
}

/// Get provider presets for email/calendar configuration.
#[tauri::command]
async fn get_provider_presets(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state
        .bridge
        .call("get_provider_presets", Value::Null)
        .await
}

// ─── Universal Inbox & AI Action Commands (Step 6) ───────────────────────

/// Get inbox items (indexed emails) with pagination.
#[tauri::command]
async fn get_inbox_items(
    state: tauri::State<'_, AppBridge>,
    limit: u32,
    offset: u32,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "inbox:getItems",
            serde_json::json!({"limit": limit, "offset": offset}),
        )
        .await
}

/// Get proactive insights (meeting preps, follow-ups, deadlines).
#[tauri::command]
async fn get_proactive_insights(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("inbox:getProactiveInsights", Value::Null)
        .await
}

/// Get today's calendar events.
#[tauri::command]
async fn get_today_events(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("inbox:getTodayEvents", Value::Null)
        .await
}

/// Get actions summary (count, time saved, recent actions).
#[tauri::command]
async fn get_actions_summary(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("inbox:getActionsSummary", Value::Null)
        .await
}

/// Archive one or more emails by message ID.
#[tauri::command]
async fn archive_emails(
    state: tauri::State<'_, AppBridge>,
    message_ids: Vec<String>,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "email:archive",
            serde_json::json!({"message_ids": message_ids}),
        )
        .await
}

/// Send an email (user-initiated, routed through orchestrator for autonomy).
#[tauri::command]
async fn send_email_action(
    state: tauri::State<'_, AppBridge>,
    to: Vec<String>,
    subject: String,
    body: String,
    reply_to_message_id: Option<String>,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "email:sendAction",
            serde_json::json!({
                "to": to,
                "subject": subject,
                "body": body,
                "replyToMessageId": reply_to_message_id,
            }),
        )
        .await
}

/// Save a draft email.
#[tauri::command]
async fn draft_email_action(
    state: tauri::State<'_, AppBridge>,
    to: Vec<String>,
    subject: String,
    body: String,
    reply_to_message_id: Option<String>,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "email:draftAction",
            serde_json::json!({
                "to": to,
                "subject": subject,
                "body": body,
                "replyToMessageId": reply_to_message_id,
            }),
        )
        .await
}

/// Undo a previously executed action.
#[tauri::command]
async fn undo_action(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call("action:undo", serde_json::json!({"action_id": action_id}))
        .await
}

/// Dismiss a proactive insight.
#[tauri::command]
async fn dismiss_insight(
    state: tauri::State<'_, AppBridge>,
    insight_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "insight:dismiss",
            serde_json::json!({"insight_id": insight_id}),
        )
        .await
}

/// Get pending actions awaiting user approval.
#[tauri::command]
async fn get_pending_actions(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("action:getPending", Value::Null).await
}

/// Approve a pending action for execution.
#[tauri::command]
async fn approve_action(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "action:approve",
            serde_json::json!({"action_id": action_id}),
        )
        .await
}

/// Reject a pending action.
#[tauri::command]
async fn reject_action(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "action:reject",
            serde_json::json!({"action_id": action_id}),
        )
        .await
}

/// Get approval count for an action type (how many consecutive approvals).
#[tauri::command]
async fn get_approval_count(
    state: tauri::State<'_, AppBridge>,
    action_type: String,
    payload: Value,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "action:getApprovalCount",
            serde_json::json!({"action_type": action_type, "payload": payload}),
        )
        .await
}

/// Get approval threshold for an action type.
#[tauri::command]
async fn get_approval_threshold(
    state: tauri::State<'_, AppBridge>,
    action_type: String,
    payload: Value,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "action:getApprovalThreshold",
            serde_json::json!({"action_type": action_type, "payload": payload}),
        )
        .await
}

/// Start email indexing for a specific account.
#[tauri::command]
async fn start_email_index(
    state: tauri::State<'_, AppBridge>,
    account_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call_fire(
            "email:startIndex",
            serde_json::json!({"account_id": account_id}),
        )
        .await
}

/// Start calendar indexing for a specific account.
#[tauri::command]
async fn start_calendar_index(
    state: tauri::State<'_, AppBridge>,
    account_id: String,
) -> Result<Value, String> {
    state
        .bridge
        .call_fire(
            "calendar:startIndex",
            serde_json::json!({"account_id": account_id}),
        )
        .await
}

/// Run the proactive context engine manually.
#[tauri::command]
async fn run_proactive_engine(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("proactive:run", Value::Null).await
}

// ─── Step 7: Subscription Detection ─────────────────────────────────────────

/// Import a bank statement (CSV/OFX) from local filesystem.
#[tauri::command]
async fn import_statement(
    state: tauri::State<'_, AppBridge>,
    file_path: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "finance:importStatement",
            serde_json::json!({"file_path": file_path}),
        )
        .await
}

/// Get stored subscription/recurring charges.
#[tauri::command]
async fn get_subscriptions(
    state: tauri::State<'_, AppBridge>,
    status: Option<String>,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "finance:getSubscriptions",
            serde_json::json!({"status": status}),
        )
        .await
}

/// Update subscription status (cancel, keep, etc.).
#[tauri::command]
async fn update_subscription_status(
    state: tauri::State<'_, AppBridge>,
    charge_id: String,
    status: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "finance:updateSubscriptionStatus",
            serde_json::json!({"charge_id": charge_id, "status": status}),
        )
        .await
}

/// Get subscription summary (totals, forgotten count, savings).
#[tauri::command]
async fn get_subscription_summary(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("finance:getSummary", Value::Null).await
}

// ─── Step 7: Autonomy Escalation ────────────────────────────────────────────

/// Check for available autonomy escalation prompts.
#[tauri::command]
async fn check_escalations(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("escalation:check", Value::Null).await
}

/// Respond to an escalation prompt (accept or dismiss).
#[tauri::command]
async fn respond_to_escalation(
    state: tauri::State<'_, AppBridge>,
    prompt_id: String,
    accepted: bool,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "escalation:respond",
            serde_json::json!({"prompt_id": prompt_id, "accepted": accepted}),
        )
        .await
}

/// Get active (pending) escalation prompts.
#[tauri::command]
async fn get_active_escalations(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("escalation:getActive", Value::Null).await
}

// ─── Step 7: Knowledge Moment ───────────────────────────────────────────────

/// Generate a cross-source knowledge moment.
#[tauri::command]
async fn generate_knowledge_moment(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("knowledge:generateMoment", Value::Null)
        .await
}

// ─── Step 7: Weekly Digest ──────────────────────────────────────────────────

/// Generate a weekly digest for the specified period.
#[tauri::command]
async fn generate_digest(
    state: tauri::State<'_, AppBridge>,
    week_start: String,
    week_end: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "digest:generate",
            serde_json::json!({"week_start": week_start, "week_end": week_end}),
        )
        .await
}

/// Get the most recent weekly digest.
#[tauri::command]
async fn get_latest_digest(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("digest:getLatest", Value::Null).await
}

/// List all generated digests (summaries).
#[tauri::command]
async fn list_digests(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("digest:list", Value::Null).await
}

// ─── Network Monitor (Step 8) ──────────────────────────────────────────────

#[tauri::command]
async fn get_active_connections(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("network:getActiveConnections", Value::Null).await
}

#[tauri::command]
async fn get_network_statistics(
    state: tauri::State<'_, AppBridge>,
    period: String,
) -> Result<Value, String> {
    state
        .bridge
        .call("network:getStatistics", serde_json::json!({ "period": period }))
        .await
}

#[tauri::command]
async fn get_network_allowlist(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("network:getAllowlist", Value::Null).await
}

#[tauri::command]
async fn get_unauthorized_attempts(
    state: tauri::State<'_, AppBridge>,
    period: Option<String>,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "network:getUnauthorizedAttempts",
            serde_json::json!({ "period": period }),
        )
        .await
}

#[tauri::command]
async fn get_connection_timeline(
    state: tauri::State<'_, AppBridge>,
    period: String,
    granularity: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "network:getTimeline",
            serde_json::json!({ "period": period, "granularity": granularity }),
        )
        .await
}

#[tauri::command]
async fn get_connection_history(
    state: tauri::State<'_, AppBridge>,
    limit: Option<u32>,
) -> Result<Value, String> {
    state
        .bridge
        .call("network:getHistory", serde_json::json!({ "limit": limit }))
        .await
}

#[tauri::command]
async fn generate_privacy_report(
    state: tauri::State<'_, AppBridge>,
    start_date: String,
    end_date: String,
    format: String,
) -> Result<Value, String> {
    state
        .bridge
        .call(
            "network:generateReport",
            serde_json::json!({
                "start_date": start_date,
                "end_date": end_date,
                "format": format
            }),
        )
        .await
}

#[tauri::command]
async fn get_network_trust_status(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("network:getTrustStatus", Value::Null)
        .await
}

// ─── Task Routing (Step 8) ─────────────────────────────────────────────────

#[tauri::command]
async fn get_routing_devices(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("routing:getDevices", Value::Null).await
}

#[tauri::command]
async fn route_task(
    state: tauri::State<'_, AppBridge>,
    task: Value,
) -> Result<Value, String> {
    state
        .bridge
        .call("routing:routeTask", serde_json::json!({ "task": task }))
        .await
}

#[tauri::command]
async fn assess_task(
    state: tauri::State<'_, AppBridge>,
    task: Value,
) -> Result<Value, String> {
    state
        .bridge
        .call("routing:assessTask", serde_json::json!({ "task": task }))
        .await
}

// ─── NDJSON Callback Dispatch (Step 9) ────────────────────────────────────────

/// Dispatch a callback request from the Node.js sidecar to NativeRuntime.
/// Called when the stdout reader detects a {"type":"callback",...} message.
///
/// LOCKED DECISION: Uses NDJSON callbacks, not Tauri invoke from sidecar.
async fn dispatch_native_callback(
    runtime: native_runtime::SharedNativeRuntime,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "native_generate" => {
            let request: native_runtime::GenerateRequest =
                serde_json::from_value(params).map_err(|e| format!("Invalid generate params: {}", e))?;

            let rt = runtime.lock().await;
            let result = rt.generate(request)?;
            serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
        }
        "native_embed" => {
            let request: native_runtime::EmbedRequest =
                serde_json::from_value(params).map_err(|e| format!("Invalid embed params: {}", e))?;

            let rt = runtime.lock().await;
            let result = rt.embed(request)?;
            serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
        }
        "native_load_model" => {
            let model_path = params
                .get("model_path")
                .and_then(|v| v.as_str())
                .ok_or("Missing model_path parameter")?;
            let model_type = params
                .get("model_type")
                .and_then(|v| v.as_str())
                .unwrap_or("reasoning");

            let path = PathBuf::from(model_path);
            let mut rt = runtime.lock().await;
            if model_type == "embedding" {
                rt.load_embedding_model(path)?;
            } else {
                rt.load_reasoning_model(path)?;
            }
            Ok(serde_json::json!({ "status": "loaded" }))
        }
        "native_status" => {
            let rt = runtime.lock().await;
            let status_str = match rt.status() {
                RuntimeStatus::Ready => "ready",
                RuntimeStatus::Loading => "loading",
                RuntimeStatus::Uninitialized => "uninitialized",
                RuntimeStatus::Error(_) => "error",
            };
            Ok(serde_json::json!({
                "status": status_str,
                "reasoning_model": rt.reasoning_model_path().map(|p| p.display().to_string()),
                "embedding_model": rt.embedding_model_path().map(|p| p.display().to_string()),
            }))
        }
        _ => Err(format!("Unknown native callback method: {}", method)),
    }
}

// ─── Hardware Detection & Runtime Management (Step 9) ───────────────────────

/// Detect hardware profile for model selection. All detection is local.
#[tauri::command]
async fn detect_hardware() -> Result<hardware::HardwareProfile, String> {
    Ok(hardware::detect_hardware())
}

// ─── Founding Member Activation (Deep Link) ─────────────────────────────────

/// Activate a founding member token via the sidecar bridge.
/// Called from the frontend after receiving a deep link or manual code entry.
#[tauri::command]
async fn activate_founding_token(
    state: tauri::State<'_, AppBridge>,
    token: String,
) -> Result<Value, String> {
    state
        .bridge
        .call("license:activate_founding", serde_json::json!({ "token": token }))
        .await
}

/// Activate a sem_ license key via the sidecar bridge.
/// Called from the frontend after manual key entry or deep link activation.
#[tauri::command]
async fn activate_license_key(
    state: tauri::State<'_, AppBridge>,
    key: String,
) -> Result<Value, String> {
    state
        .bridge
        .call("license:activate_key", serde_json::json!({ "key": key }))
        .await
}

/// Get current license status from the sidecar bridge.
#[tauri::command]
async fn get_license_status(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state
        .bridge
        .call("license:status", serde_json::json!({}))
        .await
}

// ─── Conversation Management Commands ────────────────────────────────────────

#[tauri::command]
async fn list_conversations(
    state: tauri::State<'_, AppBridge>,
    limit: Option<u32>,
    offset: Option<u32>,
    pinned_only: Option<bool>,
    search: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("list_conversations", serde_json::json!({
        "limit": limit, "offset": offset, "pinnedOnly": pinned_only, "search": search,
    })).await
}

#[tauri::command]
async fn get_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("get_conversation", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn create_conversation(
    state: tauri::State<'_, AppBridge>,
    first_message: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("create_conversation", serde_json::json!({ "first_message": first_message })).await
}

#[tauri::command]
async fn delete_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("delete_conversation", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn rename_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
    title: String,
) -> Result<Value, String> {
    state.bridge.call("rename_conversation", serde_json::json!({ "id": id, "title": title })).await
}

#[tauri::command]
async fn pin_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("pin_conversation", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn unpin_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("unpin_conversation", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn switch_conversation(
    state: tauri::State<'_, AppBridge>,
    id: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    state.bridge.call("switch_conversation", serde_json::json!({ "id": id, "limit": limit })).await
}

#[tauri::command]
async fn search_conversations(
    state: tauri::State<'_, AppBridge>,
    query: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    state.bridge.call("search_conversations", serde_json::json!({ "query": query, "limit": limit })).await
}

#[tauri::command]
async fn clear_all_conversations(
    state: tauri::State<'_, AppBridge>,
    preserve_pinned: Option<bool>,
) -> Result<Value, String> {
    state.bridge.call("clear_all_conversations", serde_json::json!({ "preserve_pinned": preserve_pinned })).await
}

#[tauri::command]
async fn set_conversation_auto_expiry(
    state: tauri::State<'_, AppBridge>,
    days: Option<u32>,
) -> Result<Value, String> {
    state.bridge.call("set_conversation_auto_expiry", serde_json::json!({ "days": days })).await
}

// ─── Intent Layer ──────────────────────────────────────────────────────────

#[tauri::command]
async fn get_intent(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("get_intent", Value::Null).await
}

#[tauri::command]
async fn set_primary_goal(state: tauri::State<'_, AppBridge>, text: String) -> Result<Value, String> {
    state.bridge.call("set_primary_goal", serde_json::json!({ "text": text })).await
}

#[tauri::command]
async fn add_hard_limit(
    state: tauri::State<'_, AppBridge>,
    raw_text: String,
    source: String,
) -> Result<Value, String> {
    state.bridge.call("add_hard_limit", serde_json::json!({ "rawText": raw_text, "source": source })).await
}

#[tauri::command]
async fn remove_hard_limit(state: tauri::State<'_, AppBridge>, id: String) -> Result<Value, String> {
    state.bridge.call("remove_hard_limit", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn toggle_hard_limit(
    state: tauri::State<'_, AppBridge>,
    id: String,
    active: bool,
) -> Result<Value, String> {
    state.bridge.call("toggle_hard_limit", serde_json::json!({ "id": id, "active": active })).await
}

#[tauri::command]
async fn add_personal_value(
    state: tauri::State<'_, AppBridge>,
    raw_text: String,
    source: String,
) -> Result<Value, String> {
    state.bridge.call("add_personal_value", serde_json::json!({ "rawText": raw_text, "source": source })).await
}

#[tauri::command]
async fn remove_personal_value(state: tauri::State<'_, AppBridge>, id: String) -> Result<Value, String> {
    state.bridge.call("remove_personal_value", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn get_intent_observations(
    state: tauri::State<'_, AppBridge>,
    channel: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("get_intent_observations", serde_json::json!({ "channel": channel })).await
}

#[tauri::command]
async fn dismiss_observation(
    state: tauri::State<'_, AppBridge>,
    id: String,
    user_response: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("dismiss_observation", serde_json::json!({ "id": id, "userResponse": user_response })).await
}

#[tauri::command]
async fn check_action_intent(
    state: tauri::State<'_, AppBridge>,
    action: String,
    context: Value,
) -> Result<Value, String> {
    state.bridge.call("check_action_intent", serde_json::json!({ "action": action, "context": context })).await
}

#[tauri::command]
async fn set_intent_onboarding(
    state: tauri::State<'_, AppBridge>,
    primary_goal: Option<String>,
    hard_limit: Option<String>,
    personal_value: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("set_intent_onboarding", serde_json::json!({
        "primaryGoal": primary_goal,
        "hardLimit": hard_limit,
        "personalValue": personal_value,
    })).await
}

// ─── Alter Ego Guardrails ──────────────────────────────────────────────────

#[tauri::command]
async fn alter_ego_get_settings(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("alterEgo:getSettings", Value::Null).await
}

#[tauri::command]
async fn alter_ego_update_settings(
    state: tauri::State<'_, AppBridge>,
    settings: Value,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:updateSettings", settings).await
}

#[tauri::command]
async fn alter_ego_get_receipts(
    state: tauri::State<'_, AppBridge>,
    week_group: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:getReceipts", serde_json::json!({ "weekGroup": week_group })).await
}

#[tauri::command]
async fn alter_ego_approve_batch(
    state: tauri::State<'_, AppBridge>,
    ids: Vec<String>,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:approveBatch", serde_json::json!({ "ids": ids })).await
}

#[tauri::command]
async fn alter_ego_reject_batch(
    state: tauri::State<'_, AppBridge>,
    ids: Vec<String>,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:rejectBatch", serde_json::json!({ "ids": ids })).await
}

#[tauri::command]
async fn alter_ego_send_draft(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
    email: String,
    action: String,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:sendDraft", serde_json::json!({
        "actionId": action_id,
        "email": email,
        "action": action,
    })).await
}

#[tauri::command]
async fn alter_ego_undo_receipt(
    state: tauri::State<'_, AppBridge>,
    receipt_id: String,
) -> Result<Value, String> {
    state.bridge.call("alterEgo:undoReceipt", serde_json::json!({ "receiptId": receipt_id })).await
}

// ─── Sound Settings ──────────────────────────────────────────────────────────

#[tauri::command]
async fn get_sound_settings(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("sound:getSettings", Value::Null).await
}

#[tauri::command]
async fn save_sound_settings(
    state: tauri::State<'_, AppBridge>,
    settings: Value,
) -> Result<Value, String> {
    state.bridge.call("sound:saveSettings", settings).await
}

// ─── Notification Settings ────────────────────────────────────────────────

#[tauri::command]
async fn get_notification_settings(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("notification:getSettings", Value::Null).await
}

#[tauri::command]
async fn save_notification_settings(
    state: tauri::State<'_, AppBridge>,
    settings: Value,
) -> Result<Value, String> {
    state.bridge.call("notification:saveSettings", settings).await
}

// ─── Location Settings ───────────────────────────────────────────────────

#[tauri::command]
async fn get_location_settings(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("location:getSettings", Value::Null).await
}

#[tauri::command]
async fn save_location_settings(
    state: tauri::State<'_, AppBridge>,
    settings: Value,
) -> Result<Value, String> {
    state.bridge.call("location:saveSettings", settings).await
}

#[tauri::command]
async fn clear_location_history(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("location:clearHistory", Value::Null).await
}

// ─── Language Preference ──────────────────────────────────────────────────

#[tauri::command]
async fn get_language_preference(state: tauri::State<'_, AppBridge>) -> Result<Value, String> {
    state.bridge.call("language:get", Value::Null).await
}

#[tauri::command]
async fn set_language_preference(
    state: tauri::State<'_, AppBridge>,
    code: String,
) -> Result<Value, String> {
    state
        .bridge
        .call("language:set", serde_json::json!({ "code": code }))
        .await
}

// ─── Knowledge Curation Commands ───────────────────────────────────────────

#[tauri::command]
async fn list_knowledge_by_category(
    state: tauri::State<'_, AppBridge>,
    category: String,
    limit: u32,
    offset: u32,
    search_query: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("knowledge:listByCategory", serde_json::json!({
        "category": category,
        "limit": limit,
        "offset": offset,
        "searchQuery": search_query,
    })).await
}

#[tauri::command]
async fn remove_knowledge_item(
    state: tauri::State<'_, AppBridge>,
    chunk_id: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge:remove", serde_json::json!({
        "chunkId": chunk_id,
    })).await
}

#[tauri::command]
async fn delete_knowledge_item(
    state: tauri::State<'_, AppBridge>,
    chunk_id: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge:delete", serde_json::json!({
        "chunkId": chunk_id,
    })).await
}

#[tauri::command]
async fn recategorize_knowledge_item(
    state: tauri::State<'_, AppBridge>,
    chunk_id: String,
    new_category: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge:recategorize", serde_json::json!({
        "chunkId": chunk_id,
        "newCategory": new_category,
    })).await
}

#[tauri::command]
async fn reindex_knowledge_item(
    state: tauri::State<'_, AppBridge>,
    chunk_id: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge:reindex", serde_json::json!({
        "chunkId": chunk_id,
    })).await
}

#[tauri::command]
async fn suggest_knowledge_categories(
    state: tauri::State<'_, AppBridge>,
    chunk_id: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge:suggestCategories", serde_json::json!({
        "chunkId": chunk_id,
    })).await
}

#[tauri::command]
async fn list_knowledge_categories(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("knowledge:listCategories", Value::Null).await
}

// ─── Merkle Chain / Audit Integrity ─────────────────────────────────────────

#[tauri::command]
async fn audit_verify_chain(
    state: tauri::State<'_, AppBridge>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("audit_verify_chain", serde_json::json!({
        "startDate": start_date,
        "endDate": end_date,
    })).await
}

#[tauri::command]
async fn audit_generate_receipt(
    state: tauri::State<'_, AppBridge>,
    date: String,
) -> Result<Value, String> {
    state.bridge.call("audit_generate_receipt", serde_json::json!({
        "date": date,
    })).await
}

#[tauri::command]
async fn audit_get_chain_status(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("audit_get_chain_status", Value::Null).await
}

// ─── Hardware-Bound Key Commands ──────────────────────────────────────────

#[tauri::command]
async fn hw_key_get_info(
    state: tauri::State<'_, AppBridge>,
    key_id: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("hw_key_get_info", serde_json::json!({
        "keyId": key_id,
    })).await
}

#[tauri::command]
async fn hw_key_sign(
    state: tauri::State<'_, AppBridge>,
    payload: String,
    key_id: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("hw_key_sign", serde_json::json!({
        "payload": payload,
        "keyId": key_id,
    })).await
}

#[tauri::command]
async fn hw_key_verify(
    state: tauri::State<'_, AppBridge>,
    payload: String,
    signature_hex: String,
    key_id: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("hw_key_verify", serde_json::json!({
        "payload": payload,
        "signatureHex": signature_hex,
        "keyId": key_id,
    })).await
}

#[tauri::command]
async fn hw_key_get_backend(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("hw_key_get_backend", Value::Null).await
}

// ─── Sovereignty Report Commands ──────────────────────────────────────────

#[tauri::command]
async fn report_generate_sovereignty(
    state: tauri::State<'_, AppBridge>,
    period_start: String,
    period_end: String,
) -> Result<Value, String> {
    state.bridge.call("report_generate_sovereignty", serde_json::json!({
        "periodStart": period_start,
        "periodEnd": period_end,
    })).await
}

#[tauri::command]
async fn report_render_pdf(
    state: tauri::State<'_, AppBridge>,
    report_json: String,
) -> Result<Value, String> {
    state.bridge.call("report_render_pdf", serde_json::json!({
        "reportJson": report_json,
    })).await
}

#[tauri::command]
async fn report_verify_sovereignty(
    state: tauri::State<'_, AppBridge>,
    report_json: String,
) -> Result<Value, String> {
    state.bridge.call("report_verify_sovereignty", serde_json::json!({
        "reportJson": report_json,
    })).await
}

// ─── Document / File Picker Commands ────────────────────────────────────────

#[tauri::command]
async fn document_pick_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().blocking_pick_file();
    Ok(file.map(|f| f.to_string()))
}

#[tauri::command]
async fn document_pick_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog().file().blocking_pick_files();
    Ok(files.unwrap_or_default().iter().map(|f| f.to_string()).collect())
}

#[tauri::command]
async fn document_set_context(
    state: tauri::State<'_, AppBridge>,
    file_path: String,
) -> Result<Value, String> {
    state.bridge.call("document_set_context", serde_json::json!({ "filePath": file_path })).await
}

#[tauri::command]
async fn document_clear_context(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("document_clear_context", Value::Null).await
}

#[tauri::command]
async fn document_add_file(
    state: tauri::State<'_, AppBridge>,
    file_path: String,
) -> Result<Value, String> {
    state.bridge.call("document_add_file", serde_json::json!({ "filePath": file_path })).await
}

#[tauri::command]
async fn document_remove_file(
    state: tauri::State<'_, AppBridge>,
    document_id: String,
) -> Result<Value, String> {
    state.bridge.call("document_remove_file", serde_json::json!({ "documentId": document_id })).await
}

#[tauri::command]
async fn add_attachment_to_knowledge(
    state: tauri::State<'_, AppBridge>,
    document_id: String,
) -> Result<Value, String> {
    state.bridge.call("add_attachment_to_knowledge", serde_json::json!({ "documentId": document_id })).await
}

// ─── Morning Brief Commands ──────────────────────────────────────────────

#[tauri::command]
async fn brief_get_morning(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("brief_get_morning", Value::Null).await
}

#[tauri::command]
async fn brief_dismiss(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("brief_dismiss", serde_json::json!({ "id": id })).await
}

#[tauri::command]
async fn weather_get_current(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("weather_get_current", Value::Null).await
}

#[tauri::command]
async fn commute_get_today(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("commute_get_today", Value::Null).await
}

#[tauri::command]
async fn knowledge_get_moment(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("knowledge_get_moment", Value::Null).await
}

#[tauri::command]
async fn alter_ego_get_activation_prompt(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("alter_ego_get_activation_prompt", Value::Null).await
}

#[tauri::command]
async fn digest_get_daily(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("digest_get_daily", Value::Null).await
}

#[tauri::command]
async fn digest_dismiss_daily(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("digest_dismiss_daily", serde_json::json!({ "id": id })).await
}

// ─── Knowledge Graph Commands ────────────────────────────────────────────

#[tauri::command]
async fn knowledge_get_graph(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("knowledge_get_graph", Value::Null).await
}

#[tauri::command]
async fn knowledge_get_node_context(
    state: tauri::State<'_, AppBridge>,
    node_id: String,
) -> Result<Value, String> {
    state.bridge.call("knowledge_get_node_context", serde_json::json!({ "nodeId": node_id })).await
}

#[tauri::command]
async fn knowledge_export_graph(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("knowledge_export_graph", Value::Null).await
}

// ─── Escalation Commands ─────────────────────────────────────────────────

#[tauri::command]
async fn escalation_get_prompts(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("escalation_get_prompts", Value::Null).await
}

// ─── Clipboard Insight Commands ──────────────────────────────────────────

#[tauri::command]
async fn clipboard_get_insights(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("clipboard_get_insights", Value::Null).await
}

#[tauri::command]
async fn clipboard_execute_action(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
) -> Result<Value, String> {
    state.bridge.call("clipboard_execute_action", serde_json::json!({ "actionId": action_id })).await
}

#[tauri::command]
async fn clipboard_dismiss_insight(
    state: tauri::State<'_, AppBridge>,
    action_id: String,
) -> Result<Value, String> {
    state.bridge.call("clipboard_dismiss_insight", serde_json::json!({ "actionId": action_id })).await
}

// ─── Reminder Commands ───────────────────────────────────────────────────

#[tauri::command]
async fn reminder_list(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("reminder_list", Value::Null).await
}

#[tauri::command]
async fn reminder_snooze(
    state: tauri::State<'_, AppBridge>,
    id: String,
    duration: String,
) -> Result<Value, String> {
    state.bridge.call("reminder_snooze", serde_json::json!({ "id": id, "duration": duration })).await
}

#[tauri::command]
async fn reminder_dismiss(
    state: tauri::State<'_, AppBridge>,
    id: String,
) -> Result<Value, String> {
    state.bridge.call("reminder_dismiss", serde_json::json!({ "id": id })).await
}

// ─── Quick Capture Command ───────────────────────────────────────────────

#[tauri::command]
async fn quick_capture(
    state: tauri::State<'_, AppBridge>,
    text: String,
) -> Result<Value, String> {
    state.bridge.call("quick_capture", serde_json::json!({ "text": text })).await
}

// ─── Style Profile Commands ──────────────────────────────────────────────

#[tauri::command]
async fn style_get_profile(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("style_get_profile", Value::Null).await
}

#[tauri::command]
async fn style_reanalyze(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("style_reanalyze", Value::Null).await
}

#[tauri::command]
async fn style_reset(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("style_reset", Value::Null).await
}

// ─── Dark Pattern Detection Commands ─────────────────────────────────────

#[tauri::command]
async fn dark_pattern_get_flags(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("dark_pattern_get_flags", Value::Null).await
}

#[tauri::command]
async fn dark_pattern_dismiss(
    state: tauri::State<'_, AppBridge>,
    content_id: String,
) -> Result<Value, String> {
    state.bridge.call("dark_pattern_dismiss", serde_json::json!({ "contentId": content_id })).await
}

// ─── Voice Model Commands ────────────────────────────────────────────────

#[tauri::command]
async fn voice_get_model_status(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("voice_get_model_status", Value::Null).await
}

#[tauri::command]
async fn voice_download_model(
    state: tauri::State<'_, AppBridge>,
    model: String,
) -> Result<Value, String> {
    state.bridge.call("voice_download_model", serde_json::json!({ "model": model })).await
}

// ─── Import Digital Life Commands ────────────────────────────────────────

#[tauri::command]
async fn import_get_history(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("import_get_history", Value::Null).await
}

#[tauri::command]
async fn import_start(
    state: tauri::State<'_, AppBridge>,
    source_id: String,
) -> Result<Value, String> {
    state.bridge.call("import_start", serde_json::json!({ "sourceId": source_id })).await
}

// ─── Model Download Commands ─────────────────────────────────────────────

#[tauri::command]
async fn start_model_downloads(
    state: tauri::State<'_, AppBridge>,
    tier: String,
) -> Result<Value, String> {
    state.bridge.call("start_model_downloads", serde_json::json!({ "tier": tier })).await
}

#[tauri::command]
async fn model_get_download_status(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("model_get_download_status", Value::Null).await
}

#[tauri::command]
async fn model_retry_download(
    state: tauri::State<'_, AppBridge>,
    model_name: String,
) -> Result<Value, String> {
    state.bridge.call("model_retry_download", serde_json::json!({ "modelName": model_name })).await
}

// ─── Alter Ego Week Commands ─────────────────────────────────────────────

#[tauri::command]
async fn alter_ego_get_week_progress(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("alter_ego_get_week_progress", Value::Null).await
}

#[tauri::command]
async fn alter_ego_complete_day(
    state: tauri::State<'_, AppBridge>,
    day: u32,
) -> Result<Value, String> {
    state.bridge.call("alter_ego_complete_day", serde_json::json!({ "day": day })).await
}

#[tauri::command]
async fn alter_ego_skip_day(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("alter_ego_skip_day", Value::Null).await
}

// ─── Financial Dashboard Commands ────────────────────────────────────────

#[tauri::command]
async fn get_financial_dashboard(
    state: tauri::State<'_, AppBridge>,
    period: String,
    custom_start: Option<String>,
    custom_end: Option<String>,
) -> Result<Value, String> {
    state.bridge.call("get_financial_dashboard", serde_json::json!({
        "period": period,
        "customStart": custom_start,
        "customEnd": custom_end,
    })).await
}

#[tauri::command]
async fn dismiss_anomaly(
    state: tauri::State<'_, AppBridge>,
    anomaly_id: String,
) -> Result<Value, String> {
    state.bridge.call("dismiss_anomaly", serde_json::json!({ "anomalyId": anomaly_id })).await
}

// ─── Health Dashboard Commands ───────────────────────────────────────────

#[tauri::command]
async fn get_health_dashboard(
    state: tauri::State<'_, AppBridge>,
    trend_days: u32,
) -> Result<Value, String> {
    state.bridge.call("get_health_dashboard", serde_json::json!({ "trendDays": trend_days })).await
}

#[tauri::command]
async fn save_health_entry(
    state: tauri::State<'_, AppBridge>,
    entry: Value,
) -> Result<Value, String> {
    state.bridge.call("save_health_entry", serde_json::json!({ "entry": entry })).await
}

// ─── Cloud Storage Commands ──────────────────────────────────────────────

#[tauri::command]
async fn cloud_storage_connect(
    state: tauri::State<'_, AppBridge>,
    provider: String,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_connect", serde_json::json!({ "provider": provider })).await
}

#[tauri::command]
async fn cloud_storage_disconnect(
    state: tauri::State<'_, AppBridge>,
    provider: String,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_disconnect", serde_json::json!({ "provider": provider })).await
}

#[tauri::command]
async fn cloud_storage_sync_now(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_sync_now", Value::Null).await
}

#[tauri::command]
async fn cloud_storage_set_interval(
    state: tauri::State<'_, AppBridge>,
    minutes: u32,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_set_interval", serde_json::json!({ "minutes": minutes })).await
}

#[tauri::command]
async fn cloud_storage_set_max_file_size(
    state: tauri::State<'_, AppBridge>,
    mb: u32,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_set_max_file_size", serde_json::json!({ "mb": mb })).await
}

#[tauri::command]
async fn cloud_storage_browse_folders(
    state: tauri::State<'_, AppBridge>,
    provider: String,
    parent_folder_id: String,
) -> Result<Value, String> {
    state.bridge.call("cloud_storage_browse_folders", serde_json::json!({
        "provider": provider,
        "parentFolderId": parent_folder_id,
    })).await
}

// ─── Search Settings Commands ────────────────────────────────────────────

#[tauri::command]
async fn get_search_settings(
    state: tauri::State<'_, AppBridge>,
) -> Result<Value, String> {
    state.bridge.call("get_search_settings", Value::Null).await
}

#[tauri::command]
async fn save_search_settings(
    state: tauri::State<'_, AppBridge>,
    enabled: Option<bool>,
    provider: Option<String>,
    api_key: Option<String>,
    safe_search: Option<bool>,
    max_results: Option<u32>,
) -> Result<Value, String> {
    state.bridge.call("save_search_settings", serde_json::json!({
        "enabled": enabled,
        "provider": provider,
        "apiKey": api_key,
        "safeSearch": safe_search,
        "maxResults": max_results,
    })).await
}

#[tauri::command]
async fn test_brave_api_key(
    state: tauri::State<'_, AppBridge>,
    api_key: String,
) -> Result<Value, String> {
    state.bridge.call("test_brave_api_key", serde_json::json!({ "apiKey": api_key })).await
}

// ─── Sidecar / IPC Bridge Commands ──────────────────────────────────────

#[tauri::command]
async fn sidecar_request(
    state: tauri::State<'_, AppBridge>,
    request: Value,
) -> Result<Value, String> {
    let method = request.get("method").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    state.bridge.call(&method, params).await
}

#[tauri::command]
async fn ipc_send(
    state: tauri::State<'_, AppBridge>,
    action: Option<String>,
    method: Option<String>,
    params: Option<Value>,
) -> Result<Value, String> {
    let method_str = method.or(action).unwrap_or_else(|| "unknown".to_string());
    state.bridge.call(&method_str, params.unwrap_or(Value::Null)).await
}

// ─── Upgrade Email Capture ───────────────────────────────────────────────

#[tauri::command]
async fn upgrade_submit_email(
    state: tauri::State<'_, AppBridge>,
    email: String,
) -> Result<Value, String> {
    state.bridge.call("upgrade_submit_email", serde_json::json!({ "email": email })).await
}

// ─── Application Entry Point ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Enable devtools in release builds for debugging
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            // Also open devtools in release if SEMBLANCE_DEBUG env is set
            if std::env::var("SEMBLANCE_DEBUG").is_ok() {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Kill stale node.exe sidecar processes from previous sessions
            // This prevents named pipe conflicts and locked SQLite databases
            #[cfg(target_os = "windows")]
            {
                use std::process::Command as StdCommand;
                // Use wmic to find node.exe processes running bridge.cjs from a previous Semblance session
                if let Ok(output) = StdCommand::new("wmic")
                    .args(["process", "where", "CommandLine like '%semblance%bridge.cjs%'", "get", "ProcessId", "/value"])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        if let Some(pid_str) = line.strip_prefix("ProcessId=") {
                            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                                eprintln!("[tauri] Killing stale sidecar process PID={}", pid);
                                let _ = StdCommand::new("taskkill")
                                    .args(["/F", "/PID", &pid.to_string()])
                                    .creation_flags(0x08000000)
                                    .output();
                            }
                        }
                    }
                }
            }

            // System tray setup with right-click menu
            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .text("show", "Show Semblance")
                .separator()
                .text("quit", "Quit")
                .build()?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("Semblance — Local Only")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            // Graceful shutdown: tell sidecar to clean up, then exit
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(bridge) = app_clone.try_state::<AppBridge>() {
                                    bridge.bridge.shutdown().await;
                                    eprintln!("[tauri] Sidecar shut down cleanly");
                                }
                                app_clone.exit(0);
                            });
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Deep link handler: listen for semblance:// URLs and forward to frontend
            let app_for_deeplink = app_handle.clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let payload_str = event.payload();
                // The payload is a JSON string containing the URL(s)
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload_str) {
                    for url in urls {
                        // Parse semblance://activate?token=xxx or semblance://activate?key=sem_xxx
                        if url.starts_with("semblance://activate") {
                            if let Ok(parsed) = url::Url::parse(&url.replace("semblance://", "https://")) {
                                // License key activation (sem_ format)
                                if let Some(key) = parsed.query_pairs().find(|(k, _)| k == "key").map(|(_, v)| v.to_string()) {
                                    eprintln!("[tauri] Deep link received: license key activation");
                                    let _ = app_for_deeplink.emit("license-activate", serde_json::json!({ "key": key }));
                                }
                                // Founding token activation (JWT format)
                                else if let Some(token) = parsed.query_pairs().find(|(k, _)| k == "token").map(|(_, v)| v.to_string()) {
                                    eprintln!("[tauri] Deep link received: founding activation");
                                    let _ = app_for_deeplink.emit("founding-activate", serde_json::json!({ "token": token }));
                                }
                            }
                        }
                    }
                }
            });

            // AUTONOMOUS DECISION: Locate project root by walking up from the
            // Tauri resource directory. In development, the Tauri app runs from
            // packages/desktop/src-tauri/, so the project root is 3 levels up.
            // In production, the sidecar is bundled alongside the binary.
            let project_root = std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("packages")
                .join("desktop")
                .join("src-tauri");

            // Walk up to find the project root (directory containing package.json with workspaces)
            let project_root = find_project_root(&project_root).unwrap_or_else(|| {
                // Fallback: assume we're running from project root
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
            });

            // Create NativeRuntime for direct llama.cpp inference
            let native_runtime = native_runtime::create_runtime();

            // Spawn the sidecar asynchronously
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                match SidecarBridge::spawn(project_root, app_handle_clone.clone(), native_runtime).await {
                    Ok(bridge) => {
                        // CRITICAL: Manage AppBridge IMMEDIATELY after spawn, BEFORE init.
                        // This allows IPC commands (model downloads, hardware detection) to work
                        // while init (LanceDB, Ollama checks) is still in progress.
                        // The sidecar's NDJSON stdin/stdout loop is already running.
                        app_handle_clone.manage(AppBridge { bridge });
                        eprintln!("[tauri] AppBridge managed — IPC commands available");

                        // Now initialize Core and Gateway asynchronously
                        let app_for_init = app_handle_clone.clone();
                        let bridge_state = app_handle_clone.state::<AppBridge>();
                        match bridge_state.bridge.call("initialize", Value::Null).await {
                            Ok(init_result) => {
                                let _ = app_for_init.emit(
                                    "semblance://status-update",
                                    &init_result,
                                );
                                eprintln!(
                                    "[tauri] Sidecar initialized: {}",
                                    serde_json::to_string(&init_result).unwrap_or_default()
                                );
                            }
                            Err(e) => {
                                eprintln!("[tauri] Sidecar initialization failed: {}", e);
                                let _ = app_for_init.emit(
                                    "semblance://status-update",
                                    serde_json::json!({
                                        "ollamaStatus": "disconnected",
                                        "error": format!("Initialization failed: {}", e)
                                    }),
                                );
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[tauri] Failed to spawn sidecar: {}", e);
                        let _ = app_handle_clone.emit(
                            "semblance://status-update",
                            serde_json::json!({
                                "ollamaStatus": "disconnected",
                                "error": format!("Sidecar spawn failed: {}", e)
                            }),
                        );
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of quitting
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            send_message,
            get_ollama_status,
            select_model,
            start_indexing,
            get_indexing_status,
            get_action_log,
            get_privacy_status,
            set_user_name,
            get_user_name,
            set_autonomy_tier,
            get_autonomy_config,
            get_indexed_directories,
            get_knowledge_stats,
            get_chat_history,
            set_onboarding_complete,
            get_onboarding_complete,
            add_credential,
            list_credentials,
            remove_credential,
            test_credential,
            discover_calendars,
            get_accounts_status,
            get_provider_presets,
            // Universal Inbox & AI Actions (Step 6)
            get_inbox_items,
            get_proactive_insights,
            get_today_events,
            get_actions_summary,
            archive_emails,
            send_email_action,
            draft_email_action,
            undo_action,
            dismiss_insight,
            get_pending_actions,
            approve_action,
            reject_action,
            get_approval_count,
            get_approval_threshold,
            start_email_index,
            start_calendar_index,
            run_proactive_engine,
            // Subscription Detection (Step 7)
            import_statement,
            get_subscriptions,
            update_subscription_status,
            get_subscription_summary,
            // Autonomy Escalation (Step 7)
            check_escalations,
            respond_to_escalation,
            get_active_escalations,
            // Knowledge Moment (Step 7)
            generate_knowledge_moment,
            // Weekly Digest (Step 7)
            generate_digest,
            get_latest_digest,
            list_digests,
            // Network Monitor (Step 8)
            get_active_connections,
            get_network_statistics,
            get_network_allowlist,
            get_unauthorized_attempts,
            get_connection_timeline,
            get_connection_history,
            generate_privacy_report,
            get_network_trust_status,
            // Task Routing (Step 8)
            get_routing_devices,
            route_task,
            assess_task,
            // Hardware & Runtime (Step 9)
            detect_hardware,
            // Founding Member Activation
            activate_founding_token,
            activate_license_key,
            get_license_status,
            // Conversation Management
            list_conversations,
            get_conversation,
            create_conversation,
            delete_conversation,
            rename_conversation,
            pin_conversation,
            unpin_conversation,
            switch_conversation,
            search_conversations,
            clear_all_conversations,
            set_conversation_auto_expiry,
            // Intent Layer
            get_intent,
            set_primary_goal,
            add_hard_limit,
            remove_hard_limit,
            toggle_hard_limit,
            add_personal_value,
            remove_personal_value,
            get_intent_observations,
            dismiss_observation,
            check_action_intent,
            set_intent_onboarding,
            alter_ego_get_settings,
            alter_ego_update_settings,
            alter_ego_get_receipts,
            alter_ego_approve_batch,
            alter_ego_reject_batch,
            alter_ego_send_draft,
            alter_ego_undo_receipt,
            // Sound Settings
            get_sound_settings,
            save_sound_settings,
            // Notification Settings
            get_notification_settings,
            save_notification_settings,
            // Location Settings
            get_location_settings,
            save_location_settings,
            clear_location_history,
            // Language Preference
            get_language_preference,
            set_language_preference,
            // Knowledge Curation
            list_knowledge_by_category,
            remove_knowledge_item,
            delete_knowledge_item,
            recategorize_knowledge_item,
            reindex_knowledge_item,
            suggest_knowledge_categories,
            list_knowledge_categories,
            // Merkle Chain / Audit Integrity
            audit_verify_chain,
            audit_generate_receipt,
            audit_get_chain_status,
            // Hardware-Bound Keys
            hw_key_get_info,
            hw_key_sign,
            hw_key_verify,
            hw_key_get_backend,
            // Sovereignty Report
            report_generate_sovereignty,
            report_render_pdf,
            report_verify_sovereignty,
            // Document / File Picker
            document_pick_file,
            document_pick_files,
            document_set_context,
            document_clear_context,
            document_add_file,
            document_remove_file,
            add_attachment_to_knowledge,
            // Morning Brief
            brief_get_morning,
            brief_dismiss,
            weather_get_current,
            commute_get_today,
            knowledge_get_moment,
            alter_ego_get_activation_prompt,
            digest_get_daily,
            digest_dismiss_daily,
            // Knowledge Graph
            knowledge_get_graph,
            knowledge_get_node_context,
            knowledge_export_graph,
            // Escalation
            escalation_get_prompts,
            // Clipboard Insights
            clipboard_get_insights,
            clipboard_execute_action,
            clipboard_dismiss_insight,
            // Reminders
            reminder_list,
            reminder_snooze,
            reminder_dismiss,
            // Quick Capture
            quick_capture,
            // Style Profile
            style_get_profile,
            style_reanalyze,
            style_reset,
            // Dark Pattern Detection
            dark_pattern_get_flags,
            dark_pattern_dismiss,
            // Voice Models
            voice_get_model_status,
            voice_download_model,
            // Import Digital Life
            import_get_history,
            import_start,
            // Model Downloads
            start_model_downloads,
            model_get_download_status,
            model_retry_download,
            // Alter Ego Week
            alter_ego_get_week_progress,
            alter_ego_complete_day,
            alter_ego_skip_day,
            // Financial Dashboard
            get_financial_dashboard,
            dismiss_anomaly,
            // Health Dashboard
            get_health_dashboard,
            save_health_entry,
            // Cloud Storage
            cloud_storage_connect,
            cloud_storage_disconnect,
            cloud_storage_sync_now,
            cloud_storage_set_interval,
            cloud_storage_set_max_file_size,
            cloud_storage_browse_folders,
            // Search Settings
            get_search_settings,
            save_search_settings,
            test_brave_api_key,
            // Sidecar / IPC Bridge
            sidecar_request,
            ipc_send,
            // Upgrade Email
            upgrade_submit_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Find Node.js binary on the system PATH.
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

/// Walk up directory tree to find the project root (contains package.json with "workspaces").
fn find_project_root(start: &std::path::Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    for _ in 0..10 {
        let pkg_json = current.join("package.json");
        if pkg_json.exists() {
            if let Ok(content) = std::fs::read_to_string(&pkg_json) {
                if content.contains("\"workspaces\"") {
                    return Some(current);
                }
            }
        }
        if !current.pop() {
            break;
        }
    }
    None
}
