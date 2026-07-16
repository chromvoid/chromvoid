use crate::rpc::types::{WalletFeeTier, WalletPreview, WalletTransactionOutput};
use serde_json::Value;

use super::*;

pub(super) struct PreparedTransactionInput {
    pub(super) wallet_id: String,
    pub(super) account_id: String,
    pub(super) network: WalletNetwork,
    pub(super) outputs: Vec<WalletTransactionOutput>,
    pub(super) fee_tier: WalletFeeTier,
    pub(super) canonical_payload: String,
    pub(super) warning_codes: Vec<String>,
    pub(super) provider_snapshot: Option<Value>,
    pub(super) preview: WalletPreview,
    pub(super) materializations: Vec<crate::wallet::WalletProfileAccountMaterialization>,
    pub(super) now: u64,
}

pub(super) fn create_preparation(
    session: &mut VaultSession,
    storage: &Storage,
    input: PreparedTransactionInput,
) -> WalletResult<PreparationRecordV1> {
    let preparation_id = new_preparation_id();
    let payload_secret_id = new_secret_id();
    let payload_secret = SecretBlobV1 {
        secret_id: payload_secret_id.clone(),
        kind: "prepared_payload".to_string(),
        payload_version: 1,
        payload: SecretPayloadV1::PreparedPayload {
            canonical_payload: input.canonical_payload,
        },
    };
    let record = PreparationRecordV1 {
        preparation_id: preparation_id.clone(),
        wallet_id: input.wallet_id,
        account_id: input.account_id,
        network: input.network,
        canonical_intent: PreparedIntentV1 {
            outputs: input.outputs,
            fee_tier: input.fee_tier,
        },
        payload_ref: payload_secret_id.clone(),
        warning_codes: input.warning_codes,
        provider_snapshot: input.provider_snapshot,
        preview: input.preview,
        state: PreparationStateV1::Ready,
        consumed_at: None,
        confirm_attempt_id: None,
        tx_ref: None,
        superseded_at: None,
        superseded_by_tx_ref: None,
        expires_at: input.now.saturating_add(PREPARATION_TTL_MS),
        created_at: input.now,
    };

    let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-prepare");
    materialize_profile_accounts(&mut uow, input.materializations)?;
    write_json(
        &mut uow,
        &secret_path(&payload_secret_id),
        &secret_filename(&payload_secret_id),
        &payload_secret,
        SECRET_MIME,
    )?;
    write_json(
        &mut uow,
        &preparation_path(&preparation_id),
        &format!("{preparation_id}.json"),
        &record,
        JSON_MIME,
    )?;
    commit_wallet_uow(uow, session)?;
    Ok(record)
}

pub(super) fn load_preparation(
    session: &VaultSession,
    storage: &Storage,
    preparation_id: &str,
) -> WalletResult<PreparationRecordV1> {
    store::read_json(session, storage, &preparation_path(preparation_id))?
        .ok_or_else(WalletCommandError::preparation_not_found)
}

pub(super) fn load_preparation_by_tx_ref(
    session: &VaultSession,
    storage: &Storage,
    tx_ref: &str,
) -> WalletResult<PreparationRecordV1> {
    let Some(root) = session.catalog().find_by_path("/.wallet/preparations") else {
        return Err(WalletCommandError::preparation_not_found());
    };
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        let path = format!("{WALLET_ROOT}/preparations/{}", child.name);
        let Some(record) = store::read_json::<PreparationRecordV1>(session, storage, &path)? else {
            continue;
        };
        if record.tx_ref.as_deref() == Some(tx_ref) {
            return Ok(record);
        }
    }
    Err(WalletCommandError::preparation_not_found())
}

pub(super) fn load_confirmable_preparation(
    session: &mut VaultSession,
    storage: &Storage,
    preparation_id: &str,
) -> WalletResult<PreparationRecordV1> {
    let record = load_preparation(session, storage, preparation_id)?;
    if record.state == PreparationStateV1::Ready && record.expires_at <= now_ms() {
        expire_preparation(session, storage, preparation_id, &record)?;
        return Err(WalletCommandError::preparation_expired());
    }
    Ok(record)
}

fn expire_preparation(
    session: &mut VaultSession,
    storage: &Storage,
    preparation_id: &str,
    record: &PreparationRecordV1,
) -> WalletResult<()> {
    let mut uow = begin_wallet_uow(session, storage, "wallet-preparation-expired");
    stage_delete_preparation_paths(
        &mut uow,
        &preparation_path(preparation_id),
        &record.payload_ref,
    )?;
    commit_wallet_uow(uow, session)
}

pub(super) fn stage_complete_preparation(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    record: &PreparationRecordV1,
) -> WalletResult<()> {
    stage_delete_preparation_paths(
        uow,
        &preparation_path(&record.preparation_id),
        &record.payload_ref,
    )
}

