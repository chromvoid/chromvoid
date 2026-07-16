use std::path::{Path, PathBuf};

use super::secret_store::MobileUsbSecretStore;
use super::types::{
    HostId, MobileUsbError, MobileUsbErrorCode, MobileUsbPairedHostRecord,
    MobileUsbScanClassification, MobileUsbScanResult,
};

pub trait MobileUsbPairingStore: Send + Sync {
    fn list(&self) -> Result<Vec<MobileUsbPairedHostRecord>, MobileUsbError>;
    fn get(&self, host_id: &HostId) -> Result<Option<MobileUsbPairedHostRecord>, MobileUsbError>;
    fn commit_pairing(&self, record: MobileUsbPairedHostRecord) -> Result<(), MobileUsbError>;
    fn touch_last_seen(
        &self,
        host_id: &HostId,
        last_seen: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError>;
    fn mark_pairing_confirmed(
        &self,
        host_id: &HostId,
        confirmed_at: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError>;
    fn remove(&self, host_id: &HostId) -> Result<(), MobileUsbError>;
}

pub fn commit_pairing_with_secret(
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    mut record: MobileUsbPairedHostRecord,
    client_private_key: &[u8],
) -> Result<MobileUsbPairedHostRecord, MobileUsbError> {
    let key_ref = secrets.save_client_key(&record.host_id, client_private_key)?;
    record.client_key_ref = key_ref.clone();

    if let Err(error) = store.commit_pairing(record.clone()) {
        let cleanup_result = secrets.delete_client_key(&key_ref);
        let cleanup_outcome = if cleanup_result.is_ok() {
            "attempted"
        } else {
            "failed"
        };
        tracing::warn!(
            spec_id = "SPEC-006",
            transport_family = super::observability::MOBILE_USB_TRANSPORT_FAMILY,
            operation = "pair",
            error_code = MobileUsbErrorCode::PairCommitFailed.as_str(),
            host_id = %super::observability::redacted_identifier(Some(record.host_id.as_str())),
            cleanup_outcome,
            "mobile_usb orphan secret cleanup after pair commit failure"
        );
        return Err(error);
    }

    Ok(record)
}

#[derive(Debug, Clone)]
pub struct JsonMobileUsbPairingStore {
    path: PathBuf,
}

impl JsonMobileUsbPairingStore {
    pub fn new(storage_root: impl AsRef<Path>) -> Self {
        Self {
            path: storage_root.as_ref().join("paired_mobile_usb_hosts.json"),
        }
    }

    pub fn from_path(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    fn read_records(&self) -> Result<Vec<MobileUsbPairedHostRecord>, MobileUsbError> {
        let bytes = match std::fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(MobileUsbError::new(
                    MobileUsbErrorCode::PairingStoreCorrupt,
                    format!("failed to read mobile USB pairing store: {error}"),
                ));
            }
        };
        let values = serde_json::from_slice::<Vec<serde_json::Value>>(&bytes).map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::PairingStoreCorrupt,
                format!("failed to parse mobile USB pairing store: {error}"),
            )
        })?;
        let mut records = Vec::with_capacity(values.len());
        for (index, value) in values.into_iter().enumerate() {
            match serde_json::from_value::<MobileUsbPairedHostRecord>(value) {
                Ok(record) => records.push(record),
                Err(error) => tracing::warn!(
                    index,
                    error = %error,
                    "mobile_usb: quarantined invalid paired host record"
                ),
            }
        }
        Ok(records)
    }

    fn write_records(&self, records: &[MobileUsbPairedHostRecord]) -> Result<(), MobileUsbError> {
        crate::helpers::storage::write_json_pretty_atomic(&self.path, &records).map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::PairCommitFailed,
                format!("failed to write mobile USB pairing store: {error}"),
            )
        })
    }
}

impl MobileUsbPairingStore for JsonMobileUsbPairingStore {
    fn list(&self) -> Result<Vec<MobileUsbPairedHostRecord>, MobileUsbError> {
        self.read_records()
    }

    fn get(&self, host_id: &HostId) -> Result<Option<MobileUsbPairedHostRecord>, MobileUsbError> {
        Ok(self
            .read_records()?
            .into_iter()
            .find(|record| &record.host_id == host_id))
    }

    fn commit_pairing(&self, record: MobileUsbPairedHostRecord) -> Result<(), MobileUsbError> {
        let mut records = self.read_records()?;
        if records.iter().any(|existing| {
            existing.host_id == record.host_id || existing.peer_pubkey == record.peer_pubkey
        }) {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairingDuplicate,
                "mobile USB pairing already exists",
            ));
        }
        records.push(record);
        self.write_records(&records)
    }

    fn touch_last_seen(
        &self,
        host_id: &HostId,
        last_seen: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError> {
        let mut records = self.read_records()?;
        let Some(record) = records.iter_mut().find(|record| &record.host_id == host_id) else {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::NotPaired,
                "mobile USB pairing record no longer exists",
            ));
        };
        record.last_seen = Some(last_seen);
        let updated = record.clone();
        self.write_records(&records)?;
        Ok(updated)
    }

    fn mark_pairing_confirmed(
        &self,
        host_id: &HostId,
        confirmed_at: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError> {
        let mut records = self.read_records()?;
        let Some(record) = records.iter_mut().find(|record| &record.host_id == host_id) else {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::NotPaired,
                "mobile USB pairing record no longer exists",
            ));
        };
        record.last_seen = Some(confirmed_at);
        record.pairing_confirmed_at = Some(confirmed_at);
        let updated = record.clone();
        self.write_records(&records)?;
        Ok(updated)
    }

    fn remove(&self, host_id: &HostId) -> Result<(), MobileUsbError> {
        let mut records = self.read_records()?;
        let original_len = records.len();
        records.retain(|record| &record.host_id != host_id);
        if records.len() != original_len {
            self.write_records(&records)?;
        }
        Ok(())
    }
}

