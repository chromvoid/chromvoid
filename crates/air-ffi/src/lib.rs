//! Mobile foreign-language ABI: Apple and Android share one contract.
//! The W1 synthetic router is an explicit debug-only test feature.
#[cfg(feature = "fixture")]
mod fixture;
#[cfg(test)]
mod test_keystore_tests;

mod markdown;
pub use markdown::{AirMarkdownError, parse_air_markdown, toggle_air_markdown_task};
mod payment_card;
pub use payment_card::{
    AirPaymentCardFormat, AirPaymentCardNumber, inspect_payment_card_number,
    payment_card_default_title, payment_card_format,
};
mod provider_codec;
mod provider_identity;
pub use provider_identity::{AirPasswordIdentity, apple_password_identities};
mod runtime;
#[cfg(any(target_os = "android", test))]
mod tauri_adoption;
pub use provider_codec::{
    AirProviderCoreRequest, decode_apple_provider_request, encode_apple_provider_response,
};
#[cfg(target_os = "android")]
mod android_context;
#[cfg(target_os = "android")]
mod android_image_decoder;
#[cfg(target_os = "android")]
mod android_log;
#[cfg(any(target_os = "ios", target_os = "android", test))]
mod storage_root;
pub use runtime::check_app_reset_allowed;
pub use runtime::{
    AirBackupArtifact, AirDerivative, AirEraseReceipt, AirEvent, AirEventBatch, AirEventKind,
    AirExecution, AirExport, AirExportLimits, AirFileLimits, AirFileReader, AirFileWriteTarget,
    AirFileWriter, AirHost, AirHostConnection, AirHostConnectionState, AirHostPairingOffer,
    AirHostPeer, AirHostPhase, AirHostPreferences, AirHostSnapshot, AirImport, AirImportLimits,
    AirImportMode, AirPhase, AirReply, AirRestoreArtifact, AirRestoreArtifactSpec,
    AirRestoreLimits, AirRestorePreview, AirRuntime, AirSnapshot, AirStorageBackup,
    AirStorageErase, AirStorageRestore, AirUsbApprovalKind, AirUsbLinkState, AirUsbPairingRequest,
    AirUsbSessionRequest, AirUsbStatus, NATIVE_COMMANDS,
};

uniffi::setup_scaffolding!();

pub const BUILD_FINGERPRINT: &str = env!("AIR_BUILD_FINGERPRINT");
pub const MAX_METADATA_BYTES: usize = 1024 * 1024;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum BridgeError {
    #[error("Erasure is not ready for this operation")]
    InvalidEraseState,
    #[error("Restore is not ready for this operation")]
    InvalidRestoreState,
    #[error("Restore input chunk exceeds limit")]
    RestoreInputTooLarge,
    #[error("Restore review expired; select the backup again")]
    RestoreExpired,
    #[error("Host is unavailable")]
    HostUnavailable,
    #[error("Enter a valid secure relay URL")]
    InvalidRelayURL,
    #[error("Enter a device label")]
    HostDeviceLabelRequired,
    #[error("Unsupported native platform")]
    UnsupportedPlatform,
    #[error("Unexpected application identity")]
    InvalidApplicationIdentity,
    #[error("Invalid development storage root")]
    InvalidStorageRoot,
    #[error("A native runtime already owns storage")]
    RuntimeAlreadyExists,
    #[error("Runtime is unavailable")]
    RuntimeUnavailable,
    #[error("Tauri adoption is blocked because both roots contain storage")]
    AdoptionBlocked,
    #[error("The legacy storage root is outside the private data directory")]
    AdoptionLegacyRootOutsideDataDir,
    #[error("The legacy storage root cannot be safely inspected")]
    AdoptionLegacyRootUnavailable,
    #[error("The adopted storage pepper is absent or unreadable")]
    AdoptionPepperUnavailable,
    #[error("The adopted storage structure is unavailable")]
    AdoptionStorageUnavailable,
    #[error("This action is forbidden until Tauri storage adoption completes")]
    AdoptionActionForbidden,
    #[error("Capability is unavailable in this native slice")]
    CapabilityUnavailable,
    #[error("Session authority was revoked")]
    SessionRevoked,
    #[error("Request was canceled")]
    RequestCanceled,
    #[error("Request identifier cannot be reused")]
    InvalidRequestId,
    #[error("Runtime request queue is full")]
    RuntimeBusy,
    #[error("Bindings and native library differ; rebuild the app")]
    IncompatibleBuild,
    #[error("Synthetic fixtures are not enabled in this build")]
    FixtureUnavailable,
    #[error("Request exceeds the metadata limit")]
    PayloadTooLarge,
    #[error("Credential import exceeds the transfer limit")]
    ImportTooLarge,
    #[error("Credential import size differs from its declared byte count")]
    ImportLengthMismatch,
    #[error("Credential import is not ready for this operation")]
    InvalidImportState,
    #[error("Credential export is not ready for this operation")]
    InvalidExportState,
    #[error("Storage backup is not ready for this operation")]
    InvalidBackupState,
    #[error("Unknown storage backup artifact")]
    InvalidBackupArtifact,
    #[error("File reader is not ready for this operation")]
    InvalidFileReadState,
    #[error("File writer is not ready for this operation")]
    InvalidFileWriteState,
    #[error("File chunk length is outside the transfer contract")]
    InvalidFileLength,
    #[error("Derivative is not ready for this operation")]
    InvalidDerivativeState,
    #[error("Derivative exceeds the transfer limit")]
    DerivativeTooLarge,
    #[error("Malformed RPC request")]
    InvalidRequest,
    #[error("Unsupported RPC version")]
    UnsupportedVersion,
}