pub(super) fn stage_mark_preparation_in_flight(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    record: &PreparationRecordV1,
    tx_ref: &str,
    confirm_attempt_id: &str,
    consumed_at: u64,
) -> WalletResult<PreparationRecordV1> {
    let mut updated = record.clone();
    updated.state = PreparationStateV1::InFlight;
    updated.consumed_at = Some(consumed_at);
    updated.confirm_attempt_id = Some(confirm_attempt_id.to_string());
    updated.tx_ref = Some(tx_ref.to_string());
    write_json(
        uow,
        &preparation_path(&updated.preparation_id),
        &format!("{}.json", updated.preparation_id),
        &updated,
        JSON_MIME,
    )?;
    Ok(updated)
}

pub(super) fn stage_supersede_ready_sibling_preparations(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    session: &VaultSession,
    storage: &Storage,
    record: &PreparationRecordV1,
    tx_ref: &str,
    superseded_at: u64,
) -> WalletResult<usize> {
    let Some(root) = session.catalog().find_by_path("/.wallet/preparations") else {
        return Ok(0);
    };
    let mut count = 0usize;
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        let path = format!("{WALLET_ROOT}/preparations/{}", child.name);
        let Some(mut sibling) = store::read_json::<PreparationRecordV1>(session, storage, &path)?
        else {
            continue;
        };
        if sibling.preparation_id == record.preparation_id
            || sibling.account_id != record.account_id
            || sibling.state != PreparationStateV1::Ready
        {
            continue;
        }
        sibling.state = PreparationStateV1::Superseded;
        sibling.superseded_at = Some(superseded_at);
        sibling.superseded_by_tx_ref = Some(tx_ref.to_string());
        let payload_ref = sibling.payload_ref.clone();
        write_json(
            uow,
            &preparation_path(&sibling.preparation_id),
            &format!("{}.json", sibling.preparation_id),
            &sibling,
            JSON_MIME,
        )?;
        delete_path(uow, &secret_path(&payload_ref))?;
        count += 1;
    }
    Ok(count)
}

pub(super) fn stage_mark_preparation_consumed(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    record: &PreparationRecordV1,
    tx_ref: &str,
    consumed_at: u64,
) -> WalletResult<PreparationRecordV1> {
    let mut updated = record.clone();
    updated.state = PreparationStateV1::Consumed;
    updated.consumed_at = Some(consumed_at);
    updated.tx_ref = Some(tx_ref.to_string());
    write_json(
        uow,
        &preparation_path(&updated.preparation_id),
        &format!("{}.json", updated.preparation_id),
        &updated,
        JSON_MIME,
    )?;
    Ok(updated)
}

fn stage_delete_preparation_paths(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    preparation_path: &str,
    payload_ref: &str,
) -> WalletResult<()> {
    delete_path(uow, preparation_path)?;
    delete_path(uow, &secret_path(payload_ref))?;
    Ok(())
}

pub(super) fn cancel_preparation(
    session: &mut VaultSession,
    storage: &Storage,
    preparation_id: &str,
) -> WalletResult<()> {
    let record = load_preparation(session, storage, preparation_id).ok();
    let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-cancel");
    if let Some(record) = record.as_ref() {
        stage_complete_preparation(&mut uow, record)?;
    } else {
        let _ = delete_path(&mut uow, &preparation_path(preparation_id));
    }
    commit_wallet_uow(uow, session)
}

