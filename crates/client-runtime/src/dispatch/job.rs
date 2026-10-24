use std::fmt;

use chromvoid_core::rpc::types::RpcResponse;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CoreRpcCommandStart {
    pub cancellation_generation: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CoreRpcPhaseTiming {
    pub dispatcher_wait_ms: u128,
    pub adapter_phase_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreRpcPhaseResult<T> {
    pub value: T,
    pub timing: CoreRpcPhaseTiming,
}

#[derive(Debug, Clone)]
pub struct CoreRpcDispatchOutcome {
    pub response: RpcResponse,
    pub was_unlocked: bool,
    pub now_unlocked: bool,
    pub timing: CoreRpcPhaseTiming,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreRpcDispatchError {
    Cancelled,
    PhasePanicked,
    QueueUnavailable,
    WorkerClosed,
}

impl fmt::Display for CoreRpcDispatchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cancelled => write!(f, "low-priority RPC phase cancelled"),
            Self::PhasePanicked => write!(f, "core RPC dispatcher phase panicked"),
            Self::QueueUnavailable => write!(f, "core RPC dispatcher queue unavailable"),
            Self::WorkerClosed => write!(f, "core RPC dispatcher worker closed"),
        }
    }
}

impl std::error::Error for CoreRpcDispatchError {}
