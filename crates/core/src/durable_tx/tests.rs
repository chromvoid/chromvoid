use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tempfile::TempDir;

use super::*;
use crate::error::{Error, Result};
use crate::storage::{Storage, StorageArtifact};
use crate::types::KEY_SIZE;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Payload {
    value: String,
}

#[derive(Clone, Copy)]
struct Participant;

impl DurableTxParticipant for Participant {
    const KIND: &'static str = "test";
    const VERSION: u8 = 1;
    type Payload = Payload;

    fn marker_context(&self) -> &'static [u8] {
        b"durable-tx-test"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }
}

fn write_raw_chunk_record<P, TPayload>(
    storage: &Storage,
    key: &[u8; KEY_SIZE],
    store: &DurableTxStore<'_, P>,
    record: &DurableTxRecord<TPayload>,
) where
    P: DurableTxParticipant,
    TPayload: Serialize,
{
    let marker_name = store.marker_name();
    let plaintext = serde_json::to_vec(record).expect("serialize raw record");
    let encrypted =
        crate::crypto::encrypt(&plaintext, key, marker_name.as_bytes()).expect("encrypt marker");
    storage
        .write_chunk_atomic(&marker_name, &encrypted)
        .expect("write raw marker");
}

fn write_raw_artifact_record<TPayload>(storage: &Storage, record: &DurableTxRecord<TPayload>)
where
    TPayload: Serialize,
{
    let bytes = serde_json::to_vec(record).expect("serialize raw record");
    storage
        .write_artifact_atomic(StorageArtifact::RestoreTransaction, &bytes)
        .expect("write raw artifact");
}

#[test]
fn durable_tx_record_roundtrips_and_updates_phase() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [7u8; KEY_SIZE];
    let store = DurableTxStore::new(&storage, &key, Participant);
    let payload = Payload {
        value: "one".to_string(),
    };

    store
        .write_record("tx-1", DurableTxPhase::Staging, &payload)
        .expect("write staging");
    let record = store
        .read_record::<Payload>()
        .expect("read")
        .expect("record");
    assert_eq!(record.phase, DurableTxPhase::Staging);
    assert_eq!(record.payload, payload);

    store
        .write_phase(&record, DurableTxPhase::Committing)
        .expect("write committing");
    let record = store
        .read_record::<Payload>()
        .expect("read")
        .expect("record");
    assert_eq!(record.phase, DurableTxPhase::Committing);
    assert_eq!(record.payload.value, "one");
}

#[test]
fn durable_tx_wrong_marker_context_does_not_decode() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [9u8; KEY_SIZE];
    let store = DurableTxStore::new(&storage, &key, Participant);
    let marker_name = store.marker_name();
    let encrypted = crate::crypto::encrypt(b"{}", &key, b"wrong-context").expect("encrypt marker");
    storage
        .write_chunk_atomic(&marker_name, &encrypted)
        .expect("write");

    assert!(store.read_record::<Payload>().expect("read").is_none());
    assert!(store.exists().expect("exists"));
}

#[test]
fn durable_tx_chunk_rejects_mismatched_record_identity_without_deleting_marker() {
    let cases = [
        ("wrong kind", Participant::VERSION, "other", "tx-1"),
        (
            "wrong version",
            Participant::VERSION + 1,
            Participant::KIND,
            "tx-1",
        ),
        ("empty tx id", Participant::VERSION, Participant::KIND, ""),
    ];

    for (name, version, kind, tx_id) in cases {
        let temp = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp.path()).expect("storage");
        let key = [4u8; KEY_SIZE];
        let store = DurableTxStore::new(&storage, &key, Participant);
        let record = DurableTxRecord {
            version,
            kind: kind.to_string(),
            tx_id: tx_id.to_string(),
            phase: DurableTxPhase::Staging,
            payload: Payload {
                value: name.to_string(),
            },
        };

        write_raw_chunk_record(&storage, &key, &store, &record);
        store.recover_participant().expect("recover");

        assert!(
            store.read_record::<Payload>().expect("read").is_none(),
            "{name}"
        );
        assert!(store.exists().expect("exists"), "{name}");
    }
}

#[test]
fn durable_tx_artifact_record_roundtrips() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let store =
        DurableTxArtifactStore::new(&storage, StorageArtifact::RestoreTransaction, Participant);
    let payload = Payload {
        value: "artifact".to_string(),
    };

    store.write_staging("artifact-1", &payload).expect("write");
    let record = store
        .read_record::<Payload>()
        .expect("read")
        .expect("record");

    assert_eq!(record.phase, DurableTxPhase::Staging);
    assert_eq!(record.payload, payload);
    assert!(store.exists().expect("exists"));
    store.delete().expect("delete");
    assert!(!store.exists().expect("exists after delete"));
}

