use serde_json::Value;
use tauri::Emitter;
use tracing::info;

use crate::core_adapter::CoreAdapter;
use crate::types::RpcDispatchArgs;

pub(crate) fn command_and_data(args: RpcDispatchArgs) -> Result<(String, Value), String> {
    match args {
        RpcDispatchArgs::Cmd { cmd } => {
            let val = serde_json::to_value(&cmd).map_err(|e| e.to_string())?;
            let command = val
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Invalid RpcCommand: missing command".to_string())?
                .to_string();
            let data = val.get("data").cloned().unwrap_or(Value::Null);
            Ok((command, data))
        }
        RpcDispatchArgs::Request { v, command, data } => {
            if v != 1 {
                return Err(format!("Unsupported protocol version: {v}"));
            }
            Ok((command, data))
        }
    }
}

pub(crate) fn validate_upload_chunk_bounds(
    context: &str,
    offset: u64,
    size: u64,
    declared_size: Option<u64>,
) -> Result<u64, String> {
    let Some(end_offset) = offset.checked_add(size) else {
        return Err(format!("{context} chunk offset overflow"));
    };
    if declared_size.is_some_and(|declared_size| end_offset > declared_size) {
        return Err(format!("{context} chunk exceeds declared size"));
    }
    Ok(end_offset)
}

pub(crate) fn flush_core_events<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    adapter: &mut dyn CoreAdapter,
) -> usize {
    let events = adapter.take_events();
    let mut emitted = 0usize;
    for evt in events {
        let Some(obj) = evt.as_object() else { continue };
        let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else {
            continue;
        };
        if cmd == "update:state" {
            continue;
        }
        let payload = obj.get("data").cloned().unwrap_or(Value::Null);
        emit_core_event(app, cmd, payload);
        emitted = emitted.saturating_add(1);
    }
    emitted
}

pub(crate) fn emit_core_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    command: &str,
    payload: Value,
) {
    if command == "catalog:event" {
        let ev_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("?");
        let node_id = payload
            .get("node_id")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "null".to_string());
        let version = payload
            .get("version")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "null".to_string());
        let shard_id = payload
            .get("shard_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let path = payload
            .get("delta")
            .and_then(|d| d.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        info!(
            "core_event: command=catalog:event type={} node_id={} version={} shard_id={} path={}",
            ev_type, node_id, version, shard_id, path
        );
    } else if command == "catalog:event:batch" {
        let count = payload
            .get("events")
            .and_then(|events| events.as_array())
            .map(|events| events.len())
            .unwrap_or(0);
        info!("core_event: command=catalog:event:batch count={}", count);
    }

    let event_name = command
        .chars()
        .map(|c| match c {
            '.' => ':',
            c if c.is_ascii_alphanumeric() || c == '-' || c == '/' || c == ':' || c == '_' => c,
            _ => '_',
        })
        .collect::<String>();
    let _ = app.emit(&event_name, payload);
}
