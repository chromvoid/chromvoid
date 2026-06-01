use crate::app_state::AppState;
use crate::gateway;
use crate::state_ext::{lock_or_rpc_err, lock_or_tauri_rpc_err};
use crate::types::*;
use serde_json::Value;
use tracing::info;

async fn browser_extension_guard<T>(state: &tauri::State<'_, AppState>) -> Option<RpcResult<T>> {
    crate::pro::guard_pro_feature_async(
        state,
        chromvoid_core::license::PRO_FEATURE_BROWSER_EXTENSION,
    )
    .await
    .err()
    .map(|error| match error {
        RpcResult::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
        RpcResult::Success { .. } => RpcResult::Error {
            ok: false,
            error: "Pro license required".to_string(),
            code: Some("PRO_REQUIRED".to_string()),
        },
    })
}

fn browser_extension_guard_sync<T>(state: &tauri::State<'_, AppState>) -> Option<RpcResult<T>> {
    crate::pro::guard_pro_feature(
        state,
        chromvoid_core::license::PRO_FEATURE_BROWSER_EXTENSION,
    )
    .err()
    .map(|error| match error {
        RpcResult::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
        RpcResult::Success { .. } => RpcResult::Error {
            ok: false,
            error: "Pro license required".to_string(),
            code: Some("PRO_REQUIRED".to_string()),
        },
    })
}

#[tauri::command]
pub(crate) fn gateway_get_config(
    state: tauri::State<'_, AppState>,
) -> RpcResult<gateway::GatewayConfig> {
    let st = lock_or_rpc_err!(state.gateway, "Gateway");
    rpc_ok(st.config.clone())
}

#[tauri::command]
pub(crate) async fn gateway_set_enabled(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> TauriRpcResult<gateway::GatewayConfig> {
    if enabled {
        if let Some(error) = browser_extension_guard(&state).await {
            return Ok(error);
        }
    }
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let (config, save_snapshot) = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        st.config.enabled = enabled;
        info!("[gateway] set_enabled: {}", st.config.enabled);
        (st.config.clone(), st.config_save_snapshot())
    };
    gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway set enabled",
    )
    .await;
    Ok(rpc_ok(config))
}

#[tauri::command]
pub(crate) async fn gateway_set_access_duration(
    state: tauri::State<'_, AppState>,
    duration: gateway::AccessDuration,
) -> TauriRpcResult<gateway::GatewayConfig> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let (config, save_snapshot) = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        st.config.access_duration = duration;
        (st.config.clone(), st.config_save_snapshot())
    };
    gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway set access duration",
    )
    .await;
    Ok(rpc_ok(config))
}

#[tauri::command]
pub(crate) fn gateway_list_paired(
    state: tauri::State<'_, AppState>,
) -> RpcResult<Vec<gateway::PairedExtension>> {
    let st = lock_or_rpc_err!(state.gateway, "Gateway");
    rpc_ok(st.config.paired_extensions.clone())
}

#[tauri::command]
pub(crate) async fn gateway_revoke_extension(
    state: tauri::State<'_, AppState>,
    id: String,
) -> TauriRpcResult<Vec<gateway::PairedExtension>> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let (paired_extensions, save_snapshot) = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        st.revoke_extension(&id);
        (
            st.config.paired_extensions.clone(),
            st.config_save_snapshot(),
        )
    };
    gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway revoke extension",
    )
    .await;
    Ok(rpc_ok(paired_extensions))
}

#[tauri::command]
pub(crate) fn gateway_start_pairing(
    state: tauri::State<'_, AppState>,
) -> RpcResult<GatewayPairingInfo> {
    use rand::RngCore;

    if let Some(error) = browser_extension_guard_sync(&state) {
        return error;
    }
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");

    let mut token_bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut token_bytes);
    let pairing_token = gateway::hex_encode(&token_bytes);

    let pin_num: u32 = (rand::random::<u32>() % 1_000_000) as u32;
    let pin = format!("{pin_num:06}");

    let session = st.start_pairing(pairing_token, pin);

    info!(
        "[gateway] start_pairing: pin_expires_at_ms={}, pairing_expires_at_ms={}, attempts_left={}",
        session.pin_expires_at_ms, session.token_expires_at_ms, session.attempts_left,
    );

    rpc_ok(GatewayPairingInfo {
        pairing_token: session.pairing_token,
        pairing_expires_at_ms: session.token_expires_at_ms,
        pin: session.pin,
        pin_expires_at_ms: session.pin_expires_at_ms,
        attempts_left: session.attempts_left,
        locked_until_ms: session.locked_until_ms,
    })
}

#[tauri::command]
pub(crate) async fn gateway_set_session_duration(
    state: tauri::State<'_, AppState>,
    mins: u32,
) -> TauriRpcResult<u32> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let (clamped, save_snapshot) = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        st.config.session_max_duration_mins = mins.clamp(15, 240);
        (
            st.config.session_max_duration_mins,
            st.config_save_snapshot(),
        )
    };
    gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway set session duration",
    )
    .await;
    Ok(rpc_ok(clamped))
}

