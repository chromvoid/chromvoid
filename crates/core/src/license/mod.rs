mod error;
mod fingerprint;
mod policy;
mod store;
#[cfg(test)]
mod tests;
mod trusted_keys;
mod types;
mod validation;

pub use policy::{feature_set_from_snapshot, pro_feature_keys};
pub use store::LicenseStore;
pub use types::{
    BuildPolicy, EntitlementSnapshot, LicenseCert, LicensePlan, SignedCert, LICENSE_KEY_ID_2026_01,
    PRO_FEATURE_BROWSER_EXTENSION, PRO_FEATURE_CREDENTIAL_PROVIDER, PRO_FEATURE_CRYPTO_WALLET,
    PRO_FEATURE_EMERGENCY_ACCESS, PRO_FEATURE_MOUNTED_VAULT, PRO_FEATURE_REMOTE,
    PRO_FEATURE_SSH_AGENT,
};
