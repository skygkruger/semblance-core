// Semblance Desktop — Tauri 2.0 application library
//
// AUTONOMOUS DECISION: Sidecar process model with NDJSON stdin/stdout IPC.
// Reasoning: SemblanceCore and Gateway are TypeScript packages that require
// a Node.js runtime. The Rust backend spawns a single Node.js sidecar process
// that hosts both Core and Gateway, communicating via NDJSON over stdin/stdout.
// This is the simplest integration approach that gets to real end-to-end
// functionality in Sprint 1. The production process isolation model (OS-level
// sandboxing) ships in Sprint 4.
// Escalation check: Build prompt explicitly authorizes process model decisions.
//
// All network access is mediated by the Core's OllamaProvider (localhost-only)
// and the Gateway's validation pipeline. No direct network calls from this
// Rust process or the frontend.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

// ─── Data Types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaStatus {
    pub status: String,
    pub active_model: Option<String>,
    pub available_models: Vec<String>,
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
    async fn spawn(project_root: PathBuf, app_handle: tauri::AppHandle) -> Result<Self, String> {
        // Find tsx binary for running TypeScript sidecar
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

        let mut child = Command::new(&tsx_path)
            .arg(&sidecar_script)
            .current_dir(&project_root)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
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

        // Background task: read stdout lines from sidecar, dispatch events and responses
        let pending_for_stdout = pending.clone();
        let app_for_stdout = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                    if let Some(event_name) = msg.get("event").and_then(|v| v.as_str()) {
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

        // Background task: read stderr from sidecar (logging)
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[sidecar] {}", line);
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
) -> Result<String, String> {
    let result = state
        .bridge
        .call_fire("send_message", serde_json::json!({"message": message}))
        .await?;

    // The sidecar returns the response ID as a string
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response ID from sidecar".to_string())
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

// ─── Application Entry Point ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // System tray setup
            let _tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("Semblance — Local Only")
                .menu_on_left_click(false)
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

            // AUTONOMOUS DECISION: Locate project root by walking up from the
            // Tauri resource directory. In development, the Tauri app runs from
            // packages/desktop/src-tauri/, so the project root is 3 levels up.
            // In production, the sidecar would be bundled — that's Sprint 4 scope.
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

            // Spawn the sidecar asynchronously
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                match SidecarBridge::spawn(project_root, app_handle_clone.clone()).await {
                    Ok(bridge) => {
                        // Initialize Core and Gateway via the sidecar
                        match bridge.call("initialize", Value::Null).await {
                            Ok(init_result) => {
                                // Emit initial status to frontend
                                let _ = app_handle_clone.emit(
                                    "semblance://status-update",
                                    &init_result,
                                );
                                eprintln!(
                                    "[tauri] Sidecar initialized: {}",
                                    serde_json::to_string(&init_result).unwrap_or_default()
                                );

                                // Store the bridge in managed state
                                app_handle_clone.manage(AppBridge { bridge });
                            }
                            Err(e) => {
                                eprintln!("[tauri] Sidecar initialization failed: {}", e);
                                let _ = app_handle_clone.emit(
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
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Graceful shutdown: tell sidecar to clean up
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(bridge) = app.try_state::<AppBridge>() {
                        bridge.bridge.shutdown().await;
                        eprintln!("[tauri] Sidecar shut down cleanly");
                    }
                });
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
