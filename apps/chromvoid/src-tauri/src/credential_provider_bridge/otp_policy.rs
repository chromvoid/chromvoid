const OTP_AUTOFILL_ROLLOUT_ENV: &str = "CHROMVOID_MACOS_OTP_AUTOFILL_ENABLED";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct OtpAutofillPolicyError {
    pub(super) code: String,
    pub(super) message: String,
}

pub(super) fn ensure_otp_autofill_enabled() -> Result<(), OtpAutofillPolicyError> {
    if !cfg!(target_os = "macos") {
        return Err(OtpAutofillPolicyError {
            code: "FEATURE_UNSUPPORTED_ON_PLATFORM".to_string(),
            message: "One-time-code AutoFill requires macOS 15 or newer".to_string(),
        });
    }

    if otp_autofill_rollout_enabled_from_value(std::env::var(OTP_AUTOFILL_ROLLOUT_ENV).ok()) {
        return Ok(());
    }

    Err(OtpAutofillPolicyError {
        code: "FEATURE_DISABLED_BY_ROLLOUT".to_string(),
        message: "One-time-code AutoFill is disabled by rollout policy".to_string(),
    })
}

pub(super) fn otp_autofill_rollout_enabled() -> bool {
    cfg!(target_os = "macos")
        && otp_autofill_rollout_enabled_from_value(std::env::var(OTP_AUTOFILL_ROLLOUT_ENV).ok())
}

pub(super) fn otp_autofill_platform_version_major() -> u64 {
    #[cfg(target_os = "macos")]
    {
        return objc2_foundation::NSProcessInfo::processInfo()
            .operatingSystemVersion()
            .majorVersion as u64;
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}

fn otp_autofill_rollout_enabled_from_value(value: Option<String>) -> bool {
    value
        .map(|value| value != "0" && !value.eq_ignore_ascii_case("false"))
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::otp_autofill_rollout_enabled_from_value;

    #[test]
    fn otp_autofill_rollout_defaults_on_and_accepts_explicit_disable_values() {
        assert!(otp_autofill_rollout_enabled_from_value(None));
        assert!(otp_autofill_rollout_enabled_from_value(Some(
            "true".to_string()
        )));
        assert!(otp_autofill_rollout_enabled_from_value(Some(
            "1".to_string()
        )));
        assert!(!otp_autofill_rollout_enabled_from_value(Some(
            "false".to_string()
        )));
        assert!(!otp_autofill_rollout_enabled_from_value(Some(
            "0".to_string()
        )));
    }
}
