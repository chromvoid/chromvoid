//! Credential provider shared types and static contract data (ADR-020).

mod capabilities;
mod constants;
mod context;
mod entry;
mod meta;
mod session;

pub(super) use capabilities::{
    capability_matrix, command_error_map, passkey_unsupported_reason, passkeys_lite_status_matrix,
};
pub(super) use constants::{
    CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS, CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES,
    CREDENTIAL_PROVIDER_SESSION_TTL_SECS,
};
pub(super) use context::{ProviderContext, ProviderContextWeb, ProviderMatchKind};
pub(super) use entry::{
    CredentialProviderEntry, CredentialProviderOtpResolution, PassmanagerUrlRule,
};
pub(super) use meta::PassmanagerCredentialMeta;
pub(super) use session::CredentialProviderSession;
