use super::types::{ClientKeyRef, HostId, MobileUsbError, MobileUsbErrorCode};

pub trait MobileUsbSecretStore: Send + Sync {
    fn save_client_key(&self, host_id: &HostId, key: &[u8])
        -> Result<ClientKeyRef, MobileUsbError>;
    fn load_client_key(&self, key_ref: &ClientKeyRef) -> Result<Vec<u8>, MobileUsbError>;
    fn delete_client_key(&self, key_ref: &ClientKeyRef) -> Result<(), MobileUsbError>;
}

pub struct KeyringMobileUsbSecretStore {
    service: String,
}

impl Default for KeyringMobileUsbSecretStore {
    fn default() -> Self {
        Self::new("chromvoid.mobile_usb")
    }
}

impl KeyringMobileUsbSecretStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, key_ref: &ClientKeyRef) -> Result<keyring::Entry, MobileUsbError> {
        keyring::Entry::new(&self.service, key_ref).map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::SecretStoreUnavailable,
                format!("secret store entry unavailable: {error}"),
            )
        })
    }
}

impl MobileUsbSecretStore for KeyringMobileUsbSecretStore {
    fn save_client_key(
        &self,
        host_id: &HostId,
        key: &[u8],
    ) -> Result<ClientKeyRef, MobileUsbError> {
        let key_ref = format!("mobile_usb:{host_id}");
        let value = hex::encode(key);
        self.entry(&key_ref)?
            .set_password(&value)
            .map_err(|error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::SecretStoreUnavailable,
                    format!("secret store save failed: {error}"),
                )
            })?;
        Ok(key_ref)
    }

    fn load_client_key(&self, key_ref: &ClientKeyRef) -> Result<Vec<u8>, MobileUsbError> {
        let value = self.entry(key_ref)?.get_password().map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::SecretRefInvalid,
                format!("secret ref invalid: {error}"),
            )
        })?;
        hex::decode(value).map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::SecretRefInvalid,
                format!("secret ref contains invalid key data: {error}"),
            )
        })
    }

    fn delete_client_key(&self, key_ref: &ClientKeyRef) -> Result<(), MobileUsbError> {
        self.entry(key_ref)?.delete_credential().map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::SecretStoreUnavailable,
                format!("secret delete failed: {error}"),
            )
        })
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct InMemoryMobileUsbSecretStore {
    keys: std::sync::Mutex<std::collections::HashMap<ClientKeyRef, Vec<u8>>>,
    fail_save: std::sync::Mutex<bool>,
    fail_load: std::sync::Mutex<bool>,
    delete_attempts: std::sync::Mutex<Vec<ClientKeyRef>>,
}

#[cfg(test)]
impl InMemoryMobileUsbSecretStore {
    pub(crate) fn set_fail_save(&self, fail: bool) {
        *self.fail_save.lock().expect("fail_save") = fail;
    }

    pub(crate) fn set_fail_load(&self, fail: bool) {
        *self.fail_load.lock().expect("fail_load") = fail;
    }

    pub(crate) fn insert(&self, key_ref: ClientKeyRef, key: Vec<u8>) {
        self.keys.lock().expect("keys").insert(key_ref, key);
    }

    pub(crate) fn delete_attempts(&self) -> Vec<ClientKeyRef> {
        self.delete_attempts
            .lock()
            .expect("delete_attempts")
            .clone()
    }
}

#[cfg(test)]
impl MobileUsbSecretStore for InMemoryMobileUsbSecretStore {
    fn save_client_key(
        &self,
        host_id: &HostId,
        key: &[u8],
    ) -> Result<ClientKeyRef, MobileUsbError> {
        if *self.fail_save.lock().expect("fail_save") {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::SecretStoreUnavailable,
                "fake save failure",
            ));
        }
        let key_ref = format!("fake:{host_id}");
        self.keys
            .lock()
            .expect("keys")
            .insert(key_ref.clone(), key.to_vec());
        Ok(key_ref)
    }

    fn load_client_key(&self, key_ref: &ClientKeyRef) -> Result<Vec<u8>, MobileUsbError> {
        if *self.fail_load.lock().expect("fail_load") {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::SecretRefInvalid,
                "fake load failure",
            ));
        }
        self.keys
            .lock()
            .expect("keys")
            .get(key_ref)
            .cloned()
            .ok_or_else(|| {
                MobileUsbError::new(MobileUsbErrorCode::SecretRefInvalid, "missing fake key")
            })
    }

    fn delete_client_key(&self, key_ref: &ClientKeyRef) -> Result<(), MobileUsbError> {
        self.delete_attempts
            .lock()
            .expect("delete_attempts")
            .push(key_ref.clone());
        self.keys.lock().expect("keys").remove(key_ref);
        Ok(())
    }
}
