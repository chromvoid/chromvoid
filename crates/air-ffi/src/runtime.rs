use chromvoid_client_runtime::session::{
    AdmittedRequest, LocalSession, SessionError, SessionSnapshot,
};
use chromvoid_core::rpc::types::{PROTOCOL_VERSION, RpcRequest};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::{BridgeError, MAX_METADATA_BYTES, check_bridge};

#[path = "credential_import.rs"]
mod credential_import;
pub use credential_import::{AirImport, AirImportLimits, AirImportMode};
#[path = "credential_export.rs"]
mod credential_export;
pub use credential_export::{AirExport, AirExportLimits};
#[path = "storage_backup.rs"]
mod storage_backup;
pub use storage_backup::{AirBackupArtifact, AirStorageBackup};
#[path = "storage_restore.rs"]
mod storage_restore;
pub use storage_restore::{
    AirRestoreArtifact, AirRestoreArtifactSpec, AirRestoreLimits, AirRestorePreview,
    AirStorageRestore,
};
#[path = "storage_erase.rs"]
mod storage_erase;
pub use storage_erase::{AirEraseReceipt, AirStorageErase};
#[path = "file_transfer.rs"]
mod file_transfer;
pub use file_transfer::{AirFileLimits, AirFileReader, AirFileWriteTarget, AirFileWriter};
#[path = "derivative.rs"]
mod derivative;
pub use derivative::AirDerivative;
#[path = "host.rs"]
mod host;
#[cfg(unix)]
#[path = "usb_accessory.rs"]
mod usb_accessory;

#[cfg(any(target_os = "android", all(test, feature = "fixture")))]
#[path = "android_provider.rs"]
mod android_provider;
#[cfg(target_os = "android")]
#[path = "android_provider_jni.rs"]
mod android_provider_jni;
pub use host::{
    AirHost, AirHostConnection, AirHostConnectionState, AirHostPairingOffer, AirHostPeer,
    AirHostPhase, AirHostPreferences, AirHostSnapshot, AirUsbApprovalKind, AirUsbLinkState,
    AirUsbPairingRequest, AirUsbSessionRequest, AirUsbStatus,
};

/// Narrow native access slice. New features extend this owner with acceptance evidence.
pub const NATIVE_COMMANDS: &[&str] = &[
    "vault:rekey",
    "master:rekey",
    "wallet:status",
    "wallet:backup:export",
    "wallet:ton:rotateKey",
    "wallet:transaction:quote",
    "wallet:transaction:prepare",
    "wallet:transaction:confirm",
    "wallet:transaction:cancel",
    "wallet:transaction:rebroadcast",
    "wallet:transactions:list",
    "wallet:transactions:sync",
    "wallet:transactions:refresh",
    "wallet:addressBook:list",
    "wallet:address:detect",
    "wallet:addressBook:create",
    "wallet:addressBook:update",
    "wallet:addressBook:delete",
    "wallet:list",
    "wallet:accounts:list",
    "wallet:balance:get",
    "wallet:accounts:derive",
    "wallet:addresses:derive",
    "wallet:hd:generateMnemonic",
    "wallet:hd:create",
    "wallet:import:create",
    "catalog:folder:list",
    "catalog:createDir",
    "catalog:attachment:prepare",
    "catalog:rename",
    "catalog:move",
    "catalog:delete",
    "catalog:source:metadata",
    "catalog:document:resolve-link",
    "master:setup",
    "vault:status",
    "vault:unlock",
    "passmanager:entry:page",
    "passmanager:icon:getMany",
    "passkeys:list",
    "passkeys:delete",
    "passmanager:root:import",
    "passmanager:entry:websites:read",
    "passmanager:entry:websites:validate",
    "passmanager:entry:websites:update",
    "passmanager:ssh:page",
    "passmanager:ssh:keygen",
    "passmanager:ssh:key:import",
    "passmanager:ssh:key:export",
    "passmanager:ssh:key:edit",
    "passmanager:ssh:key:delete",
    "passmanager:password:generate",
    "passmanager:securityAudit:page",
    "passmanager:otp:parseUri",
    "passmanager:otp:record:list",
    "passmanager:otp:record:save",
    "passmanager:otp:record:delete",
    "passmanager:otp:record:code",
    "passmanager:tag:page",
    "passmanager:tag:save",
    "passmanager:tag:delete",
    "passmanager:entry:detail",
    "passmanager:entry:update",
    "passmanager:secret:read",
    "passmanager:secret:save",
    "passmanager:entry:create",
    "passmanager:entry:delete",
    "passmanager:group:page",
    "passmanager:group:ensure",
    "passmanager:group:rename",
    "passmanager:group:delete",
];

