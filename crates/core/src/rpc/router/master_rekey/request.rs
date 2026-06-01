use serde_json::Value;

use super::error::{MasterRekeyError, MasterRekeyResult};

pub(in crate::rpc::router::master_rekey) struct MasterRekeyRequest<'a> {
    pub(in crate::rpc::router::master_rekey) current_password: &'a str,
    pub(in crate::rpc::router::master_rekey) new_master_password: &'a str,
}

pub(in crate::rpc::router::master_rekey) fn parse_master_rekey_request(
    data: &Value,
) -> MasterRekeyResult<MasterRekeyRequest<'_>> {
    let current_password = read_password_field(
        data,
        "current_password",
        &["current_master_password", "currentMasterPassword"],
    )
    .ok_or_else(|| MasterRekeyError::empty_payload("current_password"))?;
    let new_master_password = read_password_field(
        data,
        "new_master_password",
        &["new_password", "newMasterPassword"],
    )
    .ok_or_else(|| MasterRekeyError::empty_payload("new_master_password"))?;

    Ok(MasterRekeyRequest {
        current_password,
        new_master_password,
    })
}

fn read_password_field<'a>(data: &'a Value, primary: &str, aliases: &[&str]) -> Option<&'a str> {
    data.get(primary)
        .and_then(|value| value.as_str())
        .or_else(|| {
            aliases
                .iter()
                .find_map(|alias| data.get(*alias).and_then(|value| value.as_str()))
        })
}
