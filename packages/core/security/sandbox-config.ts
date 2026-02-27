// OS Sandbox Configuration — Platform-specific sandboxing entitlements and restrictions.
// Documents and verifies the OS-level security boundary around Semblance.
// CRITICAL: No networking imports. Configuration only.

// ─── macOS ──────────────────────────────────────────────────────────────────

/**
 * macOS App Sandbox entitlements for Semblance.
 * Reference: Apple App Sandbox Entitlements documentation.
 */
export const MACOS_ENTITLEMENTS = {
  // Granted
  'com.apple.security.app-sandbox': true,
  'com.apple.security.files.user-selected.read-write': true,
  'com.apple.security.files.downloads.read-write': true,  // Model downloads
  'com.apple.security.network.client': true,               // Gateway needs outbound
  'com.apple.security.personal-information.contacts': true, // Contact ingestion (Step 14)
  'com.apple.security.personal-information.location': true, // Location features (Step 16)

  // Denied — Semblance must not have these
  'com.apple.security.network.server': false,            // No inbound connections
  'com.apple.security.device.camera': false,             // No camera access
  'com.apple.security.device.microphone': false,         // No microphone access (voice uses local Whisper.cpp, not live mic)
  'com.apple.security.device.audio-input': false,        // No audio input capture
  'com.apple.security.device.usb': false,                // No raw USB access
  'com.apple.security.device.bluetooth': false,          // No Bluetooth
} as const;

// ─── Linux ──────────────────────────────────────────────────────────────────

/**
 * Linux AppArmor restrictions for Semblance (Flatpak/Snap compatible).
 */
export const LINUX_APPARMOR_RESTRICTIONS = {
  // Denied capabilities
  deny_ptrace: true,                                     // No process tracing
  deny_raw_socket: true,                                 // No raw network sockets
  deny_mount: true,                                      // No filesystem mounts

  // Network restrictions
  network_restrict_to_gateway: true,                     // Only Gateway process may connect
  deny_inbound_network: true,                            // No listening sockets
  deny_raw_network: true,                                // No raw packet access

  // Filesystem restrictions
  filesystem_restrict_to_appdata: true,                  // Core restricted to app data dir
  filesystem_allow_user_selected: true,                  // User-selected files (backup dest, imports)
  deny_system_config_write: true,                        // No /etc writes
} as const;

// ─── Windows ────────────────────────────────────────────────────────────────

/**
 * Windows capability declarations for Semblance (MSIX package).
 */
export const WINDOWS_CAPABILITIES = {
  // Granted
  internetClient: true,                                  // Outbound network (Gateway)
  removableStorage: true,                                // External drive access for backup
  documentsLibrary: true,                                // User document access for import

  // Denied — Semblance must not request these
  internetClientServer: false,                           // No inbound connections
  webcam: false,                                         // No camera
  microphone: false,                                     // No microphone
  allJoyn: false,                                        // No IoT
  bluetooth: false,                                      // No Bluetooth
} as const;