pub fn classify_scan_result(
    scan: &MobileUsbScanResult,
    records: &[MobileUsbPairedHostRecord],
    secrets: &dyn MobileUsbSecretStore,
) -> MobileUsbScanClassification {
    let matches: Vec<&MobileUsbPairedHostRecord> = records
        .iter()
        .filter(|record| record.matches_scan_result(scan))
        .collect();

    match matches.as_slice() {
        [] => MobileUsbScanClassification::Unpaired,
        [record] if !record.is_connectable_pairing() => {
            MobileUsbScanClassification::BrokenLocalState {
                host_id: record.host_id.clone(),
            }
        }
        [record] => match secrets.load_client_key(&record.client_key_ref) {
            Ok(_) => MobileUsbScanClassification::Paired {
                host_id: record.host_id.clone(),
            },
            Err(error) => {
                tracing::warn!(
                    spec_id = "SPEC-006",
                    transport_family = super::observability::MOBILE_USB_TRANSPORT_FAMILY,
                    host_id = %super::observability::redacted_identifier(Some(record.host_id.as_str())),
                    key_ref = %super::observability::redacted_identifier(Some(record.client_key_ref.as_str())),
                    error_code = error.code.as_str(),
                    error = %error,
                    "mobile_usb paired host classified as broken_local_state because client key could not be loaded"
                );
                MobileUsbScanClassification::BrokenLocalState {
                    host_id: record.host_id.clone(),
                }
            }
        },
        _ => MobileUsbScanClassification::Ambiguous,
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct InMemoryMobileUsbPairingStore {
    records: std::sync::Mutex<Vec<MobileUsbPairedHostRecord>>,
    fail_commit: std::sync::Mutex<bool>,
}

#[cfg(test)]
impl InMemoryMobileUsbPairingStore {
    pub(crate) fn with_records(records: Vec<MobileUsbPairedHostRecord>) -> Self {
        Self {
            records: std::sync::Mutex::new(records),
            fail_commit: std::sync::Mutex::new(false),
        }
    }

    pub(crate) fn set_fail_commit(&self, fail: bool) {
        *self.fail_commit.lock().expect("fail_commit") = fail;
    }
}

#[cfg(test)]
impl MobileUsbPairingStore for InMemoryMobileUsbPairingStore {
    fn list(&self) -> Result<Vec<MobileUsbPairedHostRecord>, MobileUsbError> {
        Ok(self.records.lock().expect("records").clone())
    }

    fn get(&self, host_id: &HostId) -> Result<Option<MobileUsbPairedHostRecord>, MobileUsbError> {
        Ok(self
            .records
            .lock()
            .expect("records")
            .iter()
            .find(|record| &record.host_id == host_id)
            .cloned())
    }

    fn commit_pairing(&self, record: MobileUsbPairedHostRecord) -> Result<(), MobileUsbError> {
        if *self.fail_commit.lock().expect("fail_commit") {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairCommitFailed,
                "fake commit failure",
            ));
        }
        let mut records = self.records.lock().expect("records");
        if records.iter().any(|existing| {
            existing.host_id == record.host_id || existing.peer_pubkey == record.peer_pubkey
        }) {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairingDuplicate,
                "fake duplicate pairing",
            ));
        }
        records.push(record);
        Ok(())
    }

    fn touch_last_seen(
        &self,
        host_id: &HostId,
        last_seen: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError> {
        if *self.fail_commit.lock().expect("fail_commit") {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairCommitFailed,
                "fake touch failure",
            ));
        }
        let mut records = self.records.lock().expect("records");
        let Some(record) = records.iter_mut().find(|record| &record.host_id == host_id) else {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::NotPaired,
                "fake pairing record missing",
            ));
        };
        record.last_seen = Some(last_seen);
        Ok(record.clone())
    }

    fn mark_pairing_confirmed(
        &self,
        host_id: &HostId,
        confirmed_at: u64,
    ) -> Result<MobileUsbPairedHostRecord, MobileUsbError> {
        if *self.fail_commit.lock().expect("fail_commit") {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairCommitFailed,
                "fake confirm failure",
            ));
        }
        let mut records = self.records.lock().expect("records");
        let Some(record) = records.iter_mut().find(|record| &record.host_id == host_id) else {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::NotPaired,
                "fake pairing record missing",
            ));
        };
        record.last_seen = Some(confirmed_at);
        record.pairing_confirmed_at = Some(confirmed_at);
        Ok(record.clone())
    }

    fn remove(&self, host_id: &HostId) -> Result<(), MobileUsbError> {
        self.records
            .lock()
            .expect("records")
            .retain(|record| &record.host_id != host_id);
        Ok(())
    }
}