#[cfg(all(test, feature = "fixture"))]
#[path = "auto_lock_tests.rs"]
mod auto_lock_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "maintenance_tests.rs"]
mod maintenance_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "storage_backup_tests.rs"]
mod storage_backup_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "storage_restore_tests.rs"]
mod storage_restore_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "wallet_recovery_tests.rs"]
mod wallet_recovery_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "wallet_send_tests.rs"]
mod wallet_send_tests;
#[cfg(all(test, feature = "fixture"))]
#[path = "wallet_tests.rs"]
mod wallet_tests;

#[derive(uniffi::Enum)]
pub enum AirPhase {
    Locked,
    Unlocked,
    Deactivating,
    Inactive,
    Closed,
    Failed,
}

#[derive(uniffi::Record)]
pub struct AirSnapshot {
    pub generation: u64,
    pub sequence: u64,
    pub phase: AirPhase,
    pub cleanup_pending: bool,
    pub master_configured: bool,
}
impl From<SessionSnapshot> for AirSnapshot {
    fn from(value: SessionSnapshot) -> Self {
        use chromvoid_client_runtime::session::SessionPhase;
        Self {
            generation: value.generation,
            sequence: value.sequence,
            cleanup_pending: value.cleanup_pending,
            master_configured: value.master_configured,
            phase: match value.phase {
                SessionPhase::Locked => AirPhase::Locked,
                SessionPhase::Unlocked => AirPhase::Unlocked,
                SessionPhase::Deactivating => AirPhase::Deactivating,
                SessionPhase::Inactive => AirPhase::Inactive,
                SessionPhase::Closed => AirPhase::Closed,
                SessionPhase::Failed => AirPhase::Failed,
            },
        }
    }
}

#[derive(uniffi::Enum)]
pub enum AirEventKind {
    Lifecycle,
    DomainInvalidated,
}
#[derive(uniffi::Record)]
pub struct AirEvent {
    pub snapshot: AirSnapshot,
    pub kind: AirEventKind,
}
#[derive(uniffi::Record)]
pub struct AirEventBatch {
    pub snapshot: AirSnapshot,
    pub events: Vec<AirEvent>,
    pub gap: bool,
}

#[derive(uniffi::Record)]
pub struct AirReply {
    pub request_id: u64,
    pub generation: u64,
    pub payload: Vec<u8>,
}

#[derive(uniffi::Object)]
pub struct AirRuntime {
    session: Arc<LocalSession>,
    host: Mutex<Option<Arc<AirHost>>>,
}

#[uniffi::export]
impl AirRuntime {
    #[uniffi::constructor]
    pub fn new(expected_fingerprint: String, storage_root: String) -> Result<Self, BridgeError> {
        Self::open(
            expected_fingerprint,
            storage_root,
            chromvoid_client_runtime::LocalCoreAdapter::new,
        )
    }

