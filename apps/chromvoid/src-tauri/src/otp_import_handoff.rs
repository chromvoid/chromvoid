use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use zeroize::Zeroizing;

use crate::app_state::AppState;
use crate::core_adapter::CoreMode;
use crate::types::{rpc_err, rpc_ok, RpcResult};

const OTP_IMPORT_TTL: Duration = Duration::from_secs(120);
const MAX_OTP_AUTH_URI_BYTES: usize = 16 * 1024;
const PENDING_EVENT: &str = "otp-import-pending";

static PENDING_OTP_IMPORT: OnceLock<PendingOtpImportSlot> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct PendingOtpImportMetadata {
    pending_id: String,
    origin: &'static str,
    expires_at_ms: u64,
}

struct PendingOtpImport {
    metadata: PendingOtpImportMetadata,
    raw_uri: Zeroizing<String>,
    expires_at: Instant,
}

pub(crate) struct OtpImportTakeResult {
    metadata: PendingOtpImportMetadata,
    raw_uri: Zeroizing<String>,
}

impl Serialize for OtpImportTakeResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("OtpImportTakeResult", 4)?;
        state.serialize_field("pending_id", &self.metadata.pending_id)?;
        state.serialize_field("origin", self.metadata.origin)?;
        state.serialize_field("expires_at_ms", &self.metadata.expires_at_ms)?;
        state.serialize_field("raw_uri", self.raw_uri.as_str())?;
        state.end()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingOtpImportError {
    NotFound,
    Expired,
}

#[derive(Default)]
struct PendingOtpImportSlot {
    pending: Mutex<Option<PendingOtpImport>>,
}

impl PendingOtpImportSlot {
    fn replace(
        &self,
        raw_uri: Zeroizing<String>,
        now: Instant,
        now_epoch_ms: u64,
    ) -> PendingOtpImportMetadata {
        let metadata = PendingOtpImportMetadata {
            pending_id: uuid::Uuid::new_v4().to_string(),
            origin: "system_url",
            expires_at_ms: now_epoch_ms.saturating_add(OTP_IMPORT_TTL.as_millis() as u64),
        };
        let pending = PendingOtpImport {
            metadata: metadata.clone(),
            raw_uri,
            expires_at: now + OTP_IMPORT_TTL,
        };
        if let Ok(mut slot) = self.pending.lock() {
            *slot = Some(pending);
        }
        metadata
    }

    fn metadata(&self, now: Instant) -> Result<Option<PendingOtpImportMetadata>, String> {
        let mut slot = self
            .pending
            .lock()
            .map_err(|_| "OTP import handoff mutex poisoned".to_string())?;
        if slot
            .as_ref()
            .is_some_and(|pending| pending.expires_at <= now)
        {
            *slot = None;
            return Ok(None);
        }
        Ok(slot.as_ref().map(|pending| pending.metadata.clone()))
    }

    fn take(
        &self,
        pending_id: &str,
        now: Instant,
    ) -> Result<OtpImportTakeResult, PendingOtpImportError> {
        let mut slot = self
            .pending
            .lock()
            .map_err(|_| PendingOtpImportError::NotFound)?;
        let Some(pending) = slot.as_ref() else {
            return Err(PendingOtpImportError::NotFound);
        };
        if pending.expires_at <= now {
            *slot = None;
            return Err(PendingOtpImportError::Expired);
        }
        if pending.metadata.pending_id != pending_id {
            return Err(PendingOtpImportError::NotFound);
        }
        let pending = slot.take().ok_or(PendingOtpImportError::NotFound)?;
        Ok(OtpImportTakeResult {
            metadata: pending.metadata,
            raw_uri: pending.raw_uri,
        })
    }

    fn clear(&self, pending_id: Option<&str>) -> Result<bool, String> {
        let mut slot = self
            .pending
            .lock()
            .map_err(|_| "OTP import handoff mutex poisoned".to_string())?;
        let matches = match (slot.as_ref(), pending_id) {
            (Some(pending), Some(pending_id)) => pending.metadata.pending_id == pending_id,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if matches {
            *slot = None;
        }
        Ok(matches)
    }
}

fn pending_slot() -> &'static PendingOtpImportSlot {
    PENDING_OTP_IMPORT.get_or_init(PendingOtpImportSlot::default)
}

