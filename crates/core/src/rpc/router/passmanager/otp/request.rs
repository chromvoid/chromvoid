use serde_json::Value;

use crate::rpc::request_parse::{optional_str, optional_u64};
use crate::rpc::router::otp_sidecar::OtpSetSecretRequest;

use super::super::otp_target::PassmanagerOtpTargetRequest;
use super::error::PassmanagerOtpError;

pub(super) struct PassmanagerOtpSetSecretRequest<'a> {
    pub(super) target: PassmanagerOtpTargetRequest<'a>,
    data: &'a Value,
}

pub(super) struct PassmanagerOtpGenerateRequest<'a> {
    pub(super) node_id: Option<u64>,
    pub(super) target: PassmanagerOtpTargetRequest<'a>,
    pub(super) ts: Option<u64>,
}

pub(super) struct PassmanagerOtpRemoveSecretRequest<'a> {
    pub(super) target: PassmanagerOtpTargetRequest<'a>,
}

pub(super) fn parse_set_secret(
    data: &Value,
) -> Result<PassmanagerOtpSetSecretRequest<'_>, PassmanagerOtpError> {
    Ok(PassmanagerOtpSetSecretRequest {
        target: parse_required_target(data)?,
        data,
    })
}

pub(super) fn parse_generate(data: &Value) -> PassmanagerOtpGenerateRequest<'_> {
    PassmanagerOtpGenerateRequest {
        node_id: optional_u64(data, "node_id"),
        target: parse_optional_target(data),
        ts: optional_u64(data, "ts"),
    }
}

pub(super) fn parse_remove_secret(
    data: &Value,
) -> Result<PassmanagerOtpRemoveSecretRequest<'_>, PassmanagerOtpError> {
    Ok(PassmanagerOtpRemoveSecretRequest {
        target: parse_required_target(data)?,
    })
}

fn parse_required_target(
    data: &Value,
) -> Result<PassmanagerOtpTargetRequest<'_>, PassmanagerOtpError> {
    let target = parse_optional_target(data);
    if target.otp_id.is_none() && target.entry_id.is_none() {
        return Err(PassmanagerOtpError::empty_payload(
            "otp_id or entry_id is required",
        ));
    }

    Ok(target)
}

fn parse_optional_target(data: &Value) -> PassmanagerOtpTargetRequest<'_> {
    PassmanagerOtpTargetRequest {
        otp_id: normalize_non_empty(optional_str(data, "otp_id")),
        entry_id: normalize_non_empty(optional_str(data, "entry_id")),
        fallback_label: optional_str(data, "label"),
    }
}

fn required_str<'a>(data: &'a Value, field: &str) -> Result<&'a str, PassmanagerOtpError> {
    data.get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| PassmanagerOtpError::empty_payload(format!("{field} is required")))
}

fn normalize_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

impl PassmanagerOtpSetSecretRequest<'_> {
    pub(super) fn into_sidecar_request(
        self,
        node_id: u64,
        label: String,
    ) -> Result<OtpSetSecretRequest, PassmanagerOtpError> {
        let secret = required_str(self.data, "secret")?.to_string();
        let algorithm = optional_str(self.data, "algorithm")
            .unwrap_or("SHA1")
            .to_string();
        let digits = optional_u64(self.data, "digits").unwrap_or(6) as u8;
        let period = optional_u64(self.data, "period").unwrap_or(30) as u32;

        Ok(OtpSetSecretRequest {
            node_id,
            label,
            secret,
            algorithm,
            digits,
            period,
        })
    }
}