    pub fn snapshot(&self) -> Result<AirSnapshot, BridgeError> {
        self.session.snapshot().map(Into::into).map_err(map_error)
    }
    /// App preference only; Rust owns the monotonic deadline and access revocation.
    pub fn set_auto_lock_timeout(
        &self,
        generation: u64,
        timeout_seconds: u64,
    ) -> Result<(), BridgeError> {
        self.session
            .set_auto_lock_timeout(generation, Duration::from_secs(timeout_seconds))
            .map_err(map_error)
    }
    pub fn record_user_activity(&self, generation: u64) -> Result<(), BridgeError> {
        self.session
            .record_user_activity(generation)
            .map_err(map_error)
    }
    pub fn deactivate(&self) -> Result<AirSnapshot, BridgeError> {
        let snapshot = self.session.deactivate().map_err(map_error)?;
        self.suspend_host();
        Ok(snapshot.into())
    }
    pub fn activate(&self) -> Result<AirSnapshot, BridgeError> {
        self.session.activate().map(Into::into).map_err(map_error)
    }
    pub fn lock(&self) -> Result<AirSnapshot, BridgeError> {
        let snapshot = self.session.lock().map_err(map_error)?;
        self.suspend_host();
        Ok(snapshot.into())
    }
    /// Named `shutdown` rather than `close`: the Kotlin bindings make every
    /// object `AutoCloseable`, and a `close` returning a value collides with it.
    pub fn shutdown(&self) -> Result<AirSnapshot, BridgeError> {
        let snapshot = self.session.close().map_err(map_error)?;
        self.suspend_host();
        Ok(snapshot.into())
    }
    pub fn cancel(&self, request_id: u64) -> Result<(), BridgeError> {
        self.session.cancel(request_id).map_err(map_error)
    }

    /// Reserve identifiers before Swift suspension, independent of async polling order.
    pub fn begin_execute(
        &self,
        request_id: u64,
        generation: u64,
        request: Vec<u8>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let request = decode_request(request)?;
        self.admit_execution(request_id, generation, request)
    }

    /// Host-side provider entry. Shares the application's session and cancellation
    /// authority; it cannot unlock storage or dispatch non-provider commands.
    pub fn begin_provider_execute(
        &self,
        request_id: u64,
        generation: u64,
        request: Vec<u8>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let request = decode_request_with_policy(
            request,
            chromvoid_client_runtime::provider::command_allowed,
        )?;
        self.admit_execution(request_id, generation, request)
    }

    /// Bounded safe metadata only. Canceling the Swift task drops this subscription.
    pub async fn events(&self, after_sequence: u64) -> Result<AirEventBatch, BridgeError> {
        let batch = self
            .session
            .events(after_sequence)
            .await
            .map_err(map_error)?;
        use chromvoid_client_runtime::session::SessionEventKind;
        Ok(AirEventBatch {
            snapshot: batch.snapshot.into(),
            gap: batch.gap,
            events: batch
                .events
                .into_iter()
                .map(|event| AirEvent {
                    snapshot: event.snapshot.into(),
                    kind: match event.kind {
                        SessionEventKind::Lifecycle => AirEventKind::Lifecycle,
                        SessionEventKind::DomainInvalidated => AirEventKind::DomainInvalidated,
                    },
                })
                .collect(),
        })
    }
}

fn decode_request(bytes: Vec<u8>) -> Result<RpcRequest, BridgeError> {
    decode_request_with_policy(bytes, |command| NATIVE_COMMANDS.contains(&command))
}

fn decode_request_with_policy(
    bytes: Vec<u8>,
    command_allowed: impl FnOnce(&str) -> bool,
) -> Result<RpcRequest, BridgeError> {
    let bytes = zeroize::Zeroizing::new(bytes);
    if bytes.len() > MAX_METADATA_BYTES {
        return Err(BridgeError::PayloadTooLarge);
    }
    let mut request: RpcRequest =
        serde_json::from_slice(&bytes).map_err(|_| BridgeError::InvalidRequest)?;
    let error = if request.v != PROTOCOL_VERSION {
        Some(BridgeError::UnsupportedVersion)
    } else if request
        .transport_features
        .as_ref()
        .is_some_and(|features| !features.is_empty())
        || !command_allowed(&request.command)
    {
        Some(BridgeError::CapabilityUnavailable)
    } else {
        None
    };
    if let Some(error) = error {
        chromvoid_client_runtime::rpc_data::clear_rpc_strings(&mut request.data);
        return Err(error);
    }
    Ok(request)
}

