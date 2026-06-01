use std::fmt;

use chromvoid_core::rpc::types::RpcResponse;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CoreRpcCommandStart {
    pub(crate) cancellation_generation: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CoreRpcPhaseTiming {
    pub(crate) dispatcher_wait_ms: u128,
    pub(crate) adapter_phase_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CoreRpcPhaseResult<T> {
    pub(crate) value: T,
    pub(crate) timing: CoreRpcPhaseTiming,
}

#[derive(Debug, Clone)]
pub(crate) struct CoreRpcDispatchOutcome {
    pub(crate) response: RpcResponse,
    pub(crate) was_unlocked: bool,
    pub(crate) now_unlocked: bool,
    pub(crate) timing: CoreRpcPhaseTiming,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CoreRpcDispatchError {
    Cancelled,
    QueueUnavailable,
    WorkerClosed,
}

impl fmt::Display for CoreRpcDispatchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cancelled => write!(f, "low-priority RPC phase cancelled"),
            Self::QueueUnavailable => write!(f, "core RPC dispatcher queue unavailable"),
            Self::WorkerClosed => write!(f, "core RPC dispatcher worker closed"),
        }
    }
}

impl std::error::Error for CoreRpcDispatchError {}