#[test]
fn durable_tx_artifact_rejects_mismatched_record_identity_without_deleting_marker() {
    let cases = [
        ("wrong kind", Participant::VERSION, "other", "tx-1"),
        (
            "wrong version",
            Participant::VERSION + 1,
            Participant::KIND,
            "tx-1",
        ),
        ("empty tx id", Participant::VERSION, Participant::KIND, ""),
    ];

    for (name, version, kind, tx_id) in cases {
        let temp = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp.path()).expect("storage");
        let store =
            DurableTxArtifactStore::new(&storage, StorageArtifact::RestoreTransaction, Participant);
        let record = DurableTxRecord {
            version,
            kind: kind.to_string(),
            tx_id: tx_id.to_string(),
            phase: DurableTxPhase::Staging,
            payload: Payload {
                value: name.to_string(),
            },
        };

        write_raw_artifact_record(&storage, &record);
        store.recover_participant().expect("recover");

        assert!(
            store.read_record::<Payload>().expect("read").is_none(),
            "{name}"
        );
        assert!(store.exists().expect("exists"), "{name}");
    }
}

#[derive(Clone)]
struct RecordingParticipant {
    events: Arc<Mutex<Vec<&'static str>>>,
}

impl DurableTxParticipant for RecordingParticipant {
    const KIND: &'static str = "recording";
    const VERSION: u8 = 1;
    type Payload = Payload;

    fn marker_context(&self) -> &'static [u8] {
        b"recording-durable-tx-test"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.value != "invalid"
    }

    fn rollback_staging(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("rollback");
        Ok(())
    }

    fn recover_committing(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("recover");
        Ok(())
    }

    fn cleanup(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("cleanup");
        Ok(())
    }
}

#[test]
fn durable_tx_runner_rolls_back_staging_then_cleans_up() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [2u8; KEY_SIZE];
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxStore::new(
        &storage,
        &key,
        RecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "staged".to_string(),
    };

    store.write_staging("staged-1", &payload).expect("write");
    store.recover_participant().expect("recover");

    assert_eq!(*events.lock().expect("events"), vec!["rollback", "cleanup"]);
    assert!(!store.exists().expect("exists"));
}

#[test]
fn durable_tx_runner_recovers_committing_then_cleans_up() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxArtifactStore::new(
        &storage,
        StorageArtifact::RestoreTransaction,
        RecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "committing".to_string(),
    };

    store
        .write_committing("committing-1", &payload)
        .expect("write");
    store.recover_participant().expect("recover");

    assert_eq!(*events.lock().expect("events"), vec!["recover", "cleanup"]);
    assert!(!store.exists().expect("exists"));
}

#[test]
fn durable_tx_invalid_participant_payload_does_not_run_hooks_or_delete_marker() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [3u8; KEY_SIZE];
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxStore::new(
        &storage,
        &key,
        RecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "invalid".to_string(),
    };

    store.write_staging("invalid-1", &payload).expect("write");
    store.recover_participant().expect("recover");

    assert!(events.lock().expect("events").is_empty());
    assert!(store.exists().expect("exists"));
}

#[derive(Clone, Copy)]
enum FailureMode {
    Rollback,
    Recover,
    Cleanup,
}

#[derive(Clone)]
struct FaultingParticipant {
    events: Arc<Mutex<Vec<&'static str>>>,
    mode: FailureMode,
}

impl DurableTxParticipant for FaultingParticipant {
    const KIND: &'static str = "faulting";
    const VERSION: u8 = 1;
    type Payload = Payload;

    fn marker_context(&self) -> &'static [u8] {
        b"faulting-durable-tx-test"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn rollback_staging(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("rollback");
        if matches!(self.mode, FailureMode::Rollback) {
            Err(Error::InvalidDataFormat("rollback failed".to_string()))
        } else {
            Ok(())
        }
    }

    fn recover_committing(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("recover");
        if matches!(self.mode, FailureMode::Recover) {
            Err(Error::InvalidDataFormat("recover failed".to_string()))
        } else {
            Ok(())
        }
    }

    fn cleanup(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events.lock().expect("events").push("cleanup");
        if matches!(self.mode, FailureMode::Cleanup) {
            Err(Error::InvalidDataFormat("cleanup failed".to_string()))
        } else {
            Ok(())
        }
    }
}

#[test]
fn durable_tx_phase_action_failure_keeps_marker_for_retry() {
    let cases = [
        (
            DurableTxPhase::Staging,
            FailureMode::Rollback,
            vec!["rollback"],
        ),
        (
            DurableTxPhase::Committing,
            FailureMode::Recover,
            vec!["recover"],
        ),
    ];

    for (phase, mode, expected_events) in cases {
        let temp = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp.path()).expect("storage");
        let key = [6u8; KEY_SIZE];
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = DurableTxStore::new(
            &storage,
            &key,
            FaultingParticipant {
                events: Arc::clone(&events),
                mode,
            },
        );
        let payload = Payload {
            value: "retry".to_string(),
        };

        store
            .write_record("retry-1", phase, &payload)
            .expect("write");
        let result = store.recover_participant();

        assert!(result.is_err());
        assert_eq!(*events.lock().expect("events"), expected_events);
        assert!(store.exists().expect("exists"));
    }
}

