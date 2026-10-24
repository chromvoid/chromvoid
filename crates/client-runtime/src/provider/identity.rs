use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Value;

struct CredentialIdentityCandidate<'a> {
    credential_id: &'a str,
    label: &'a str,
    username: &'a str,
    domain: &'a str,
    otp_options: Vec<CredentialIdentityOtpCandidate<'a>>,
}

struct CredentialIdentityOtpCandidate<'a> {
    otp_id: &'a str,
    label: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialIdentityProjection {
    Password {
        credential_id: String,
        username: String,
        domain: String,
    },
    OneTimeCode {
        label: String,
        domain: String,
        record_identifier: String,
    },
}

const OTP_RECORD_IDENTIFIER_PREFIX: &str = "cv:otp:v1:";
const MAX_RECORD_IDENTIFIER_COMPONENT_BYTES: usize = 512;

fn parse_credential_identity_candidate(
    candidate: &Value,
) -> Option<CredentialIdentityCandidate<'_>> {
    let credential_id = candidate.get("credential_id")?.as_str()?;
    if credential_id.trim().is_empty() {
        return None;
    }

    let domain = candidate
        .get("domain")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|domain| !domain.is_empty())?;

    let username = candidate
        .get("username")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let label = candidate
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .unwrap_or(username);
    let otp_options = candidate
        .get("otp_options")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|option| {
            let otp_id = option.get("id")?.as_str()?.trim();
            let otp_type = option.get("type")?.as_str()?.trim();
            if otp_id.is_empty() || !otp_type.eq_ignore_ascii_case("totp") {
                return None;
            }
            let label = option
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|label| !label.is_empty());
            Some(CredentialIdentityOtpCandidate { otp_id, label })
        })
        .collect();

    Some(CredentialIdentityCandidate {
        credential_id,
        label,
        username,
        domain,
        otp_options,
    })
}

pub fn project_credential_identities(
    candidates: &[Value],
    include_one_time_codes: bool,
) -> Vec<CredentialIdentityProjection> {
    candidates
        .iter()
        .filter_map(parse_credential_identity_candidate)
        .flat_map(|candidate| {
            let mut projections = vec![CredentialIdentityProjection::Password {
                credential_id: candidate.credential_id.to_string(),
                username: candidate.username.to_string(),
                domain: candidate.domain.to_string(),
            }];

            if include_one_time_codes {
                projections.extend(candidate.otp_options.into_iter().filter_map(|otp| {
                    let record_identifier =
                        otp_record_identifier(candidate.credential_id, otp.otp_id)?;
                    Some(CredentialIdentityProjection::OneTimeCode {
                        label: otp_identity_label(
                            candidate.label,
                            candidate.username,
                            candidate.domain,
                            otp.label,
                        ),
                        domain: candidate.domain.to_string(),
                        record_identifier,
                    })
                }));
            }

            projections
        })
        .collect()
}

fn otp_record_identifier(credential_id: &str, otp_id: &str) -> Option<String> {
    let credential_id = credential_id.trim();
    let otp_id = otp_id.trim();
    if credential_id.is_empty()
        || otp_id.is_empty()
        || credential_id.len() > MAX_RECORD_IDENTIFIER_COMPONENT_BYTES
        || otp_id.len() > MAX_RECORD_IDENTIFIER_COMPONENT_BYTES
    {
        return None;
    }

    Some(format!(
        "{OTP_RECORD_IDENTIFIER_PREFIX}{}:{}",
        URL_SAFE_NO_PAD.encode(credential_id.as_bytes()),
        URL_SAFE_NO_PAD.encode(otp_id.as_bytes())
    ))
}

fn otp_identity_label(
    entry_label: &str,
    username: &str,
    domain: &str,
    otp_label: Option<&str>,
) -> String {
    let entry_label = [entry_label, username, domain]
        .into_iter()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or(domain);
    match otp_label.map(str::trim).filter(|label| !label.is_empty()) {
        Some(otp_label) if otp_label != entry_label => format!("{entry_label} — {otp_label}"),
        _ => entry_label.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_missing_or_blank_credential_id() {
        assert!(
            parse_credential_identity_candidate(&json!({
                "domain": "example.com"
            }))
            .is_none()
        );
        assert!(
            parse_credential_identity_candidate(&json!({
                "credential_id": "",
                "domain": "example.com"
            }))
            .is_none()
        );
        assert!(
            parse_credential_identity_candidate(&json!({
                "credential_id": "   ",
                "domain": "example.com"
            }))
            .is_none()
        );
    }

    #[test]
    fn rejects_missing_or_blank_domain() {
        assert!(
            parse_credential_identity_candidate(&json!({
                "credential_id": "cred-1"
            }))
            .is_none()
        );
        assert!(
            parse_credential_identity_candidate(&json!({
                "credential_id": "cred-1",
                "domain": ""
            }))
            .is_none()
        );
        assert!(
            parse_credential_identity_candidate(&json!({
                "credential_id": "cred-1",
                "domain": "   "
            }))
            .is_none()
        );
    }

    #[test]
    fn parses_valid_candidate_and_trims_domain() {
        let value = json!({
            "credential_id": "cred-1",
            "username": "alice@example.com",
            "domain": " example.com "
        });
        let candidate = parse_credential_identity_candidate(&value).expect("valid candidate");

        assert_eq!(candidate.credential_id, "cred-1");
        assert_eq!(candidate.label, "alice@example.com");
        assert_eq!(candidate.username, "alice@example.com");
        assert_eq!(candidate.domain, "example.com");
    }

    #[test]
    fn defaults_missing_username_to_empty_string() {
        let value = json!({
            "credential_id": "cred-1",
            "domain": "example.com"
        });
        let candidate = parse_credential_identity_candidate(&value).expect("valid candidate");

        assert_eq!(candidate.username, "");
    }

    #[test]
    fn projects_password_and_only_totp_identities_without_secret_material() {
        let projections = project_credential_identities(
            &[json!({
                "credential_id": "cred:1",
                "label": "Example",
                "username": "alice@example.com",
                "domain": "example.com",
                "otp_options": [
                    {"id": "totp/1", "label": "Work", "type": "TOTP"},
                    {"id": "hotp-1", "label": "Counter", "type": "HOTP"}
                ]
            })],
            true,
        );

        assert_eq!(projections.len(), 2);
        assert_eq!(
            projections[1],
            CredentialIdentityProjection::OneTimeCode {
                label: "Example — Work".to_string(),
                domain: "example.com".to_string(),
                record_identifier: "cv:otp:v1:Y3JlZDox:dG90cC8x".to_string(),
            }
        );
        let serialized = format!("{projections:?}");
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("123456"));
    }

    #[test]
    fn omits_otp_projection_when_rollout_or_api_is_unavailable() {
        let projections = project_credential_identities(
            &[json!({
                "credential_id": "cred-1",
                "label": "Example",
                "domain": "example.com",
                "otp_options": [{"id": "totp-1", "type": "TOTP"}]
            })],
            false,
        );

        assert_eq!(projections.len(), 1);
        assert!(matches!(
            projections[0],
            CredentialIdentityProjection::Password { .. }
        ));
    }

    #[test]
    fn rejects_empty_or_oversized_otp_record_identifier_parts() {
        assert!(otp_record_identifier("", "otp-1").is_none());
        assert!(otp_record_identifier("cred-1", " ").is_none());
        assert!(
            otp_record_identifier(
                &"x".repeat(MAX_RECORD_IDENTIFIER_COMPONENT_BYTES + 1),
                "otp-1"
            )
            .is_none()
        );
    }
}
