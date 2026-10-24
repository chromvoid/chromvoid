//! Strict metadata editing; secrets continue through their existing atomic command owner.
use super::super::super::{
    credential_types::PassmanagerCredentialMeta, domain_uow::DomainUnitOfWork,
};
use super::super::{
    error::PassmanagerCommandError as Error,
    path::{group_path_from_entry_path, map_entry_group_path_to_passmanager_path, now_unix_ms},
};
use super::{
    io::{load_entry_meta_required, stage_entry_meta_json},
    request::{parse_entry_id_request, parse_entry_save_request},
    resolver::resolve_entry_node_id,
    sanitize::{normalized_payment_card_meta, set_wire_group_path},
};
use crate::{
    error::ErrorCode,
    rpc::types::{CredentialDetail, PassmanagerEntrySaveResponse, PassmanagerEntryUpdateRequest},
    storage::Storage,
    vault::VaultSession,
};
use serde_json::{json, Value};

pub(super) fn load(
    s: &VaultSession,
    storage: &Storage,
    id: &str,
) -> Result<(u64, Value, String), Error> {
    let node = resolve_entry_node_id(s, storage, id)
        .ok_or_else(|| Error::node_not_found("Entry not found"))?;
    let meta = load_entry_meta_required(s, storage, node)?;
    if !meta.is_object() {
        return Err(Error::internal("Invalid entry metadata"));
    }
    let path = s
        .catalog()
        .get_path(node)
        .ok_or_else(|| Error::node_not_found("Entry not found"))?;
    Ok((node, meta, path))
}

pub(super) fn revision(meta: &Value, path: &str) -> Result<String, Error> {
    let bytes =
        serde_json::to_vec(&(meta, path)).map_err(|_| Error::internal("Invalid metadata"))?;
    Ok(blake3::hash(&bytes).to_hex().to_string())
}

fn websites_editable(meta: &Value) -> bool {
    // An editor for plain websites must never flatten imported matching rules or aliases.
    meta.get("url_rules").is_none()
        && meta.get("urlRules").is_none()
        && match meta.get("urls") {
            None | Some(Value::Null) => true,
            Some(Value::Array(values)) => values.iter().all(Value::is_string),
            _ => false,
        }
}

pub(in crate::rpc::router::passmanager) fn read(
    s: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<CredentialDetail, Error> {
    let id = parse_entry_id_request(data)?.entry_id;
    let (_, meta, path) = load(s, storage, &id)?;
    let bytes = serde_json::to_vec(&meta).map_err(|_| Error::internal("Invalid metadata"))?;
    let decoded = PassmanagerCredentialMeta::decode(&bytes, &id, "")
        .map_err(|_| Error::internal("Invalid metadata"))?;
    let entry_type = meta
        .get("entry_type")
        .or_else(|| meta.get("entryType"))
        .and_then(Value::as_str)
        .unwrap_or("login")
        .to_string();
    let payment_card = if entry_type == "payment_card" {
        normalized_payment_card_meta(&meta)?
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| Error::internal("Invalid card metadata"))?
    } else {
        None
    };
    let tags = meta
        .get("tags")
        .map(super::normalize_credential_tags)
        .unwrap_or_default();
    let result = CredentialDetail {
        id,
        title: meta
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        username: meta
            .get("username")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        entry_type,
        group_path: group_path_from_entry_path(&path),
        websites: decoded
            .url_rules
            .into_iter()
            .map(|rule| rule.value)
            .collect(),
        websites_editable: websites_editable(&meta),
        tag_keys: tags
            .iter()
            .map(|label| super::credential_tag_key(label))
            .collect(),
        tags,
        payment_card,
        revision: revision(&meta, &path)?,
    };
    if serde_json::to_vec(&result)
        .map_err(|_| Error::internal("Invalid detail"))?
        .len()
        > 512 * 1024
    {
        return Err(Error::internal("Credential detail exceeds capacity"));
    }
    Ok(result)
}

