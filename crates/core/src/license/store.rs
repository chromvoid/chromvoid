use std::collections::BTreeMap;
use std::path::PathBuf;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::VerifyingKey;
use getrandom::getrandom;

use crate::durable_file::DurableFileStore;

use super::error::LicenseError;
use super::fingerprint::device_fingerprint_for_instance_id;
use super::policy::pro_entitlement;
use super::trusted_keys::trusted_keys_from_env;
use super::types::{BuildPolicy, EntitlementSnapshot, SignedCert};
use super::validation;

pub(super) const CORE_INSTANCE_ID_FILE: &str = "core_instance_id";
const LICENSE_CERT_FILE: &str = "license.cert.json";

#[derive(Debug, Clone)]
pub struct LicenseStore {
    files: DurableFileStore,
    trusted_keys: BTreeMap<String, VerifyingKey>,
    build_policy: BuildPolicy,
}

impl LicenseStore {
    pub fn new(root: impl Into<PathBuf>, build_policy: BuildPolicy) -> Self {
        Self {
            files: DurableFileStore::new(root.into()),
            trusted_keys: trusted_keys_from_env(),
            build_policy,
        }
    }

    pub fn with_trusted_keys(
        root: impl Into<PathBuf>,
        build_policy: BuildPolicy,
        trusted_keys: BTreeMap<String, VerifyingKey>,
    ) -> Self {
        Self {
            files: DurableFileStore::new(root.into()),
            trusted_keys,
            build_policy,
        }
    }

    #[cfg(test)]
    pub(super) fn with_file_store_for_tests(
        files: DurableFileStore,
        build_policy: BuildPolicy,
        trusted_keys: BTreeMap<String, VerifyingKey>,
    ) -> Self {
        Self {
            files,
            trusted_keys,
            build_policy,
        }
    }

    pub fn build_policy(&self) -> BuildPolicy {
        self.build_policy
    }

    pub fn device_fingerprint(&self) -> Result<String, String> {
        self.device_fingerprint_typed()
            .map_err(|error| error.to_string())
    }

    pub fn install_cert(&self, cert: SignedCert) -> Result<EntitlementSnapshot, String> {
        self.install_cert_typed(cert)
            .map_err(|error| error.to_string())
    }

    pub fn current_cert(&self) -> Result<SignedCert, String> {
        self.current_cert_typed().map_err(|error| error.to_string())
    }

    pub fn uninstall_cert(&self) -> Result<EntitlementSnapshot, String> {
        self.uninstall_cert_typed()
            .map_err(|error| error.to_string())
    }

    pub fn status(&self) -> EntitlementSnapshot {
        let Some(cert) = self.read_cert() else {
            return EntitlementSnapshot::free(self.build_policy);
        };

        if self.validate_cert(&cert).is_err() || cert.payload.featureset != "pro" {
            return EntitlementSnapshot::free(self.build_policy);
        }

        pro_entitlement(self.build_policy)
    }

    pub fn is_pro_enabled_for_guards(&self) -> bool {
        self.status().licensed
    }

    fn install_cert_typed(&self, cert: SignedCert) -> Result<EntitlementSnapshot, LicenseError> {
        self.validate_cert(&cert)?;
        let bytes = serde_json::to_vec_pretty(&cert).map_err(LicenseError::message)?;
        self.files
            .write_atomic(LICENSE_CERT_FILE, &bytes)
            .map_err(LicenseError::message)?;
        Ok(self.status())
    }

    fn current_cert_typed(&self) -> Result<SignedCert, LicenseError> {
        let cert = self.read_cert().ok_or(LicenseError::CertNotInstalled)?;
        self.validate_cert(&cert)?;
        Ok(cert)
    }

    fn uninstall_cert_typed(&self) -> Result<EntitlementSnapshot, LicenseError> {
        self.files
            .remove(LICENSE_CERT_FILE)
            .map_err(LicenseError::message)?;
        Ok(self.status())
    }

    fn validate_cert(&self, cert: &SignedCert) -> Result<(), LicenseError> {
        let expected_fingerprint = self.device_fingerprint_typed()?;
        validation::validate_cert(cert, &self.trusted_keys, &expected_fingerprint)
    }

    fn read_cert(&self) -> Option<SignedCert> {
        let bytes = self.files.read(LICENSE_CERT_FILE).ok().flatten()?;
        serde_json::from_slice(&bytes).ok()
    }

    fn device_fingerprint_typed(&self) -> Result<String, LicenseError> {
        let instance_id = self.core_instance_id()?;
        Ok(device_fingerprint_for_instance_id(&instance_id))
    }

    fn core_instance_id(&self) -> Result<String, LicenseError> {
        if let Ok(Some(existing)) = self.files.read_to_string(CORE_INSTANCE_ID_FILE) {
            let id = existing.trim();
            if !id.is_empty() {
                return Ok(id.to_string());
            }
        }

        let mut bytes = [0u8; 32];
        getrandom(&mut bytes).map_err(LicenseError::message)?;
        let id = URL_SAFE_NO_PAD.encode(bytes);
        self.files
            .write_atomic(CORE_INSTANCE_ID_FILE, id.as_bytes())
            .map_err(LicenseError::message)?;
        Ok(id)
    }
}