#[derive(uniffi::Record)]
pub struct BridgeInfo {
    pub fingerprint: String,
    pub protocol_version: u8,
    pub fixture_enabled: bool,
}

#[uniffi::export]
pub fn check_bridge(expected_fingerprint: String) -> Result<BridgeInfo, BridgeError> {
    if expected_fingerprint != BUILD_FINGERPRINT {
        return Err(BridgeError::IncompatibleBuild);
    }
    Ok(BridgeInfo {
        fingerprint: BUILD_FINGERPRINT.into(),
        protocol_version: chromvoid_core::rpc::types::PROTOCOL_VERSION,
        fixture_enabled: cfg!(feature = "fixture"),
    })
}

/// Never owns storage, Keychain or network. Enabled only in a debug fixture binary.
#[derive(uniffi::Object)]
pub struct FixtureHarness {
    #[cfg(feature = "fixture")]
    unlocked: std::sync::atomic::AtomicBool,
}

#[uniffi::export]
impl FixtureHarness {
    #[uniffi::constructor]
    pub fn new(expected_fingerprint: String) -> Result<Self, BridgeError> {
        check_bridge(expected_fingerprint)?;
        if !cfg!(feature = "fixture") {
            return Err(BridgeError::FixtureUnavailable);
        }
        Ok(Self {
            #[cfg(feature = "fixture")]
            unlocked: std::sync::atomic::AtomicBool::new(false),
        })
    }

    pub fn execute(&self, request: Vec<u8>) -> Result<Vec<u8>, BridgeError> {
        if request.len() > MAX_METADATA_BYTES {
            return Err(BridgeError::PayloadTooLarge);
        }
        let parsed: chromvoid_core::rpc::RpcRequest =
            serde_json::from_slice(&request).map_err(|_| BridgeError::InvalidRequest)?;
        if parsed.v != chromvoid_core::rpc::types::PROTOCOL_VERSION {
            return Err(BridgeError::UnsupportedVersion);
        }
        #[cfg(feature = "fixture")]
        {
            self.dispatch(parsed)
        }
        #[cfg(not(feature = "fixture"))]
        {
            Err(BridgeError::FixtureUnavailable)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incompatible_bindings_cannot_create_a_harness() {
        assert!(matches!(
            FixtureHarness::new("stale".into()),
            Err(BridgeError::IncompatibleBuild)
        ));
    }

    #[cfg(not(feature = "fixture"))]
    #[test]
    fn ordinary_build_cannot_create_fixture() {
        assert!(matches!(
            FixtureHarness::new(BUILD_FINGERPRINT.into()),
            Err(BridgeError::FixtureUnavailable)
        ));
    }
}
