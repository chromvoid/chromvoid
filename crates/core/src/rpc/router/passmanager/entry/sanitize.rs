//! Wire-format sanitization, type/payment-card normalization, and group-path sync.

use super::super::super::domain_uow::DomainUnitOfWork;
use super::super::error::PassmanagerCommandError;
use super::super::path::group_path_from_entry_path;
use super::io::{entry_meta_object_mut, load_entry_meta_required, stage_entry_meta_json};
use super::tags::normalize_entry_tags;
use crate::vault::VaultSession;

pub(in crate::rpc::router::passmanager::entry) fn normalize_entry_type(
    data: &serde_json::Value,
) -> Result<&str, PassmanagerCommandError> {
    match data
        .get("entry_type")
        .or_else(|| data.get("entryType"))
        .and_then(|v| v.as_str())
        .unwrap_or("login")
    {
        "login" => Ok("login"),
        "payment_card" => Ok("payment_card"),
        _ => Err(PassmanagerCommandError::empty_payload(
            "entry_type must be login or payment_card",
        )),
    }
}

pub(in crate::rpc::router::passmanager) fn normalized_payment_card_meta(
    data: &serde_json::Value,
) -> Result<Option<serde_json::Value>, PassmanagerCommandError> {
    let Some(payment_card) = data.get("payment_card").or_else(|| data.get("paymentCard")) else {
        return Ok(None);
    };
    let Some(card_obj) = payment_card.as_object() else {
        return Err(PassmanagerCommandError::empty_payload(
            "payment_card must be an object",
        ));
    };
    let Some(cardholder_name) = card_obj
        .get("cardholder_name")
        .or_else(|| card_obj.get("cardholderName"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    else {
        return Err(PassmanagerCommandError::empty_payload(
            "payment_card.cardholder_name is required",
        ));
    };
    let exp_month = card_obj
        .get("exp_month")
        .or_else(|| card_obj.get("expMonth"))
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            PassmanagerCommandError::empty_payload("payment_card.exp_month is required")
        })?;
    let exp_year = card_obj
        .get("exp_year")
        .or_else(|| card_obj.get("expYear"))
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            PassmanagerCommandError::empty_payload("payment_card.exp_year is required")
        })?;
    let brand = card_obj
        .get("brand")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("unknown");
    let last4 = card_obj
        .get("last4")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if let Some(last4) = last4 {
        if last4.len() != 4 || !last4.bytes().all(|b| b.is_ascii_digit()) {
            return Err(PassmanagerCommandError::empty_payload(
                "payment_card.last4 must contain exactly 4 digits",
            ));
        }
    }

    let mut out = serde_json::Map::new();
    out.insert(
        "cardholder_name".to_string(),
        serde_json::Value::String(cardholder_name.to_string()),
    );
    out.insert(
        "exp_month".to_string(),
        serde_json::Value::Number(exp_month.into()),
    );
    out.insert(
        "exp_year".to_string(),
        serde_json::Value::Number(exp_year.into()),
    );
    out.insert(
        "brand".to_string(),
        serde_json::Value::String(brand.to_string()),
    );
    if let Some(last4) = last4 {
        out.insert(
            "last4".to_string(),
            serde_json::Value::String(last4.to_string()),
        );
    }
    Ok(Some(serde_json::Value::Object(out)))
}

pub(in crate::rpc::router::passmanager) fn sanitize_entry_meta_for_wire(
    meta: &mut serde_json::Map<String, serde_json::Value>,
) {
    let entry_type = meta
        .get("entry_type")
        .or_else(|| meta.get("entryType"))
        .and_then(|v| v.as_str())
        .unwrap_or("login")
        .to_string();
    meta.insert(
        "entry_type".to_string(),
        serde_json::Value::String(entry_type.clone()),
    );
    meta.insert(
        "entryType".to_string(),
        serde_json::Value::String(entry_type.clone()),
    );

    if let Some(group_path) = meta
        .remove("group_path")
        .or_else(|| meta.remove("groupPath"))
    {
        meta.insert("group_path".to_string(), group_path.clone());
        meta.insert("groupPath".to_string(), group_path);
    }
    if let Some(icon_ref) = meta.remove("icon_ref").or_else(|| meta.remove("iconRef")) {
        meta.insert("icon_ref".to_string(), icon_ref.clone());
        meta.insert("iconRef".to_string(), icon_ref);
    }
    if let Some(payment_card) = meta
        .remove("payment_card")
        .or_else(|| meta.remove("paymentCard"))
    {
        meta.insert("payment_card".to_string(), payment_card.clone());
        meta.insert("paymentCard".to_string(), payment_card);
    }
    normalize_entry_tags(meta);

    if entry_type == "payment_card" {
        meta.remove("username");
        meta.remove("urls");
        meta.remove("otps");
        meta.remove("sshKeys");
        meta.remove("sshKeyType");
        meta.remove("sshKeyFingerprint");
        meta.remove("sshKeyComment");
    } else {
        meta.remove("payment_card");
        meta.remove("paymentCard");
    }
}

pub(in crate::rpc::router::passmanager::entry) fn set_wire_group_path(
    meta: &mut serde_json::Map<String, serde_json::Value>,
    current_group_path: &str,
) {
    let group_path = serde_json::Value::String(current_group_path.to_string());
    meta.remove("group_path");
    meta.remove("groupPath");
    meta.insert("group_path".to_string(), group_path.clone());
    meta.insert("groupPath".to_string(), group_path);
}

pub(in crate::rpc::router::passmanager::entry) fn sync_entry_group_path_meta_uow(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    entry_node_id: u64,
) -> Result<(), PassmanagerCommandError> {
    let current_group_path = uow
        .catalog()
        .get_path(entry_node_id)
        .map(|path| group_path_from_entry_path(&path))
        .unwrap_or_else(|| "/".to_string());

    let mut meta = load_entry_meta_required(session, storage, entry_node_id)?;
    let meta_obj = entry_meta_object_mut(&mut meta)?;

    set_wire_group_path(meta_obj, &current_group_path);
    sanitize_entry_meta_for_wire(meta_obj);

    stage_entry_meta_json(uow, entry_node_id, &meta)
}
