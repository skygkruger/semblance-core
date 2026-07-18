// OS-backed secure storage for kernel KeyStore materials.
//
// Uses the `keyring` crate for platform-native credential stores:
// - macOS: Keychain
// - Windows: Credential Manager (DPAPI)
// - Linux: Secret Service (GNOME Keyring / KWallet)

mod keyring_store;

use keyring_store::{delete_secret, get_secret, set_secret};

const SERVICE: &str = "com.veridian.semblance.kernel";

/// Retrieve a namespaced secret from the OS credential store.
#[tauri::command]
pub fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    get_secret(SERVICE, &key)
}

/// Persist a namespaced secret in the OS credential store.
#[tauri::command]
pub fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    set_secret(SERVICE, &key, &value)
}

/// Delete a namespaced secret from the OS credential store.
#[tauri::command]
pub fn secure_storage_delete(key: String) -> Result<(), String> {
    delete_secret(SERVICE, &key)
}