#[tauri::command]
pub(crate) fn gateway_cancel_pairing(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.cancel_pairing();
    info!("[gateway] cancel_pairing");
    rpc_ok(serde_json::json!({"cancelled": true}))
}

#[tauri::command]
pub(crate) async fn gateway_get_capability_policy(
    state: tauri::State<'_, AppState>,
    extension_id: String,
) -> TauriRpcResult<gateway::CapabilityPolicy> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let (policy, save_snapshot) = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        if let Some(policy) = st
            .config
            .capability_policies
            .iter()
            .find(|policy| policy.extension_id == extension_id)
        {
            (policy.clone(), None)
        } else {
            let policy = gateway::CapabilityPolicy::default_for(extension_id);
            st.config.capability_policies.push(policy.clone());
            (policy, Some(st.config_save_snapshot()))
        }
    };
    if let Some(save_snapshot) = save_snapshot {
        gateway::save_config_snapshot_best_effort(
            catalog_blocking_io_runtime,
            save_snapshot,
            "Gateway get capability policy",
        )
        .await;
    }
    Ok(rpc_ok(policy))
}

#[tauri::command]
pub(crate) async fn gateway_set_capability_policy(
    state: tauri::State<'_, AppState>,
    policy: gateway::CapabilityPolicy,
) -> TauriRpcResult<gateway::CapabilityPolicy> {
    if let Some(error) = browser_extension_guard(&state).await {
        return Ok(error);
    }
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let save_snapshot = {
        let mut st = lock_or_tauri_rpc_err!(state.gateway, "Gateway");
        if let Some(existing) = st
            .config
            .capability_policies
            .iter_mut()
            .find(|existing| existing.extension_id == policy.extension_id)
        {
            *existing = policy.clone();
        } else {
            st.config.capability_policies.push(policy.clone());
        }
        st.config_save_snapshot()
    };
    gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway set capability policy",
    )
    .await;
    Ok(rpc_ok(policy))
}

#[tauri::command]
pub(crate) fn gateway_issue_action_grant(
    state: tauri::State<'_, AppState>,
    extension_id: String,
    command: String,
    node_id: Option<u64>,
    ttl_secs: Option<u64>,
) -> RpcResult<gateway::ActionGrant> {
    use rand::RngCore;

    if let Some(error) = browser_extension_guard_sync(&state) {
        return error;
    }
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");

    let now = gateway::state::now_ms();
    let ttl = ttl_secs.unwrap_or(30) * 1000;

    let mut id_bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut id_bytes);
    let grant_id = gateway::hex_encode(&id_bytes);

    let grant = gateway::ActionGrant {
        grant_id: grant_id.clone(),
        extension_id: extension_id.clone(),
        command,
        node_id,
        created_at_ms: now,
        expires_at_ms: now.saturating_add(ttl),
        consumed: false,
    };

    let store = st.grant_store_mut(&extension_id);
    store.gc();
    store.action_grants.insert(grant_id, grant.clone());

    rpc_ok(grant)
}

#[tauri::command]
pub(crate) fn gateway_issue_site_grant(
    state: tauri::State<'_, AppState>,
    extension_id: String,
    origin: String,
    ttl_secs: Option<u64>,
) -> RpcResult<gateway::SiteGrant> {
    use rand::RngCore;

    if let Some(error) = browser_extension_guard_sync(&state) {
        return error;
    }
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");

    let now = gateway::state::now_ms();
    let ttl = ttl_secs.unwrap_or(15 * 60) * 1000;

    let mut id_bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut id_bytes);
    let grant_id = gateway::hex_encode(&id_bytes);

    let grant = gateway::SiteGrant {
        grant_id,
        extension_id: extension_id.clone(),
        origin: origin.clone(),
        created_at_ms: now,
        expires_at_ms: now.saturating_add(ttl),
    };

    let store = st.grant_store_mut(&extension_id);
    store.gc();
    store.site_grants.insert(origin, grant.clone());

    rpc_ok(grant)
}

#[tauri::command]
pub(crate) fn gateway_list_active_grants(
    state: tauri::State<'_, AppState>,
    extension_id: String,
) -> RpcResult<ActiveGrants> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");

    let store = st.grant_store_mut(&extension_id);
    store.gc();

    rpc_ok(ActiveGrants {
        action_grants: store.action_grants.values().cloned().collect(),
        site_grants: store.site_grants.values().cloned().collect(),
    })
}

#[tauri::command]
pub(crate) fn gateway_revoke_all_grants(
    state: tauri::State<'_, AppState>,
    extension_id: Option<String>,
) -> RpcResult<Value> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");

    if let Some(ext_id) = extension_id {
        st.grant_store_mut(&ext_id).revoke_all();
    } else {
        st.revoke_all_grants();
    }

    rpc_ok(serde_json::json!({"revoked": true}))
}
