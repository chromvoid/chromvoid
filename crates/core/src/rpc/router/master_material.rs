//! Master password material helpers backed by typed storage artifacts.

use getrandom::getrandom;

use crate::error::ErrorCode;
use crate::storage::StorageArtifact;

use super::state::RpcRouter;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct MasterMaterialError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type MasterMaterialResult<T> = Result<T, MasterMaterialError>;

impl MasterMaterialError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn invalid_master_password() -> Self {
        Self::new(
            "Invalid master password",
            Some(ErrorCode::InvalidMasterPassword),
        )
    }

    pub(in crate::rpc::router) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        let code = self.code().map(str::to_owned);
        (self.message, code)
    }
}

pub(super) struct MasterMaterial {
    pub(super) salt: [u8; 16],
    pub(super) verify: [u8; 32],
}

pub(super) struct MasterSetupOutcome {
    pub(super) created: bool,
}

impl RpcRouter {
    pub(super) fn ensure_master_setup(
        &self,
        master_password: &str,
    ) -> MasterMaterialResult<MasterSetupOutcome> {
        use crate::crypto::{derive_vault_key, hash};

        if self.master_verify_exists()? {
            self.verify_master_password(master_password)?;
            return Ok(MasterSetupOutcome { created: false });
        }

        let master_salt = self.get_or_create_master_salt()?;
        let master_key_derived = derive_vault_key(master_password, &master_salt).map_err(|e| {
            MasterMaterialError::internal(format!("Failed to derive master key: {}", e))
        })?;
        let verify_hash = hash(&*master_key_derived);
        self.write_master_verify(&verify_hash)?;

        Ok(MasterSetupOutcome { created: true })
    }

    pub(super) fn master_verify_exists(&self) -> MasterMaterialResult<bool> {
        self.storage
            .artifact_exists(StorageArtifact::MasterVerify)
            .map_err(|error| {
                MasterMaterialError::internal(format!("Failed to check master.verify: {error}"))
            })
    }

    pub(super) fn get_or_create_master_salt(&self) -> MasterMaterialResult<[u8; 16]> {
        match self.storage.read_artifact(StorageArtifact::MasterSalt) {
            Ok(Some(bytes)) => fixed_array::<16>(bytes, "master.salt"),
            Ok(None) => {
                let mut salt = [0u8; 16];
                getrandom(&mut salt).map_err(|error| {
                    MasterMaterialError::internal(format!("Failed to create master.salt: {error}"))
                })?;
                self.write_master_salt_durable(&salt)?;
                Ok(salt)
            }
            Err(error) => Err(MasterMaterialError::internal(format!(
                "Failed to read master.salt: {error}"
            ))),
        }
    }

    pub(super) fn read_master_salt(&self) -> MasterMaterialResult<[u8; 16]> {
        read_fixed_artifact::<16>(self, StorageArtifact::MasterSalt, "master.salt")
    }

    pub(super) fn read_master_verify(&self) -> MasterMaterialResult<[u8; 32]> {
        read_fixed_artifact::<32>(self, StorageArtifact::MasterVerify, "master.verify")
    }

    pub(super) fn read_master_material(&self) -> MasterMaterialResult<MasterMaterial> {
        Ok(MasterMaterial {
            salt: self.read_master_salt()?,
            verify: self.read_master_verify()?,
        })
    }

    pub(super) fn write_master_verify(&self, verify: &[u8; 32]) -> MasterMaterialResult<()> {
        self.write_master_verify_durable(verify)
    }

    fn write_master_salt_durable(&self, salt: &[u8; 16]) -> MasterMaterialResult<()> {
        self.storage
            .write_artifact_durable(StorageArtifact::MasterSalt, salt)
            .map_err(|error| {
                MasterMaterialError::internal(format!(
                    "Failed to create master.salt: {}",
                    error.error
                ))
            })?;
        Ok(())
    }

    fn write_master_verify_durable(&self, verify: &[u8; 32]) -> MasterMaterialResult<()> {
        self.storage
            .write_artifact_durable(StorageArtifact::MasterVerify, verify)
            .map_err(|error| {
                MasterMaterialError::internal(format!(
                    "Failed to write master.verify: {}",
                    error.error
                ))
            })?;
        Ok(())
    }

    pub(super) fn remove_master_material_best_effort(&self) {
        let _ = self.storage.remove_artifact(StorageArtifact::MasterSalt);
        let _ = self.storage.remove_artifact(StorageArtifact::MasterVerify);
        let _ = self
            .storage
            .remove_artifact(StorageArtifact::MasterVerifyRekeyTemp);
        let _ = self
            .storage
            .remove_artifact(StorageArtifact::MasterRekeyTransaction);
    }

    pub(super) fn verify_master_password(&self, master_password: &str) -> MasterMaterialResult<()> {
        let material = self.read_master_material()?;
        self.verify_master_password_with_material(master_password, &material.salt, &material.verify)
    }

    pub(super) fn verify_master_password_with_material(
        &self,
        master_password: &str,
        master_salt: &[u8; 16],
        expected_verify: &[u8; 32],
    ) -> MasterMaterialResult<()> {
        use crate::crypto::{derive_vault_key, hash};

        let master_key_derived = derive_vault_key(master_password, master_salt)
            .map_err(|e| MasterMaterialError::internal(e.to_string()))?;
        let actual_verify = hash(&*master_key_derived);

        if &actual_verify != expected_verify {
            return Err(MasterMaterialError::invalid_master_password());
        }

        Ok(())
    }

    pub(in crate::rpc::router) fn derive_backup_key_v2_for_password(
        &self,
        master_password: &str,
    ) -> MasterMaterialResult<[u8; 32]> {
        self.verify_master_password(master_password)?;
        let master_salt = self.read_master_salt()?;
        derive_backup_key_v2(master_password, &master_salt)
    }

    pub(in crate::rpc::router) fn derive_backup_key_v2(&self) -> MasterMaterialResult<[u8; 32]> {
        let master_password = self
            .master_key
            .as_deref()
            .ok_or_else(|| MasterMaterialError::internal("Master password not loaded"))?;

        // Ensure the cached master_password matches on-disk verification.
        self.verify_master_password(master_password)?;
        let master_salt = self.read_master_salt()?;
        derive_backup_key_v2(master_password, &master_salt)
    }
}

pub(in crate::rpc::router) fn derive_backup_key_v2(
    master_password: &str,
    master_salt: &[u8; 16],
) -> MasterMaterialResult<[u8; 32]> {
    use crate::crypto::{derive_vault_key, hash};

    let master_key_derived = derive_vault_key(master_password, master_salt)
        .map_err(|e| MasterMaterialError::internal(e.to_string()))?;

    let mut buf = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
    buf.extend_from_slice(&*master_key_derived);
    buf.extend_from_slice(b"local-backup-v2");
    Ok(hash(&buf))
}

fn read_fixed_artifact<const N: usize>(
    router: &RpcRouter,
    artifact: StorageArtifact,
    name: &str,
) -> MasterMaterialResult<[u8; N]> {
    let bytes = router.storage.read_artifact(artifact).map_err(|error| {
        MasterMaterialError::internal(format!("Failed to read {name}: {error}"))
    })?;
    let Some(bytes) = bytes else {
        return Err(MasterMaterialError::internal(format!(
            "Failed to read {name}: not found"
        )));
    };
    fixed_array(bytes, name)
}

fn fixed_array<const N: usize>(bytes: Vec<u8>, name: &str) -> MasterMaterialResult<[u8; N]> {
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| MasterMaterialError::internal(format!("Invalid {name}")))
}
