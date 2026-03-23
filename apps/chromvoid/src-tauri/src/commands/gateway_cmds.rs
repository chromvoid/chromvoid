use serde_json::Value;
use tracing::info;

use crate::app_state::AppState;
use crate::gateway;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

#[tauri::command]
pub(crate) fn gateway_get_config(
    state: tauri::State<'_, AppState>,
) -> RpcResult<gateway::GatewayConfig> {
    let st = lock_or_rpc_err!(state.gateway, "Gateway");
    rpc_ok(st.config.clone())
}

#[tauri::command]
pub(crate) fn gateway_set_enabled(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> RpcResult<gateway::GatewayConfig> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.config.enabled = enabled;
    st.save_config();
    info!("[gateway] set_enabled: {}", st.config.enabled);
    rpc_ok(st.config.clone())
}

#[tauri::command]
pub(crate) fn gateway_set_access_duration(
    state: tauri::State<'_, AppState>,
    duration: gateway::AccessDuration,
) -> RpcResult<gateway::GatewayConfig> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.config.access_duration = duration;
    st.save_config();
    rpc_ok(st.config.clone())
}

#[tauri::command]
pub(crate) fn gateway_list_paired(
    state: tauri::State<'_, AppState>,
) -> RpcResult<Vec<gateway::PairedExtension>> {
    let st = lock_or_rpc_err!(state.gateway, "Gateway");
    rpc_ok(st.config.paired_extensions.clone())
}

#[tauri::command]
pub(crate) fn gateway_revoke_extension(
    state: tauri::State<'_, AppState>,
    id: String,
) -> RpcResult<Vec<gateway::PairedExtension>> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.revoke_extension(&id);
    st.save_config();
    rpc_ok(st.config.paired_extensions.clone())
}

#[tauri::command]
pub(crate) fn gateway_start_pairing(
    state: tauri::State<'_, AppState>,
) -> RpcResult<GatewayPairingInfo> {
    use rand::RngCore;

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
pub(crate) fn gateway_set_session_duration(
    state: tauri::State<'_, AppState>,
    mins: u32,
) -> RpcResult<u32> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    let clamped = st.set_session_max_duration(mins);
    rpc_ok(clamped)
}

#[tauri::command]
pub(crate) fn gateway_cancel_pairing(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.cancel_pairing();
    info!("[gateway] cancel_pairing");
    rpc_ok(serde_json::json!({"cancelled": true}))
}

#[tauri::command]
pub(crate) fn gateway_get_capability_policy(
    state: tauri::State<'_, AppState>,
    extension_id: String,
) -> RpcResult<gateway::CapabilityPolicy> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    rpc_ok(st.get_or_create_policy(&extension_id))
}

#[tauri::command]
pub(crate) fn gateway_set_capability_policy(
    state: tauri::State<'_, AppState>,
    policy: gateway::CapabilityPolicy,
) -> RpcResult<gateway::CapabilityPolicy> {
    let mut st = lock_or_rpc_err!(state.gateway, "Gateway");
    st.set_policy(policy.clone());
    rpc_ok(policy)
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
