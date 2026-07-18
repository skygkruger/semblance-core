//! Host supervisor for sovereign runtime processes (Slice 2.4).
//!
//! Spawns the kernel process beside the legacy sidecar. Kernel failures are
//! logged but never block chat, which remains on SidecarBridge.

mod health;
mod spawn;

pub use spawn::{SovereignSupervisor, SupervisorStatus};