#[cfg(target_os = "macos")]
pub(crate) fn handle_opened_urls(app_handle: &tauri::AppHandle, urls: &[url::Url]) {
    let Some(url) = urls.iter().find(|url| valid_otp_auth_url(url)) else {
        return;
    };

    let metadata = pending_slot().replace(
        Zeroizing::new(url.as_str().to_string()),
        Instant::now(),
        epoch_milliseconds(),
    );
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app_handle.emit_to("main", PENDING_EVENT, metadata);
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_opened_urls(_app_handle: &tauri::AppHandle, _urls: &[url::Url]) {}

pub(crate) fn clear_pending_otp_import() {
    let _ = pending_slot().clear(None);
}

#[tauri::command]
pub(crate) fn macos_otp_import_pending(
    window: tauri::WebviewWindow,
) -> RpcResult<Option<PendingOtpImportMetadata>> {
    if window.label() != "main" {
        return rpc_err(
            "OTP import handoff is restricted to the main window",
            Some("ACCESS_DENIED".to_string()),
        );
    }
    #[cfg(not(target_os = "macos"))]
    return rpc_err(
        "OTP setup handoff requires macOS",
        Some("FEATURE_UNSUPPORTED_ON_PLATFORM".to_string()),
    );
    #[cfg(target_os = "macos")]
    match pending_slot().metadata(Instant::now()) {
        Ok(metadata) => rpc_ok(metadata),
        Err(error) => rpc_err(error, Some("INTERNAL".to_string())),
    }
}

#[tauri::command]
pub(crate) fn macos_otp_import_take(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    pending_id: String,
) -> RpcResult<OtpImportTakeResult> {
    if window.label() != "main" {
        return rpc_err(
            "OTP import handoff is restricted to the main window",
            Some("ACCESS_DENIED".to_string()),
        );
    }
    #[cfg(not(target_os = "macos"))]
    return rpc_err(
        "OTP setup handoff requires macOS",
        Some("FEATURE_UNSUPPORTED_ON_PLATFORM".to_string()),
    );
    #[cfg(target_os = "macos")]
    {
        let adapter = match state.adapter.lock() {
            Ok(adapter) => adapter,
            Err(_) => return rpc_err("Adapter unavailable", Some("INTERNAL".to_string())),
        };
        if !matches!(adapter.mode(), CoreMode::Local) {
            return rpc_err(
                "OTP setup requires local Core adapter mode",
                Some("REMOTE_CORE_UNSUPPORTED".to_string()),
            );
        }
        if !adapter.is_unlocked() {
            return rpc_err(
                "Unlock the local ChromVoid vault to import a verification code",
                Some("VAULT_REQUIRED".to_string()),
            );
        }
        drop(adapter);

        match pending_slot().take(pending_id.trim(), Instant::now()) {
            Ok(result) => rpc_ok(result),
            Err(PendingOtpImportError::NotFound) => rpc_err(
                "Pending OTP import was not found",
                Some("NOT_FOUND".to_string()),
            ),
            Err(PendingOtpImportError::Expired) => {
                rpc_err("Pending OTP import expired", Some("EXPIRED".to_string()))
            }
        }
    }
}

#[tauri::command]
pub(crate) fn macos_otp_import_clear(
    window: tauri::WebviewWindow,
    pending_id: Option<String>,
) -> RpcResult<bool> {
    if window.label() != "main" {
        return rpc_err(
            "OTP import handoff is restricted to the main window",
            Some("ACCESS_DENIED".to_string()),
        );
    }
    match pending_slot().clear(pending_id.as_deref().map(str::trim)) {
        Ok(cleared) => rpc_ok(cleared),
        Err(error) => rpc_err(error, Some("INTERNAL".to_string())),
    }
}

fn valid_otp_auth_url(url: &url::Url) -> bool {
    if url.as_str().len() > MAX_OTP_AUTH_URI_BYTES
        || url.scheme() != "otpauth"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return false;
    }

    matches!(url.host_str(), Some(host) if host.eq_ignore_ascii_case("totp") || host.eq_ignore_ascii_case("hotp"))
}

fn epoch_milliseconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_bounded_totp_and_hotp_urls_without_authority_extras() {
        assert!(valid_otp_auth_url(
            &url::Url::parse("otpauth://totp/Example?secret=ABC").expect("totp url")
        ));
        assert!(valid_otp_auth_url(
            &url::Url::parse("otpauth://hotp/Example?secret=ABC&counter=0").expect("hotp url")
        ));
        for raw in [
            "otpauth-migration://offline?data=x",
            "otpauth://steam/Example?secret=ABC",
            "otpauth://user@totp/Example?secret=ABC",
            "otpauth://totp:123/Example?secret=ABC",
            "otpauth://totp/Example?secret=ABC#fragment",
        ] {
            assert!(!valid_otp_auth_url(
                &url::Url::parse(raw).expect("invalid otp url shape")
            ));
        }
    }

    #[test]
    fn host_bundle_registers_only_the_supported_otp_setup_scheme() {
        let info_plist = include_str!("../Info-macOS.plist");
        assert!(info_plist.contains("<string>otpauth</string>"));
        assert!(!info_plist.contains("otpauth-migration"));
        assert!(!info_plist.contains("apple-otpauth"));
    }

    #[test]
    fn slot_replaces_consumes_and_expires_one_shot_payloads() {
        let slot = PendingOtpImportSlot::default();
        let now = Instant::now();
        let first = slot.replace(Zeroizing::new("first".to_string()), now, 1_000);
        let second = slot.replace(Zeroizing::new("second".to_string()), now, 1_000);
        assert_ne!(first.pending_id, second.pending_id);
        assert!(matches!(
            slot.take(&first.pending_id, now),
            Err(PendingOtpImportError::NotFound)
        ));
        let taken = slot
            .take(&second.pending_id, now)
            .expect("latest pending import");
        assert_eq!(taken.raw_uri.as_str(), "second");
        assert!(matches!(
            slot.take(&second.pending_id, now),
            Err(PendingOtpImportError::NotFound)
        ));

        let expired = slot.replace(Zeroizing::new("expired".to_string()), now, 1_000);
        assert!(matches!(
            slot.take(&expired.pending_id, now + OTP_IMPORT_TTL),
            Err(PendingOtpImportError::Expired)
        ));
    }

    #[test]
    fn serialized_take_result_contains_no_route_or_persistence_fields() {
        let result = OtpImportTakeResult {
            metadata: PendingOtpImportMetadata {
                pending_id: "pending-1".to_string(),
                origin: "system_url",
                expires_at_ms: 2_000,
            },
            raw_uri: Zeroizing::new("otpauth://totp/Example?secret=ABC".to_string()),
        };
        let value = serde_json::to_value(result).expect("serialize take result");
        assert_eq!(
            value.get("pending_id").and_then(|value| value.as_str()),
            Some("pending-1")
        );
        assert!(value.get("raw_uri").is_some());
        assert!(value.get("route").is_none());
        assert!(value.get("query").is_none());
    }
}