#[test]
fn durable_tx_cleanup_failure_keeps_marker_for_retry() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxArtifactStore::new(
        &storage,
        StorageArtifact::RestoreTransaction,
        FaultingParticipant {
            events: Arc::clone(&events),
            mode: FailureMode::Cleanup,
        },
    );
    let payload = Payload {
        value: "cleanup".to_string(),
    };

    store
        .write_committing("cleanup-1", &payload)
        .expect("write");
    let result = store.recover_participant();

    assert!(result.is_err());
    assert_eq!(*events.lock().expect("events"), vec!["recover", "cleanup"]);
    assert!(store.exists().expect("exists"));
}

#[derive(Clone)]
struct KeyRecordingParticipant {
    events: Arc<Mutex<Vec<String>>>,
}

impl DurableTxParticipant for KeyRecordingParticipant {
    const KIND: &'static str = "key_recording";
    const VERSION: u8 = 1;
    type Payload = Payload;

    fn marker_context(&self) -> &'static [u8] {
        b"key-recording-durable-tx-test"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn recover_committing(
        &self,
        _storage: &Storage,
        vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events
            .lock()
            .expect("events")
            .push(format_vault_key_event("recover", vault_key));
        Ok(())
    }

    fn cleanup(
        &self,
        _storage: &Storage,
        vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events
            .lock()
            .expect("events")
            .push(format_vault_key_event("cleanup", vault_key));
        Ok(())
    }
}

fn format_vault_key_event(label: &str, vault_key: Option<&[u8; KEY_SIZE]>) -> String {
    match vault_key {
        Some(vault_key) => format!("{label}:key:{}", vault_key[0]),
        None => format!("{label}:none"),
    }
}

#[test]
fn durable_tx_chunk_non_encrypted_recovery_passes_vault_key() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [8u8; KEY_SIZE];
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxStore::new(
        &storage,
        &key,
        KeyRecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "key".to_string(),
    };

    store.write_committing("key-1", &payload).expect("write");
    store.recover_participant().expect("recover");

    assert_eq!(
        *events.lock().expect("events"),
        vec!["recover:key:8".to_string(), "cleanup:key:8".to_string()]
    );
}

#[test]
fn durable_tx_artifact_non_encrypted_recovery_passes_no_vault_key() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxArtifactStore::new(
        &storage,
        StorageArtifact::RestoreTransaction,
        KeyRecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "key".to_string(),
    };

    store.write_committing("key-1", &payload).expect("write");
    store.recover_participant().expect("recover");

    assert_eq!(
        *events.lock().expect("events"),
        vec!["recover:none".to_string(), "cleanup:none".to_string()]
    );
}

#[derive(Clone)]
struct EncryptedRecordingParticipant {
    events: Arc<Mutex<Vec<String>>>,
}

impl DurableTxParticipant for EncryptedRecordingParticipant {
    const KIND: &'static str = "encrypted_recording";
    const VERSION: u8 = 1;
    type Payload = Payload;

    fn marker_context(&self) -> &'static [u8] {
        b"encrypted-recording-durable-tx-test"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }
}

impl DurableTxEncryptedParticipant for EncryptedRecordingParticipant {
    fn rollback_staging_encrypted(
        &self,
        _storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events
            .lock()
            .expect("events")
            .push(format!("rollback:{}", vault_key[0]));
        Ok(())
    }

    fn recover_committing_encrypted(
        &self,
        _storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events
            .lock()
            .expect("events")
            .push(format!("recover:{}", vault_key[0]));
        Ok(())
    }

    fn cleanup_encrypted(
        &self,
        _storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        self.events
            .lock()
            .expect("events")
            .push(format!("cleanup:{}", vault_key[0]));
        Ok(())
    }
}

#[test]
fn durable_tx_encrypted_runner_passes_required_vault_key() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    let key = [5u8; KEY_SIZE];
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxStore::new(
        &storage,
        &key,
        EncryptedRecordingParticipant {
            events: Arc::clone(&events),
        },
    );
    let payload = Payload {
        value: "encrypted".to_string(),
    };

    store
        .write_committing("encrypted-1", &payload)
        .expect("write");
    store.recover_encrypted_participant().expect("recover");

    assert_eq!(
        *events.lock().expect("events"),
        vec!["recover:5".to_string(), "cleanup:5".to_string()]
    );
    assert!(!store.exists().expect("exists"));
}

#[test]
fn durable_tx_corrupt_artifact_marker_is_not_deleted() {
    let temp = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp.path()).expect("storage");
    storage
        .write_artifact_atomic(StorageArtifact::RestoreTransaction, b"not json")
        .expect("write corrupt");
    let events = Arc::new(Mutex::new(Vec::new()));
    let store = DurableTxArtifactStore::new(
        &storage,
        StorageArtifact::RestoreTransaction,
        RecordingParticipant { events },
    );

    store.recover_participant().expect("recover");

    assert!(store.exists().expect("exists"));
}
