//! Host supervisor for sovereign runtime processes (Slice 2.4 + 2.5).
//!
//! Spawns the kernel process beside the legacy sidecar, then supervised core and
//! gateway runtimes in separate PIDs. Kernel/runtime failures are logged but never
//! block chat, which remains on SidecarBridge.

mod health;
mod runtime;
mod spawn;

pub use spawn::{SovereignSupervisor, SupervisorStatus};