pub(super) fn cleanup_expired_preparations(
    session: &mut VaultSession,
    storage: &Storage,
) -> WalletResult<usize> {
    let Some(root) = session.catalog().find_by_path("/.wallet/preparations") else {
        return Ok(0);
    };
    let now = now_ms();
    let mut expired = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        let path = format!("{WALLET_ROOT}/preparations/{}", child.name);
        if let Some(record) = store::read_json::<PreparationRecordV1>(session, storage, &path)? {
            if record.state == PreparationStateV1::Ready && record.expires_at <= now {
                expired.push((path, record.payload_ref));
            }
        }
    }
    if !expired.is_empty() {
        let mut uow = begin_wallet_uow(session, storage, "wallet-expired-preparations");
        for (path, payload_ref) in &expired {
            stage_delete_preparation_paths(&mut uow, path, payload_ref)?;
        }
        commit_wallet_uow(uow, session)?;
    }
    Ok(expired.len())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::TempDir;

    use super::*;
    use crate::crypto::keystore::InMemoryKeystore;
    use crate::rpc::types::{RpcRequest, WalletFeeTier, WalletPreview, WalletTransactionOutput};
    use crate::rpc::RpcRouter;
    use crate::storage::Storage;

    fn setup_router() -> (RpcRouter, Storage, TempDir) {
        let temp_dir = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let keystore = Arc::new(InMemoryKeystore::new());
        let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
        let response = router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "pw"}),
        ));
        assert!(response.is_ok(), "{response:?}");
        (router, storage, temp_dir)
    }

    fn fixture_record(
        preparation_id: &str,
        payload_ref: &str,
        expires_at: u64,
    ) -> PreparationRecordV1 {
        PreparationRecordV1 {
            preparation_id: preparation_id.to_string(),
            wallet_id: "wallet-fixture".to_string(),
            account_id: "account-fixture".to_string(),
            network: WalletNetwork::from("bitcoin"),
            canonical_intent: PreparedIntentV1 {
                outputs: vec![WalletTransactionOutput {
                    address: "bc1qrecipient".to_string(),
                    amount: "1000".to_string(),
                    comment: None,
                }],
                fee_tier: WalletFeeTier::Standard,
            },
            payload_ref: payload_ref.to_string(),
            warning_codes: Vec::new(),
            provider_snapshot: None,
            preview: WalletPreview {
                amount_unit: "satoshi".to_string(),
                outputs: Vec::new(),
                estimated_fee: "1".to_string(),
                total_debit: "1001".to_string(),
                warnings: Vec::new(),
                ton: None,
                ethereum: None,
            },
            state: PreparationStateV1::Ready,
            consumed_at: None,
            confirm_attempt_id: None,
            tx_ref: None,
            superseded_at: None,
            superseded_by_tx_ref: None,
            expires_at,
            created_at: 1,
        }
    }

    fn write_fixture(session: &mut VaultSession, storage: &Storage, record: &PreparationRecordV1) {
        let secret = SecretBlobV1 {
            secret_id: record.payload_ref.clone(),
            kind: "prepared_payload".to_string(),
            payload_version: 1,
            payload: SecretPayloadV1::PreparedPayload {
                canonical_payload: "payload".to_string(),
            },
        };
        let mut uow = begin_wallet_uow(session, storage, "wallet-preparation-fixture");
        ensure_wallet_dirs(&mut uow).expect("wallet dirs");
        write_json(
            &mut uow,
            &secret_path(&record.payload_ref),
            &secret_filename(&record.payload_ref),
            &secret,
            SECRET_MIME,
        )
        .expect("secret");
        write_json(
            &mut uow,
            &preparation_path(&record.preparation_id),
            &format!("{}.json", record.preparation_id),
            record,
            JSON_MIME,
        )
        .expect("record");
        commit_wallet_uow(uow, session).expect("commit");
    }

    fn assert_preparation_removed(
        session: &VaultSession,
        storage: &Storage,
        preparation_id: &str,
        payload_ref: &str,
    ) {
        assert!(store::read_json::<PreparationRecordV1>(
            session,
            storage,
            &preparation_path(preparation_id)
        )
        .expect("read preparation")
        .is_none());
        assert!(
            store::read_json::<SecretBlobV1>(session, storage, &secret_path(payload_ref))
                .expect("read secret")
                .is_none()
        );
    }

    #[test]
    fn cleanup_expired_preparations_deletes_record_and_payload() {
        let (mut router, storage, _temp_dir) = setup_router();
        let session = router.session.as_mut().expect("session");
        let record = fixture_record("prep-expired", "payload-expired", 1);
        write_fixture(session, &storage, &record);

        let expired = cleanup_expired_preparations(session, &storage).expect("cleanup");

        assert_eq!(expired, 1);
        assert_preparation_removed(session, &storage, "prep-expired", "payload-expired");
    }

    #[test]
    fn load_confirmable_preparation_expires_ready_record_and_payload() {
        let (mut router, storage, _temp_dir) = setup_router();
        let session = router.session.as_mut().expect("session");
        let record = fixture_record("prep-load-expired", "payload-load-expired", 1);
        write_fixture(session, &storage, &record);

        let response = load_confirmable_preparation(session, &storage, "prep-load-expired")
            .expect_err("expired");
        assert_eq!(response.code(), Some("PREPARATION_EXPIRED"));
        assert_eq!(response.message(), "Preparation expired");
        assert_preparation_removed(
            session,
            &storage,
            "prep-load-expired",
            "payload-load-expired",
        );
    }

    #[test]
    fn cancel_preparation_is_idempotent_and_removes_existing_payload() {
        let (mut router, storage, _temp_dir) = setup_router();
        let session = router.session.as_mut().expect("session");
        cancel_preparation(session, &storage, "missing").expect("missing cancel");

        let record = fixture_record(
            "prep-cancel",
            "payload-cancel",
            now_ms() + PREPARATION_TTL_MS,
        );
        write_fixture(session, &storage, &record);
        cancel_preparation(session, &storage, "prep-cancel").expect("cancel");

        assert_preparation_removed(session, &storage, "prep-cancel", "payload-cancel");
    }

    #[test]
    fn unlock_recovery_cleanup_is_best_effort_path_for_expired_payloads() {
        let (mut router, storage, _temp_dir) = setup_router();
        {
            let session = router.session.as_mut().expect("session");
            let record = fixture_record("prep-unlock", "payload-unlock", 1);
            write_fixture(session, &storage, &record);
        }

        router.recover_wallet_preparations_best_effort();

        let session = router.session.as_ref().expect("session");
        assert_preparation_removed(session, &storage, "prep-unlock", "payload-unlock");
    }
}
