//! Shared iOS host status and responder ownership. Platform callbacks and Core admission
//! are supplied by the host orchestrator, not represented by this status snapshot.

pub mod configuration;

use crate::host_responder_task::HostResponderTaskRuntime;
use crate::ios_control::{HostPresence, PairingOffer};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IosHostPhase {
    Idle,
    Pairing,
    Ready,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IosHostErrorKind {
    PairingExpired,
}

pub use crate::pairing_transport::PairingHello;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosHostStatus {
    pub phase: IosHostPhase,
    pub relay_url: Option<String>,
    pub device_id: Option<String>,
    pub device_label: Option<String>,
    pub pairing_pin: Option<String>,
    pub pairing_offer: Option<PairingOffer>,
    pub expires_at_ms: Option<u64>,
    pub presence: Option<HostPresence>,
    pub paired_peer_id: Option<String>,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<IosHostErrorKind>,
}

impl Default for IosHostStatus {
    fn default() -> Self {
        Self {
            phase: IosHostPhase::Idle,
            relay_url: None,
            device_id: None,
            device_label: None,
            pairing_pin: None,
            pairing_offer: None,
            expires_at_ms: None,
            presence: None,
            paired_peer_id: None,
            error: None,
            error_kind: None,
        }
    }
}

pub struct IosHostRuntimeState {
    status: Mutex<IosHostStatus>,
    responder_task: HostResponderTaskRuntime,
}

impl IosHostRuntimeState {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(IosHostStatus::default()),
            responder_task: HostResponderTaskRuntime::new(),
        }
    }

    pub fn set_status(
        &self,
        mutator: impl FnOnce(&mut IosHostStatus),
    ) -> Result<IosHostStatus, String> {
        let mut guard = self
            .status
            .lock()
            .map_err(|_| "iOS host status mutex poisoned".to_string())?;
        mutator(&mut guard);
        Ok(guard.clone())
    }

    pub fn host_status(&self) -> Result<IosHostStatus, String> {
        self.status
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| "iOS host status mutex poisoned".to_string())
    }

    pub fn begin_responder_task(&self) -> Result<u64, String> {
        self.responder_task
            .begin("iOS host responder mutex poisoned")
    }

    pub fn store_responder_task(
        &self,
        generation: u64,
        handle: tokio::task::AbortHandle,
    ) -> Result<(), String> {
        self.responder_task
            .store(generation, handle, "iOS host responder mutex poisoned")
    }

    pub fn cancel_responder_task(&self) -> Result<(), String> {
        self.responder_task
            .cancel("iOS host responder mutex poisoned")
    }

    pub fn is_responder_generation_current(&self, generation: u64) -> bool {
        self.responder_task.is_generation_current(generation)
    }

    pub fn clear_responder_task_if_current(&self, generation: u64) -> Result<(), String> {
        self.responder_task
            .clear_if_current(generation, "iOS host responder mutex poisoned")
    }
}

impl Default for IosHostRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