pub(in crate::rpc::router::passmanager) fn update(
    s: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<PassmanagerEntrySaveResponse, Error> {
    let mut request: PassmanagerEntryUpdateRequest = serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid update request"))?;
    let (node, mut meta, path) = load(s, storage, &request.entry_id)?;
    if revision(&meta, &path)? != request.revision {
        return Err(Error::new(
            "Entry changed; reload before editing",
            Some(ErrorCode::SyncConflict),
        ));
    }
    let is_card = meta
        .get("entry_type")
        .or_else(|| meta.get("entryType"))
        .and_then(Value::as_str)
        == Some("payment_card");
    if (is_card && (request.username.is_some() || request.websites.is_some()))
        || (!is_card
            && (request.cardholder_name.is_some()
                || request.exp_month.is_some()
                || request.exp_year.is_some()))
    {
        return Err(Error::empty_payload(
            "Fields are incompatible with entry type",
        ));
    }
    if request.websites.is_some() && !websites_editable(&meta) {
        return Err(Error::empty_payload(
            "Advanced website rules require a rule editor",
        ));
    }
    let selected_tags = request
        .tag_keys
        .as_ref()
        .map(|keys| super::super::tags::resolve_selected_keys(s, storage, keys))
        .transpose()?;
    let target = if let Some(group) = &request.group_path {
        map_entry_group_path_to_passmanager_path(Some(group))
            .ok_or_else(|| Error::access_denied("Access denied"))?
    } else {
        path.rsplit_once('/')
            .map(|(parent, _)| parent.to_string())
            .ok_or_else(|| Error::internal("Invalid entry path"))?
    };
    // A card's name cleared in the editor goes back to the one Core gives it.
    if is_card
        && request
            .title
            .as_deref()
            .is_some_and(|title| title.trim().is_empty())
    {
        let card = meta
            .get("payment_card")
            .or_else(|| meta.get("paymentCard"))
            .and_then(Value::as_object)
            .ok_or_else(|| Error::empty_payload("Card metadata missing"))?;
        let title = super::card_brand::default_card_title(uow, &target, card, Some(node))
            .ok_or_else(|| Error::empty_payload("title is required"))?;
        request.title = Some(title);
    }
    let mut merged = meta.clone();
    if let Some(value) = &request.title {
        merged["title"] = json!(value);
    }
    if let Some(value) = &request.username {
        merged["username"] = json!(value);
    }
    if let Some(value) = &request.websites {
        merged["urls"] = json!(value);
    }
    let card_changed = request.cardholder_name.is_some()
        || request.exp_month.is_some()
        || request.exp_year.is_some();
    if card_changed {
        let mut card = merged
            .get("payment_card")
            .or_else(|| merged.get("paymentCard"))
            .cloned()
            .ok_or_else(|| Error::empty_payload("Card metadata missing"))?;
        if !card.is_object() {
            return Err(Error::empty_payload("Invalid card metadata"));
        }
        if let Some(value) = &request.cardholder_name {
            card["cardholder_name"] = json!(value);
        }
        if let Some(value) = request.exp_month {
            card["exp_month"] = json!(value);
        }
        if let Some(value) = request.exp_year {
            card["exp_year"] = json!(value);
        }
        merged["payment_card"] = card;
    }
    // Reuse existing title/type/card validation. Only explicitly patched fields are written.
    let validated = parse_entry_save_request(&merged)?;
    let parent = path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    if target != parent {
        uow.ensure_dir(&target)
            .map_err(|e| Error::from_domain_uow_error(e, "Failed to create group"))?;
        if request.title.is_some() {
            uow.stage_move_and_rename_node(node, &target, &validated.title)
                .map_err(|e| Error::from_domain_uow_error(e, "Failed to move entry"))?;
        } else {
            uow.stage_move_node(node, &target)
                .map_err(|e| Error::from_domain_uow_error(e, "Failed to move entry"))?;
        }
    }
    if request.title.is_some() {
        if target == parent {
            uow.stage_rename_node(node, &validated.title)
                .map_err(|e| Error::from_domain_uow_error(e, "Failed to rename entry"))?;
        }
        meta["title"] = json!(validated.title);
    }
    if request.username.is_some() {
        meta["username"] = merged["username"].clone();
    }
    if request.websites.is_some() {
        meta["urls"] = merged["urls"].clone();
    }
    if card_changed {
        let mut card = merged["payment_card"].clone();
        let normalized = validated
            .payment_card
            .ok_or_else(|| Error::empty_payload("Card metadata missing"))?;
        merge_card_fields(&mut card, &normalized)?;
        let obj = meta
            .as_object_mut()
            .ok_or_else(|| Error::internal("Invalid metadata"))?;
        obj.remove("paymentCard");
        obj.insert("payment_card".into(), card);
    }
    let group_path = group_path_from_entry_path(
        &uow.catalog()
            .get_path(node)
            .ok_or_else(|| Error::internal("Entry path missing"))?,
    );
    let obj = meta
        .as_object_mut()
        .ok_or_else(|| Error::internal("Invalid metadata"))?;
    if let Some(tags) = selected_tags {
        if tags.is_empty() {
            obj.remove("tags");
        } else {
            obj.insert("tags".into(), json!(tags));
        }
    }
    set_wire_group_path(obj, &group_path);
    obj.remove("updated_ts");
    obj.insert("updatedTs".into(), json!(now_unix_ms()));
    stage_entry_meta_json(uow, node, &meta)?;
    Ok(PassmanagerEntrySaveResponse::new(request.entry_id))
}

// Keep extension metadata, but remove stale aliases that existing clients read first.
fn merge_card_fields(card: &mut Value, normalized: &Value) -> Result<(), Error> {
    let object = card
        .as_object_mut()
        .ok_or_else(|| Error::empty_payload("Invalid card metadata"))?;
    for (canonical, alias) in [
        ("cardholder_name", "cardholderName"),
        ("exp_month", "expMonth"),
        ("exp_year", "expYear"),
    ] {
        object.remove(alias);
        object.insert(canonical.into(), normalized[canonical].clone());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn card_edits_remove_stale_aliases_but_preserve_extensions_and_last4() {
        let mut card = json!({"cardholderName":"Old", "expMonth":1, "expYear":2025,
            "last4":"1111", "brand":"visa", "extension":{"color":"blue"}});
        merge_card_fields(
            &mut card,
            &json!({"cardholder_name":"New", "exp_month":12, "exp_year":2035}),
        )
        .unwrap();
        assert_eq!(
            card,
            json!({"cardholder_name":"New", "exp_month":12, "exp_year":2035,
            "last4":"1111", "brand":"visa", "extension":{"color":"blue"}})
        );
    }
}
