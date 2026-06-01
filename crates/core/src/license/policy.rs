use std::collections::BTreeSet;

use super::types::{
    BuildPolicy, EntitlementSnapshot, LicensePlan, PRO_FEATURE_BROWSER_EXTENSION,
    PRO_FEATURE_CREDENTIAL_PROVIDER, PRO_FEATURE_CRYPTO_WALLET, PRO_FEATURE_EMERGENCY_ACCESS,
    PRO_FEATURE_MOUNTED_VAULT, PRO_FEATURE_REMOTE, PRO_FEATURE_SSH_AGENT,
};

impl EntitlementSnapshot {
    pub fn free(build_policy: BuildPolicy) -> Self {
        Self {
            licensed: false,
            plan: LicensePlan::Free,
            feature_keys: Vec::new(),
            source_core: "local".to_string(),
            build_policy,
        }
    }
}

pub(super) fn pro_entitlement(build_policy: BuildPolicy) -> EntitlementSnapshot {
    EntitlementSnapshot {
        licensed: true,
        plan: LicensePlan::Pro,
        feature_keys: pro_feature_keys(),
        source_core: "local".to_string(),
        build_policy,
    }
}

pub fn pro_feature_keys() -> Vec<String> {
    [
        PRO_FEATURE_CRYPTO_WALLET,
        PRO_FEATURE_REMOTE,
        PRO_FEATURE_CREDENTIAL_PROVIDER,
        PRO_FEATURE_SSH_AGENT,
        PRO_FEATURE_EMERGENCY_ACCESS,
        PRO_FEATURE_BROWSER_EXTENSION,
        PRO_FEATURE_MOUNTED_VAULT,
    ]
    .into_iter()
    .map(ToOwned::to_owned)
    .collect()
}

pub fn feature_set_from_snapshot(snapshot: &EntitlementSnapshot) -> BTreeSet<String> {
    snapshot.feature_keys.iter().cloned().collect()
}
