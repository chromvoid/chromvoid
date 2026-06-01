/// Acquires a `Mutex` lock, returning early with `RpcResult::Error` on poison.
///
/// Usage: `let guard = lock_or_rpc_err!(state.adapter, "Adapter");`
macro_rules! lock_or_rpc_err {
    ($mutex:expr, $label:expr) => {
        match $mutex.lock() {
            Ok(g) => g,
            Err(_) => {
                return crate::types::RpcResult::Error {
                    ok: false,
                    error: format!("{} mutex poisoned", $label),
                    code: Some("INTERNAL".to_string()),
                }
            }
        }
    };
}

pub(crate) use lock_or_rpc_err;

/// Acquires a `Mutex` lock, returning early with `Ok(RpcResult::Error)` for async Tauri commands
/// whose outer return type is `Result<RpcResult<T>, String>`.
macro_rules! lock_or_tauri_rpc_err {
    ($mutex:expr, $label:expr) => {
        match $mutex.lock() {
            Ok(g) => g,
            Err(_) => {
                return Ok(crate::types::RpcResult::Error {
                    ok: false,
                    error: format!("{} mutex poisoned", $label),
                    code: Some("INTERNAL".to_string()),
                })
            }
        }
    };
}

pub(crate) use lock_or_tauri_rpc_err;

/// Acquires a `Mutex` lock, returning early with `Err(String)` on poison.
///
/// Usage: `let guard = lock_or_string_err!(state.adapter, "Adapter");`
macro_rules! lock_or_string_err {
    ($mutex:expr, $label:expr) => {
        match $mutex.lock() {
            Ok(g) => g,
            Err(_) => return Err(format!("{} mutex poisoned", $label)),
        }
    };
}

pub(crate) use lock_or_string_err;
