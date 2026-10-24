use crate::app_state::AppState;
use crate::helpers::flush_core_events;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::Window;
#[derive(Debug, Serialize)]
pub struct SshKeygenResult {
    pub key_id: String,
    pub public_key_openssh: String,
    pub fingerprint: String,
    pub key_type: String,
}

pub(crate) use chromvoid_core::crypto::ssh::{
    generate_ssh_key_material, SshKeyMaterial as GeneratedSshKeyMaterial,
};

fn rpc_call(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    command: &str,
    data: Value,
    label: &str,
) -> Result<Value, String> {
    let request = chromvoid_core::rpc::types::RpcRequest::new(command.to_string(), data);
    match adapter.handle(&request) {
        chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => Ok(result),
        chromvoid_core::rpc::types::RpcResponse::Error { error, .. } => {
            Err(format!("Failed to {label}: {error}"))
        }
    }
}

fn save_ssh_secret(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    key_id: &str,
    secret_type: &str,
    value: &str,
) -> Result<(), String> {
    rpc_call(
        adapter,
        "passmanager:ssh:secret:save",
        json!({
            "key_id": key_id,
            "secret_type": secret_type,
            "value": value,
        }),
        secret_type,
    )
    .map(|_| ())
}

fn delete_ssh_secret_best_effort(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    key_id: &str,
    secret_type: &str,
) {
    let _ = rpc_call(
        adapter,
        "passmanager:ssh:secret:delete",
        json!({"key_id": key_id, "secret_type": secret_type}),
        secret_type,
    );
}

fn delete_ssh_key_best_effort(adapter: &mut dyn crate::core_adapter::CoreAdapter, key_id: &str) {
    let _ = rpc_call(
        adapter,
        "passmanager:ssh:key:delete",
        json!({"key_id": key_id}),
        "delete SSH key",
    );
}

fn list_ssh_key_ids(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
) -> Result<Vec<String>, String> {
    let result = rpc_call(
        adapter,
        "passmanager:ssh:list",
        Value::Null,
        "list SSH keys",
    )?;
    Ok(result
        .get("sshKeys")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|key| key.get("id").and_then(Value::as_str).map(str::to_string))
        .collect())
}

fn generate_unique_key_id(existing_ids: &[String]) -> String {
    for _ in 0..16 {
        let mut key_id = uuid::Uuid::new_v4().simple().to_string();
        key_id.truncate(8);
        if !existing_ids.iter().any(|existing| existing == &key_id) {
            return key_id;
        }
    }

    uuid::Uuid::new_v4().simple().to_string()
}

fn save_ssh_key_metadata(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    key_id: &str,
    material: &GeneratedSshKeyMaterial,
    name: Option<&str>,
    comment: &str,
    source_entry_id: Option<&str>,
) -> Result<(), String> {
    rpc_call(
        adapter,
        "passmanager:ssh:key:update",
        json!({
            "key": {
                "id": key_id,
                "type": material.key_type,
                "fingerprint": material.fingerprint,
                "name": name,
                "comment": (!comment.is_empty()).then_some(comment),
                "sourceEntryId": source_entry_id,
            }
        }),
        "save SSH key metadata",
    )
    .map(|_| ())
}

/// Persists pre-generated SSH private key, public key, and metadata through the
/// production Core adapter contract.
///
/// The caller remains responsible for access checks, vault unlock checks,
/// flushing Core events, and reconciling the running SSH agent.
pub(crate) fn store_generated_ssh_key(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    material: GeneratedSshKeyMaterial,
    name: Option<&str>,
    comment: &str,
    source_entry_id: Option<&str>,
) -> Result<SshKeygenResult, String> {
    let key_id = generate_unique_key_id(&list_ssh_key_ids(adapter)?);

    save_ssh_secret(
        adapter,
        &key_id,
        "ssh_private_key",
        material.private_key_pem.as_str(),
    )?;
    if let Err(error) = save_ssh_secret(
        adapter,
        &key_id,
        "ssh_public_key",
        &material.public_key_openssh,
    ) {
        delete_ssh_secret_best_effort(adapter, &key_id, "ssh_private_key");
        return Err(error);
    }

    if let Err(error) =
        save_ssh_key_metadata(adapter, &key_id, &material, name, comment, source_entry_id)
    {
        delete_ssh_secret_best_effort(adapter, &key_id, "ssh_private_key");
        delete_ssh_secret_best_effort(adapter, &key_id, "ssh_public_key");
        return Err(error);
    }

    if let Err(error) = adapter.save() {
        delete_ssh_key_best_effort(adapter, &key_id);
        return Err(format!("Failed to save vault: {error}"));
    }

    Ok(SshKeygenResult {
        key_id,
        public_key_openssh: material.public_key_openssh,
        fingerprint: material.fingerprint,
        key_type: material.key_type,
    })
}

#[tauri::command]
pub async fn ssh_keygen(
    app: tauri::AppHandle,
    window: Window,
    state: tauri::State<'_, AppState>,
    key_type: String,
    name: Option<String>,
    comment: Option<String>,
    source_entry_id: Option<String>,
) -> Result<SshKeygenResult, String> {
    crate::commands::ensure_main_window_caller(window.label(), "ssh_keygen")?;

    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let comment = comment.unwrap_or_default();
    let source_entry_id = source_entry_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    {
        let adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }
    }

    let material = generate_ssh_key_material(&key_type, &comment)?;

    let result = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }

        let result = store_generated_ssh_key(
            adapter.as_mut(),
            material,
            name.as_deref(),
            &comment,
            source_entry_id.as_deref(),
        )?;

        flush_core_events(&app, adapter.as_mut());
        result
    };

    #[cfg(desktop)]
    {
        if let Err(error) =
            crate::commands::ssh_agent_cmds::reconcile_ssh_agent_with_vault(&app, false).await
        {
            tracing::warn!(
                "ssh_keygen: ssh-agent reconcile failed after key generation: {}",
                error
            );
        }
    }

    Ok(result)
}
