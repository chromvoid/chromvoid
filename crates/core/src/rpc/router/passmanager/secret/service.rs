use crate::vault::VaultSession;

use super::super::super::domain_uow::DomainUnitOfWork;
use super::super::entry::{
    entry_meta_object_mut, load_entry_meta_required, read_entry_meta_json, resolve_entry_node_id,
    stage_entry_meta_json,
};
use super::super::error::PassmanagerCommandError;
use super::super::path::is_passmanager_path;
use super::policy::{
    entry_type_from_meta, is_secret_compatible, normalize_secret_value, secret_filename,
};
use super::store::{read_secret_value, stage_delete_secret, stage_secret_value};
use super::types::{SecretReadResult, SecretSaveRequest, SecretTargetRequest};

pub(super) fn save_secret(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: SecretSaveRequest,
) -> Result<(), PassmanagerCommandError> {
    let entry_node_id = resolve_entry_node_id(s, storage, &request.entry_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;
    let meta = load_entry_meta_required(s, storage, entry_node_id)?;
    let entry_type = entry_type_from_meta(&meta);
    if !is_secret_compatible(entry_type, &request.secret_type) {
        return Err(PassmanagerCommandError::empty_payload(
            "secret_type is incompatible with entry_type",
        ));
    }
    let secret_name = secret_filename(&request.secret_type)
        .ok_or_else(|| PassmanagerCommandError::empty_payload("Unsupported secret type"))?;
    let normalized_value = normalize_secret_value(&request.secret_type, &request.value)?;

    let entry_path = s
        .catalog()
        .get_path(entry_node_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;
    if !is_passmanager_path(&entry_path) {
        return Err(PassmanagerCommandError::access_denied("Access denied"));
    }
    stage_secret_value(uow, &entry_path, &secret_name, &normalized_value)?;

    if request.secret_type == "card_pan" {
        let last4 = normalized_value
            .chars()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<String>();
        stage_payment_card_last4(s, storage, uow, entry_node_id, Some(&last4))?;
    }

    Ok(())
}

pub(super) fn read_secret(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    request: SecretTargetRequest,
) -> Result<SecretReadResult, PassmanagerCommandError> {
    let entry_node_id = resolve_entry_node_id(s, storage, &request.entry_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;
    let meta = load_entry_meta_required(s, storage, entry_node_id)?;
    let entry_type = entry_type_from_meta(&meta);
    if !is_secret_compatible(entry_type, &request.secret_type) {
        return Err(PassmanagerCommandError::empty_payload(
            "secret_type is incompatible with entry_type",
        ));
    }
    let value = read_secret_value(s, storage, entry_node_id, &request.secret_type)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Secret not found"))?;

    Ok(SecretReadResult::new(value))
}

pub(super) fn delete_secret(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: SecretTargetRequest,
) -> Result<(), PassmanagerCommandError> {
    let entry_node_id = resolve_entry_node_id(s, storage, &request.entry_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;
    let meta = load_entry_meta_required(s, storage, entry_node_id)?;
    let entry_type = entry_type_from_meta(&meta);
    if !is_secret_compatible(entry_type, &request.secret_type) {
        return Err(PassmanagerCommandError::empty_payload(
            "secret_type is incompatible with entry_type",
        ));
    }
    let secret_name = secret_filename(&request.secret_type)
        .ok_or_else(|| PassmanagerCommandError::empty_payload("Unsupported secret type"))?;
    stage_delete_secret(s, uow, entry_node_id, &secret_name)?;

    if request.secret_type == "card_pan" {
        stage_payment_card_last4(s, storage, uow, entry_node_id, None)?;
    }

    Ok(())
}

fn stage_payment_card_last4(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    entry_node_id: u64,
    last4: Option<&str>,
) -> Result<(), PassmanagerCommandError> {
    let mut meta = read_entry_meta_json(session, storage, entry_node_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry metadata not found"))?;
    let meta_obj = entry_meta_object_mut(&mut meta)?;

    let payment_card_value = meta_obj
        .remove("payment_card")
        .or_else(|| meta_obj.remove("paymentCard"));
    let Some(mut payment_card) = payment_card_value else {
        return Err(PassmanagerCommandError::empty_payload(
            "payment_card metadata is required",
        ));
    };
    let Some(payment_card_obj) = payment_card.as_object_mut() else {
        return Err(PassmanagerCommandError::empty_payload(
            "payment_card must be an object",
        ));
    };
    if let Some(value) = last4 {
        payment_card_obj.insert(
            "last4".to_string(),
            serde_json::Value::String(value.to_string()),
        );
    } else {
        payment_card_obj.remove("last4");
    }
    meta_obj.insert("payment_card".to_string(), payment_card);

    stage_entry_meta_json(uow, entry_node_id, &meta)
}
