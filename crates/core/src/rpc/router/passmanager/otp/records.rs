//! Entry-scoped OTP settings and metadata share one durable domain transaction.
use super::super::{
    entry::{load_entry_meta_required, resolve_entry_node_id, stage_entry_meta_json},
    error::PassmanagerCommandError as Error,
    path::now_unix_ms,
};
use crate::{
    error::ErrorCode,
    rpc::{
        router::{
            domain_uow::DomainUnitOfWork,
            otp_sidecar::{
                generate_otp_with_timing, load_otp_secrets_checked, validate_otp_secret,
                OtpGenerateRequest, OtpSetSecretRequest, OtpSidecarError,
            },
        },
        types::{
            CredentialOtpSummary, OtpPreviewResponse, OtpSecret, OtpSecrets,
            PassmanagerOtpRecordRequest, PassmanagerOtpRecordSaveRequest,
            PassmanagerOtpRecordsRequest, PassmanagerOtpRecordsResponse,
        },
    },
    storage::Storage,
    vault::VaultSession,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn parse<T: DeserializeOwned>(data: &Value) -> Result<T, Error> {
    serde_json::from_value(data.clone()).map_err(|_| Error::empty_payload("Invalid OTP request"))
}
fn sidecar_error(error: OtpSidecarError) -> Error {
    let (message, code) = error.into_parts();
    Error::new(message, Some(code))
}
struct Snapshot {
    node: u64,
    meta: Value,
    secrets: OtpSecrets,
    revision: String,
}
fn load(session: &VaultSession, storage: &Storage, id: &str) -> Result<Snapshot, Error> {
    let node = resolve_entry_node_id(session, storage, id)
        .ok_or_else(|| Error::node_not_found("Entry not found"))?;
    let meta = load_entry_meta_required(session, storage, node)?;
    let object = meta
        .as_object()
        .ok_or_else(|| Error::internal("Invalid entry metadata"))?;
    if object
        .get("entry_type")
        .or_else(|| object.get("entryType"))
        .and_then(Value::as_str)
        == Some("payment_card")
    {
        return Err(Error::access_denied(
            "Payment cards do not have OTP records",
        ));
    }
    let secrets =
        load_otp_secrets_checked(session.vault_key(), node, storage).map_err(sidecar_error)?;
    let labels: std::collections::HashSet<_> = secrets.secrets.iter().map(|s| &s.label).collect();
    if labels.len() != secrets.secrets.len() {
        return Err(Error::internal("Duplicate OTP labels"));
    }
    let bytes = zeroize::Zeroizing::new(
        serde_json::to_vec(&(&meta, &secrets))
            .map_err(|_| Error::internal("Invalid OTP settings"))?,
    );
    let revision = blake3::keyed_hash(session.vault_key(), &bytes)
        .to_hex()
        .to_string();
    Ok(Snapshot {
        node,
        meta,
        secrets,
        revision,
    })
}
fn check_revision(snapshot: &Snapshot, revision: &str) -> Result<(), Error> {
    if snapshot.revision != revision {
        return Err(Error::new(
            "OTP settings changed; reload before editing",
            Some(ErrorCode::SyncConflict),
        ));
    }
    Ok(())
}
pub(super) fn summary(secret: &OtpSecret) -> CredentialOtpSummary {
    CredentialOtpSummary {
        label: secret.label.clone(),
        encoding: secret.encoding.clone(),
        algorithm: secret.algorithm.clone(),
        otp_type: secret.otp_type.clone(),
        digits: secret.digits,
        period: secret.period,
        counter: secret.counter.map(|v| v.to_string()),
    }
}
pub(in crate::rpc::router::passmanager) fn list(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<PassmanagerOtpRecordsResponse, Error> {
    let request: PassmanagerOtpRecordsRequest = parse(data)?;
    let snapshot = load(session, storage, &request.entry_id)?;
    let response = PassmanagerOtpRecordsResponse {
        revision: snapshot.revision,
        records: snapshot.secrets.secrets.iter().map(summary).collect(),
    };
    if serde_json::to_vec(&response)
        .map_err(|_| Error::internal("Invalid OTP response"))?
        .len()
        > 512 * 1024
    {
        return Err(Error::internal("OTP metadata exceeds capacity"));
    }
    Ok(response)
}
pub(in crate::rpc::router::passmanager) fn code(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<OtpPreviewResponse, Error> {
    let request: PassmanagerOtpRecordRequest = parse(data)?;
    let snapshot = load(session, storage, &request.entry_id)?;
    check_revision(&snapshot, &request.revision)?;
    if !snapshot
        .secrets
        .secrets
        .iter()
        .any(|s| s.label == request.label)
    {
        return Err(Error::node_not_found("OTP record not found"));
    }
    generate_otp_with_timing(
        session,
        storage,
        OtpGenerateRequest {
            node_id: snapshot.node,
            label: Some(&request.label),
            ts: None,
            counter: None,
        },
    )
    .map_err(sidecar_error)
}
pub(in crate::rpc::router::passmanager) fn save(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), Error> {
    let request: PassmanagerOtpRecordSaveRequest = parse(data)?;
    let mut snapshot = load(session, storage, &request.entry_id)?;
    check_revision(&snapshot, &request.revision)?;
    let source = request
        .source_label
        .as_ref()
        .map(|label| {
            snapshot
                .secrets
                .secrets
                .iter()
                .position(|s| s.label == *label)
                .ok_or_else(|| Error::node_not_found("OTP record not found"))
        })
        .transpose()?;
    let label = request.settings.label.trim();
    if label.is_empty() || label.contains('\0') {
        return Err(Error::empty_payload("OTP label is required"));
    }
    if snapshot
        .secrets
        .secrets
        .iter()
        .enumerate()
        .any(|(index, s)| Some(index) != source && s.label == label)
    {
        return Err(Error::new(
            "OTP label already exists",
            Some(ErrorCode::NameExist),
        ));
    }
    let seed = request
        .secret
        .or_else(|| source.map(|index| snapshot.secrets.secrets[index].secret.clone()))
        .ok_or_else(|| Error::empty_payload("OTP secret is required"))?;
    let counter = request
        .settings
        .counter
        .map(|value| {
            value
                .parse::<u64>()
                .map_err(|_| Error::empty_payload("Invalid OTP counter"))
        })
        .transpose()?;
    let validated = validate_otp_secret(OtpSetSecretRequest {
        node_id: snapshot.node,
        label: label.to_string(),
        secret: seed,
        encoding: request.settings.encoding,
        algorithm: request.settings.algorithm,
        otp_type: request.settings.otp_type,
        digits: request.settings.digits,
        period: request.settings.period,
        counter,
    })
    .map_err(sidecar_error)?;
    let only_secret = snapshot.secrets.secrets.len() == 1;
    update_metadata(
        &mut snapshot.meta,
        request.source_label.as_deref(),
        Some(&validated),
        only_secret,
    )?;
    if let Some(index) = source {
        snapshot.secrets.secrets[index] = validated;
    } else {
        snapshot.secrets.secrets.push(validated);
    }
    stage(session, uow, snapshot)
}
pub(in crate::rpc::router::passmanager) fn delete(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), Error> {
    let request: PassmanagerOtpRecordRequest = parse(data)?;
    let mut snapshot = load(session, storage, &request.entry_id)?;
    check_revision(&snapshot, &request.revision)?;
    let index = snapshot
        .secrets
        .secrets
        .iter()
        .position(|s| s.label == request.label)
        .ok_or_else(|| Error::node_not_found("OTP record not found"))?;
    let only_secret = snapshot.secrets.secrets.len() == 1;
    update_metadata(&mut snapshot.meta, Some(&request.label), None, only_secret)?;
    snapshot.secrets.secrets.remove(index);
    stage(session, uow, snapshot)
}
fn stage(
    session: &VaultSession,
    uow: &mut DomainUnitOfWork<'_>,
    snapshot: Snapshot,
) -> Result<(), Error> {
    let name = crate::crypto::otp_chunk_name(session.vault_key(), snapshot.node);
    let bytes = zeroize::Zeroizing::new(
        serde_json::to_vec(&snapshot.secrets)
            .map_err(|_| Error::internal("Invalid OTP settings"))?,
    );
    let encrypted = crate::crypto::encrypt(&bytes, session.vault_key(), name.as_bytes())
        .map_err(|_| Error::internal("Could not encrypt OTP settings"))?;
    uow.stage_encrypted_chunk(name, encrypted)
        .map_err(|e| Error::from_domain_uow_error(e, "Could not stage OTP settings"))?;
    stage_entry_meta_json(uow, snapshot.node, &snapshot.meta)
}
fn update_metadata(
    meta: &mut Value,
    source: Option<&str>,
    replacement: Option<&OtpSecret>,
    only_secret: bool,
) -> Result<(), Error> {
    let object = meta
        .as_object_mut()
        .ok_or_else(|| Error::internal("Invalid entry metadata"))?;
    let value = ["otps", "otp_options", "otpOptions"]
        .iter()
        .find_map(|key| object.get(*key))
        .cloned();
    let mut records = match value {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items,
        Some(value @ Value::Object(_)) => vec![value],
        _ => return Err(Error::internal("Invalid OTP metadata")),
    };
    let matches = |record: &Value| {
        source.is_some_and(|source| {
            ["label", "name", "id", "otp_id", "otpId"]
                .iter()
                .any(|key| record.get(*key).and_then(Value::as_str) == Some(source))
        })
    };
    let index = records
        .iter()
        .position(matches)
        .or_else(|| (source.is_some() && only_secret && records.len() == 1).then_some(0));
    if let Some(secret) = replacement {
        let mut record = index
            .map(|index| records[index].clone())
            .unwrap_or_else(|| json!({}));
        let fields = record
            .as_object_mut()
            .ok_or_else(|| Error::internal("Invalid OTP metadata"))?;
        if !["id", "otp_id", "otpId"]
            .iter()
            .any(|key| fields.get(*key).and_then(Value::as_str).is_some())
        {
            let mut id = [0u8; 16];
            getrandom::getrandom(&mut id)
                .map_err(|_| Error::internal("Could not create OTP identity"))?;
            fields.insert(
                "id".into(),
                Value::String(id.iter().map(|byte| format!("{byte:02x}")).collect()),
            );
        }
        fields.insert("label".into(), json!(secret.label));
        fields.insert("type".into(), json!(secret.otp_type));
        fields.insert("algorithm".into(), json!(secret.algorithm));
        fields.insert("digits".into(), json!(secret.digits));
        fields.insert("period".into(), json!(secret.period));
        fields.insert("counter".into(), json!(secret.counter));
        if let Some(index) = index {
            records[index] = record;
        } else {
            records.push(record);
        }
    } else if let Some(index) = index {
        records.remove(index);
    }
    object.remove("otp_options");
    object.remove("otpOptions");
    object.insert("otps".into(), Value::Array(records));
    object.insert("updatedTs".into(), json!(now_unix_ms()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        crypto::keystore::InMemoryKeystore,
        rpc::{types::RpcRequest, RpcRouter},
    };
    use std::sync::Arc;

    #[test]
    fn corrupt_sidecar_is_rejected_without_replacing_it() {
        let directory = tempfile::tempdir().unwrap();
        let storage = Storage::new(directory.path()).unwrap();
        let mut router =
            RpcRouter::new(storage.clone()).with_keystore(Arc::new(InMemoryKeystore::new()));
        assert!(router
            .handle(&RpcRequest::new("vault:unlock", json!({"password":"pw"})))
            .is_ok());
        assert!(router
            .handle(&RpcRequest::new(
                "passmanager:entry:save",
                json!({"entry_id":"test","title":"OTP"})
            ))
            .is_ok());
        let before = router.handle(&RpcRequest::new(
            "passmanager:otp:record:list",
            json!({"entry_id":"test"}),
        ));
        let session = router.session.as_ref().unwrap();
        let node = resolve_entry_node_id(session, &storage, "test").unwrap();
        let name = crate::crypto::otp_chunk_name(session.vault_key(), node);
        storage.write_chunk(&name, b"corrupt").unwrap();
        let request = json!({"entry_id":"test", "revision":before.result().unwrap()["revision"], "secret":"JBSWY3DPEHPK3PXP",
          "settings":{"label":"Main","algorithm":"SHA1","encoding":"base32","otp_type":"TOTP","digits":6,"period":30}});
        assert!(!router
            .handle(&RpcRequest::new("passmanager:otp:record:save", request))
            .is_ok());
        assert_eq!(storage.read_chunk(&name).unwrap(), b"corrupt");
        assert!(!router
            .handle(&RpcRequest::new(
                "passmanager:otp:record:list",
                json!({"entry_id":"test"})
            ))
            .is_ok());
    }
}