fn map_error(error: SessionError) -> BridgeError {
    match error {
        SessionError::Revoked => BridgeError::SessionRevoked,
        SessionError::Canceled => BridgeError::RequestCanceled,
        SessionError::RequestId => BridgeError::InvalidRequestId,
        SessionError::Busy => BridgeError::RuntimeBusy,
        SessionError::Unavailable => BridgeError::RuntimeUnavailable,
        SessionError::AdoptionRequired => BridgeError::AdoptionActionForbidden,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_application_identities_accept_production_and_development() {
        for identity in [
            "com.chromvoid.app",
            "com.chromvoid.air.dev",
            "com.chromvoid.air.dev.fixture",
            "com.chromvoid.air.dev.test",
        ] {
            assert!(ANDROID_APPLICATION_IDENTITIES.contains(&identity));
        }
        assert!(!ANDROID_APPLICATION_IDENTITIES.contains(&"com.other.app"));
    }

    #[test]
    fn passkey_management_does_not_grant_provider_operations() {
        for command in ["passkeys:list", "passkeys:delete"] {
            let bytes = serde_json::to_vec(&serde_json::json!({
                "v": 1, "command": command, "data": {"credentialIdB64Url": "c3ludGhldGlj"}
            }))
            .unwrap();
            assert_eq!(decode_request(bytes).unwrap().command, command);
        }
        for command in [
            "credential_provider:passkey:create",
            "credential_provider:passkey:get",
            "credential_provider:passkey:query",
        ] {
            let bytes = serde_json::to_vec(&serde_json::json!({
                "v": 1, "command": command, "data": {}
            }))
            .unwrap();
            assert!(matches!(
                decode_request(bytes),
                Err(BridgeError::CapabilityUnavailable)
            ));
        }
    }

    #[test]
    fn bridge_rejects_invalid_and_unavailable_requests_before_dispatch() {
        for command in [
            "env_runtime:status",
            "credential_provider:secret:get",
            "passmanager:root:export",
            "catalog:download",
            "future:command",
        ] {
            let bytes = serde_json::to_vec(&serde_json::json!({"v":1,"command":command,"data":{}}))
                .unwrap();
            assert!(matches!(
                decode_request(bytes),
                Err(BridgeError::CapabilityUnavailable)
            ));
        }
        assert!(matches!(
            decode_request(vec![b' '; MAX_METADATA_BYTES + 1]),
            Err(BridgeError::PayloadTooLarge)
        ));
        assert!(matches!(
            decode_request(b"{".to_vec()),
            Err(BridgeError::InvalidRequest)
        ));
        assert!(matches!(
            decode_request(br#"{"v":2,"command":"vault:unlock","data":{}}"#.to_vec()),
            Err(BridgeError::UnsupportedVersion)
        ));
        assert!(matches!(
            decode_request(
                br#"{"v":1,"command":"vault:status","data":{},"transport_features":["privilege"]}"#
                    .to_vec()
            ),
            Err(BridgeError::CapabilityUnavailable)
        ));
    }
    #[test]
    fn wrong_fingerprint_fails_before_storage_validation() {
        assert!(matches!(
            AirRuntime::new("wrong".into(), "/untrusted".into()),
            Err(BridgeError::IncompatibleBuild)
        ));
    }

    #[test]
    fn android_adoption_coordinates_come_from_the_validated_files_directory() {
        use std::path::Path;
        for data_dir in [
            "/data/data/com.chromvoid.app",
            "/data/user/10/com.chromvoid.app",
        ] {
            let root = Path::new(data_dir).join("files/ChromVoidAir");
            assert_eq!(android_data_dir(&root).unwrap(), Path::new(data_dir));
        }
        assert!(matches!(
            android_data_dir(Path::new("/data/user/0/com.chromvoid.app/ChromVoidAir")),
            Err(BridgeError::InvalidStorageRoot)
        ));
    }

    #[test]
    fn adoption_outcomes_keep_their_ffi_error_types() {
        use crate::tauri_adoption::AdoptionError;
        assert!(matches!(
            adoption_error(AdoptionError::Blocked),
            BridgeError::AdoptionBlocked
        ));
        assert!(matches!(
            adoption_error(AdoptionError::LegacyRootOutsideDataDir),
            BridgeError::AdoptionLegacyRootOutsideDataDir
        ));
        assert!(matches!(
            adoption_error(AdoptionError::PepperUnavailable),
            BridgeError::AdoptionPepperUnavailable
        ));
        assert!(matches!(
            adoption_error(AdoptionError::ActionForbidden),
            BridgeError::AdoptionActionForbidden
        ));
        assert!(matches!(
            check_app_reset_allowed("stale".into(), "/untrusted".into()),
            Err(BridgeError::IncompatibleBuild)
        ));
    }
}

#[cfg(all(test, feature = "fixture"))]
#[path = "provider_tests.rs"]
mod provider_tests;

/// One admitted request; awaiting it twice is rejected rather than executing twice.
#[derive(uniffi::Object)]
pub struct AirExecution {
    session: Arc<LocalSession>,
    admitted: Mutex<Option<AdmittedRequest>>,
    request_id: u64,
    generation: u64,
}

impl AirExecution {
    fn new(
        session: Arc<LocalSession>,
        admitted: AdmittedRequest,
        request_id: u64,
        generation: u64,
    ) -> Arc<Self> {
        Arc::new(Self {
            session,
            admitted: Mutex::new(Some(admitted)),
            request_id,
            generation,
        })
    }
}

#[uniffi::export]
impl AirExecution {
    pub async fn finish(&self) -> Result<AirReply, BridgeError> {
        let admitted = self
            .admitted
            .lock()
            .map_err(|_| BridgeError::RuntimeUnavailable)?
            .take()
            .ok_or(BridgeError::InvalidRequestId)?;
        let reply = self
            .session
            .execute_admitted(admitted)
            .await
            .map_err(map_error)?;
        let mut payload = zeroize::Zeroizing::new(
            serde_json::to_vec(&reply).map_err(|_| BridgeError::RuntimeUnavailable)?,
        );
        if payload.len() > MAX_METADATA_BYTES {
            return Err(BridgeError::PayloadTooLarge);
        }
        if self.session.snapshot().map_err(map_error)?.generation != self.generation {
            return Err(BridgeError::SessionRevoked);
        }
        Ok(AirReply {
            request_id: self.request_id,
            generation: self.generation,
            payload: std::mem::take(&mut *payload),
        })
    }
}

#[cfg(target_os = "ios")]
fn application_identity() -> Option<String> {
    use core_foundation::{bundle::CFBundle, string::CFString};
    CFBundle::main_bundle()
        .info_dictionary()
        .find(CFString::new("CFBundleIdentifier"))
        .and_then(|value| value.downcast::<CFString>())
        .map(|value| value.to_string())
}

/// Android has no bundle dictionary. The process name the kernel reports is the
/// application id, optionally suffixed with `:process` for a private process;
/// a caller-supplied string can never grant it.
#[cfg(target_os = "android")]
fn application_identity() -> Option<String> {
    let raw = std::fs::read("/proc/self/cmdline").ok()?;
    let end = raw.iter().position(|byte| *byte == 0).unwrap_or(raw.len());
    let name = std::str::from_utf8(&raw[..end]).ok()?.trim();
    let package = name.split(':').next()?;
    (!package.is_empty()).then(|| package.to_string())
}

#[cfg(target_os = "ios")]
const NATIVE_APPLICATION_IDENTITIES: &[&str] = &[
    "com.chromvoid.iosair.dev",
    "com.chromvoid.iosair.dev.fixture",
    "com.chromvoid.iosair.dev.tests",
    "com.chromvoid.iosair.dev.tests.fixture",
    "com.chromvoid.iosair.dev.bridge-host",
    "com.chromvoid.iosair.dev.bridge-host.fixture",
];

#[cfg(any(target_os = "android", test))]
const ANDROID_APPLICATION_IDENTITIES: &[&str] = &[
    "com.chromvoid.app",
    "com.chromvoid.air.dev",
    "com.chromvoid.air.dev.fixture",
    "com.chromvoid.air.dev.test",
];

#[cfg(target_os = "android")]
const NATIVE_APPLICATION_IDENTITIES: &[&str] = ANDROID_APPLICATION_IDENTITIES;

/// Resolve the one storage root this process may own. The identity comes from
/// the OS, the layout from the platform, and neither is taken from the caller.
#[cfg(any(target_os = "ios", target_os = "android"))]
fn platform_storage_root(requested: &str) -> Result<std::path::PathBuf, BridgeError> {
    let identity = application_identity().ok_or(BridgeError::InvalidApplicationIdentity)?;
    if !NATIVE_APPLICATION_IDENTITIES.contains(&identity.as_str()) {
        return Err(BridgeError::InvalidApplicationIdentity);
    }
    #[cfg(target_os = "ios")]
    {
        let home = std::env::var_os("HOME").ok_or(BridgeError::InvalidStorageRoot)?;
        crate::storage_root::validate_apple_storage_root(
            std::path::Path::new(&home),
            std::path::Path::new(requested),
        )
    }
    #[cfg(target_os = "android")]
    {
        crate::storage_root::validate_android_storage_root(
            &identity,
            std::path::Path::new(requested),
        )
    }
}

#[cfg(feature = "fixture")]
#[path = "passkey_fixture.rs"]
mod passkey_fixture;

#[cfg(feature = "fixture")]
#[path = "storage_restore_fixture.rs"]
mod storage_restore_fixture;
#[cfg(feature = "fixture")]
#[path = "wallet_fixture.rs"]
mod wallet_fixture;

impl AirRuntime {
    fn admit_execution(
        &self,
        request_id: u64,
        generation: u64,
        request: RpcRequest,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .admit(request_id, generation, request)
            .map_err(map_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            generation,
        ))
    }

    fn open(
        expected_fingerprint: String,
        storage_root: String,
        adapter: impl FnOnce(
            std::path::PathBuf,
        ) -> Result<chromvoid_client_runtime::LocalCoreAdapter, String>,
    ) -> Result<Self, BridgeError> {
        check_bridge(expected_fingerprint)?;
        #[cfg(not(any(target_os = "ios", target_os = "android")))]
        {
            let _ = (storage_root, adapter);
            Err(BridgeError::UnsupportedPlatform)
        }
        #[cfg(any(target_os = "ios", target_os = "android"))]
        {
            use chromvoid_client_runtime::session::SessionLease;
            static LEASE: Mutex<Option<SessionLease>> = Mutex::new(None);
            let mut lease = LEASE.lock().map_err(|_| BridgeError::RuntimeUnavailable)?;
            if lease.as_ref().is_some_and(SessionLease::is_alive) {
                return Err(BridgeError::RuntimeAlreadyExists);
            }
            let root = platform_storage_root(&storage_root)?;
            #[cfg(target_os = "android")]
            let mutation_guard = prepare_android_storage(&root)?;
            let adapter = adapter(root).map_err(|_| BridgeError::RuntimeUnavailable)?;
            #[cfg(target_os = "android")]
            let adapter = adapter.with_storage_mutation_guard(mutation_guard);
            let session = LocalSession::new(adapter).map_err(map_error)?;
            *lease = Some(session.lease());
            let session = Arc::new(session);
            // Autofill and Credential Manager answer other apps from this process.
            #[cfg(target_os = "android")]
            android_provider::register(&session);
            Ok(Self {
                session,
                host: Mutex::new(None),
            })
        }
    }
}

#[cfg(any(target_os = "android", test))]
fn adoption_error(error: crate::tauri_adoption::AdoptionError) -> BridgeError {
    use crate::tauri_adoption::AdoptionError;
    match error {
        AdoptionError::Blocked => BridgeError::AdoptionBlocked,
        AdoptionError::LegacyRootOutsideDataDir => BridgeError::AdoptionLegacyRootOutsideDataDir,
        AdoptionError::LegacyRootUnavailable => BridgeError::AdoptionLegacyRootUnavailable,
        AdoptionError::PepperUnavailable => BridgeError::AdoptionPepperUnavailable,
        AdoptionError::StorageUnavailable => BridgeError::AdoptionStorageUnavailable,
        AdoptionError::ActionForbidden => BridgeError::AdoptionActionForbidden,
    }
}

/// The validated root is exactly filesDir/ChromVoidAir; its grandparent is
/// Context.dataDir. No caller-controlled extra FFI coordinate is necessary.
#[cfg(any(target_os = "android", test))]
fn android_data_dir(root: &std::path::Path) -> Result<&std::path::Path, BridgeError> {
    root.parent()
        .filter(|files| files.file_name().is_some_and(|name| name == "files"))
        .and_then(std::path::Path::parent)
        .ok_or(BridgeError::InvalidStorageRoot)
}

#[cfg(target_os = "android")]
fn prepare_android_storage(
    root: &std::path::Path,
) -> Result<chromvoid_core::rpc::StorageMutationGuard, BridgeError> {
    use chromvoid_core::crypto::keystore::{AndroidKeystore, Keystore};
    use chromvoid_core::rpc::{StorageMutationError, StorageMutationGuard};
    let identity = application_identity().ok_or(BridgeError::InvalidApplicationIdentity)?;
    let data_dir = android_data_dir(root)?.to_path_buf();
    crate::tauri_adoption::adopt_for_identity(&identity, &data_dir, root, || {
        let pepper = AndroidKeystore::new()
            .load_storage_pepper()
            .map_err(|_| crate::tauri_adoption::AdoptionError::PepperUnavailable)?
            .ok_or(crate::tauri_adoption::AdoptionError::PepperUnavailable)?;
        let _pepper = zeroize::Zeroizing::new(pepper);
        Ok(())
    })
    .map_err(adoption_error)?;
    let root = root.to_path_buf();
    Ok(StorageMutationGuard::new(move || {
        if identity != "com.chromvoid.app" {
            return Ok(());
        }
        crate::tauri_adoption::check_destructive_allowed(&data_dir, &root)
            .map_err(|_| StorageMutationError::AdoptionRequired)
    }))
}

/// Recovery can run without an open Core. It must use the same owner and
/// fail-closed policy before Android clears app-global key material and files.
#[uniffi::export]
pub fn check_app_reset_allowed(
    expected_fingerprint: String,
    storage_root: String,
) -> Result<(), BridgeError> {
    check_bridge(expected_fingerprint)?;
    #[cfg(target_os = "android")]
    {
        let root = platform_storage_root(&storage_root)?;
        if application_identity().as_deref() == Some("com.chromvoid.app") {
            crate::tauri_adoption::check_destructive_allowed(android_data_dir(&root)?, &root)
                .map_err(|_| BridgeError::AdoptionActionForbidden)?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = storage_root;
        Err(BridgeError::UnsupportedPlatform)
    }
}

#[cfg(all(test, feature = "fixture"))]
#[path = "storage_erase_tests.rs"]
mod storage_erase_tests;
