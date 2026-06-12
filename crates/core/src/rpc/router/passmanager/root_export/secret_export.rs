use super::super::super::otp_sidecar::load_otp_secrets;
use super::super::secret;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::{Map, Value};

pub(super) fn attach_entry_secrets(
    meta_obj: &mut Map<String, Value>,
    session: &VaultSession,
    storage: &Storage,
    node_id: u64,
    entry_type: &str,
) {
    if entry_type == "payment_card" {
        if let Some(card_pan) = secret::read_secret_value(session, storage, node_id, "card_pan") {
            meta_obj.insert("card_pan".to_string(), Value::String(card_pan));
        }
        if let Some(card_cvv) = secret::read_secret_value(session, storage, node_id, "card_cvv") {
            meta_obj.insert("card_cvv".to_string(), Value::String(card_cvv));
        }
        if let Some(note) = secret::read_secret_value(session, storage, node_id, "note") {
            meta_obj.insert("note".to_string(), Value::String(note));
        }
        meta_obj.remove("username");
        meta_obj.remove("urls");
        meta_obj.remove("otps");
        meta_obj.remove("sshKeys");
        return;
    }

    if let Some(password) = secret::read_secret_value(session, storage, node_id, "password") {
        meta_obj.insert("password".to_string(), Value::String(password));
    }
    if let Some(note) = secret::read_secret_value(session, storage, node_id, "note") {
        meta_obj.insert("note".to_string(), Value::String(note));
    }
    let vault_key = session.vault_key();
    if let Some(otp_secrets) = load_otp_secrets(vault_key, node_id, storage) {
        if let Some(otps) = meta_obj.get_mut("otps").and_then(|v| v.as_array_mut()) {
            let fallback_secret = if otps.len() == 1 && otp_secrets.secrets.len() == 1 {
                otp_secrets.secrets.first()
            } else {
                None
            };
            for otp in otps.iter_mut() {
                let Some(otp_obj) = otp.as_object_mut() else {
                    continue;
                };
                let otp_label = otp_obj.get("label").and_then(|v| v.as_str());
                if let Some(secret) = otp_label
                    .and_then(|label| {
                        otp_secrets
                            .secrets
                            .iter()
                            .find(|candidate| candidate.label == label)
                    })
                    .or(fallback_secret)
                {
                    otp_obj.insert("secret".to_string(), Value::String(secret.secret.clone()));
                    otp_obj.insert(
                        "algorithm".to_string(),
                        Value::String(secret.algorithm.clone()),
                    );
                    otp_obj.insert("digits".to_string(), Value::Number(secret.digits.into()));
                    otp_obj.insert("period".to_string(), Value::Number(secret.period.into()));
                }
            }
        }
    }
}
