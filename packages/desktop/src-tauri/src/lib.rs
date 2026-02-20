// Semblance Desktop — Tauri 2.0 application library
//
// This Rust backend bridges the React frontend to the SemblanceCore and Gateway
// TypeScript processes. All communication uses Tauri's invoke/event system.
// No direct network access from this process — it spawns Core and Gateway
// as child processes and communicates via their APIs.

use serde::{Deserialize, Serialize};
use tauri::{Manager, Emitter};

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

// ─── Tauri Commands ────────────────────────────────────────────────────────

/// Send a message to the Orchestrator. Streams tokens back via events.
#[tauri::command]
async fn send_message(app: tauri::AppHandle, message: String) -> Result<String, String> {
    // Emit a thinking indicator
    let _ = app.emit("semblance://chat-thinking", true);

    // In Sprint 1, the Core processes run as TypeScript — this Rust layer
    // bridges the frontend to them. For now, we return a placeholder response.
    // The real wiring spawns the Core process and communicates via its API.
    //
    // TODO(Sprint 1 wiring): Connect to running SemblanceCore process
    let response_id = format!("msg_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    // Simulate streaming tokens
    let response = format!("I received your message: \"{}\". The Core process integration is being wired — this is the Tauri command bridge confirming the frontend → backend path works correctly.", message);

    for (i, chunk) in response.chars().collect::<Vec<_>>().chunks(3).enumerate() {
        let token: String = chunk.iter().collect();
        let _ = app.emit("semblance://chat-token", &token);
        if i % 5 == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }

    let _ = app.emit("semblance://chat-thinking", false);
    let _ = app.emit("semblance://chat-complete", serde_json::json!({
        "id": response_id,
        "content": response,
        "actions": []
    }));

    Ok(response_id)
}

/// Check Ollama connection status and list available models.
#[tauri::command]
async fn get_ollama_status() -> Result<OllamaStatus, String> {
    // TODO(Sprint 1 wiring): Query running SemblanceCore for Ollama status
    Ok(OllamaStatus {
        status: "disconnected".to_string(),
        active_model: None,
        available_models: vec![],
    })
}

/// Switch the active LLM model.
#[tauri::command]
async fn select_model(_model_id: String) -> Result<(), String> {
    // TODO(Sprint 1 wiring): Route to ModelManager via Core
    Ok(())
}

/// Start indexing the given directories.
#[tauri::command]
async fn start_indexing(app: tauri::AppHandle, directories: Vec<String>) -> Result<(), String> {
    // Emit initial progress
    let _ = app.emit("semblance://indexing-progress", serde_json::json!({
        "filesScanned": 0,
        "filesTotal": 0,
        "chunksCreated": 0,
        "currentFile": null::<String>,
        "directories": directories,
    }));

    // TODO(Sprint 1 wiring): Trigger FileScanner + Indexer pipeline via Core
    // For now, emit a completion event after a brief delay
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let _ = app_clone.emit("semblance://indexing-complete", serde_json::json!({
            "filesScanned": 0,
            "filesTotal": 0,
            "chunksCreated": 0,
        }));
    });

    Ok(())
}

/// Get current indexing state.
#[tauri::command]
async fn get_indexing_status() -> Result<IndexingStatus, String> {
    Ok(IndexingStatus {
        state: "idle".to_string(),
        files_scanned: 0,
        files_total: 0,
        chunks_created: 0,
        current_file: None,
        error: None,
    })
}

/// Query the audit trail for paginated action log entries.
#[tauri::command]
async fn get_action_log(_limit: u32, _offset: u32) -> Result<Vec<ActionLogEntry>, String> {
    // TODO(Sprint 1 wiring): Query Gateway audit trail
    Ok(vec![])
}

/// Get privacy status from the Gateway.
#[tauri::command]
async fn get_privacy_status() -> Result<PrivacyStatus, String> {
    Ok(PrivacyStatus {
        all_local: true,
        connection_count: 0,
        last_audit_entry: None,
        anomaly_detected: false,
    })
}

/// Persist the user's chosen name for their Semblance.
#[tauri::command]
async fn set_user_name(_name: String) -> Result<(), String> {
    // TODO(Sprint 1 wiring): Persist to Core preferences SQLite
    Ok(())
}

/// Retrieve the user's chosen name.
#[tauri::command]
async fn get_user_name() -> Result<Option<String>, String> {
    // TODO(Sprint 1 wiring): Read from Core preferences SQLite
    Ok(None)
}

/// Update autonomy tier for a domain.
#[tauri::command]
async fn set_autonomy_tier(_domain: String, _tier: String) -> Result<(), String> {
    // TODO(Sprint 1 wiring): Update AutonomyFramework config via Core
    Ok(())
}

/// Get current autonomy configuration.
#[tauri::command]
async fn get_autonomy_config() -> Result<AutonomyConfig, String> {
    let mut domains = std::collections::HashMap::new();
    domains.insert("email".to_string(), "partner".to_string());
    domains.insert("calendar".to_string(), "partner".to_string());
    domains.insert("files".to_string(), "partner".to_string());
    domains.insert("finances".to_string(), "guardian".to_string());
    domains.insert("health".to_string(), "partner".to_string());
    domains.insert("services".to_string(), "guardian".to_string());
    Ok(AutonomyConfig { domains })
}

/// Get list of currently indexed directories.
#[tauri::command]
async fn get_indexed_directories() -> Result<Vec<String>, String> {
    // TODO(Sprint 1 wiring): Query Core for indexed directories
    Ok(vec![])
}

/// Get knowledge graph statistics.
#[tauri::command]
async fn get_knowledge_stats() -> Result<KnowledgeStats, String> {
    Ok(KnowledgeStats {
        document_count: 0,
        chunk_count: 0,
        index_size_bytes: 0,
        last_indexed_at: None,
    })
}

/// Get chat history (paginated).
#[tauri::command]
async fn get_chat_history(_limit: u32, _offset: u32) -> Result<Vec<ChatMessage>, String> {
    // TODO(Sprint 1 wiring): Query Core SQLite for conversation history
    Ok(vec![])
}

/// Set onboarding complete flag.
#[tauri::command]
async fn set_onboarding_complete() -> Result<(), String> {
    // TODO(Sprint 1 wiring): Persist to Core preferences
    Ok(())
}

/// Check if onboarding has been completed.
#[tauri::command]
async fn get_onboarding_complete() -> Result<bool, String> {
    // TODO(Sprint 1 wiring): Read from Core preferences
    Ok(false)
}

// ─── Application Entry Point ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
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

            Ok(())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
