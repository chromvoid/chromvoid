use serde_json::Value;

use super::error::{VaultOpsError, VaultOpsResult};

pub(super) struct VaultUnlockRequest<'a> {
    pub(super) password: &'a str,
}

impl<'a> VaultUnlockRequest<'a> {
    pub(super) fn parse(data: &'a Value) -> VaultOpsResult<Self> {
        Ok(Self {
            password: required_str(data, "password")?,
        })
    }
}

pub(super) struct VaultRekeyRpcRequest<'a> {
    pub(super) current_password: &'a str,
    pub(super) new_password: &'a str,
}

impl<'a> VaultRekeyRpcRequest<'a> {
    pub(super) fn parse(data: &'a Value) -> VaultOpsResult<Self> {
        Ok(Self {
            current_password: required_str(data, "current_password")?,
            new_password: required_str(data, "new_password")?,
        })
    }
}

pub(super) struct MasterSetupRequest<'a> {
    pub(super) master_password: &'a str,
}

impl<'a> MasterSetupRequest<'a> {
    pub(super) fn parse(data: &'a Value) -> VaultOpsResult<Self> {
        Ok(Self {
            master_password: required_str(data, "master_password")?,
        })
    }
}

pub(super) struct EraseExecuteRequest<'a> {
    pub(super) erase_token: &'a str,
    pub(super) master_password: &'a str,
}

impl<'a> EraseExecuteRequest<'a> {
    pub(super) fn parse(data: &'a Value) -> VaultOpsResult<Self> {
        Ok(Self {
            erase_token: required_str(data, "erase_token")?,
            master_password: required_str(data, "master_password")?,
        })
    }
}

pub(super) struct AdminEraseRequest<'a> {
    pub(super) master_password: &'a str,
    pub(super) confirm: bool,
}

impl<'a> AdminEraseRequest<'a> {
    pub(super) fn parse(data: &'a Value) -> VaultOpsResult<Self> {
        Ok(Self {
            master_password: required_str(data, "master_password")?,
            confirm: data
                .get("confirm")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        })
    }
}

fn required_str<'a>(data: &'a Value, field: &str) -> VaultOpsResult<&'a str> {
    data.get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| VaultOpsError::empty_payload(field))
}
