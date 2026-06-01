use serde_json::Value;

pub(super) struct CredentialIdentityCandidate<'a> {
    pub(super) credential_id: &'a str,
    pub(super) username: &'a str,
    pub(super) domain: &'a str,
}

pub(super) fn parse_credential_identity_candidate(
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

    Some(CredentialIdentityCandidate {
        credential_id,
        username,
        domain,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_missing_or_blank_credential_id() {
        assert!(parse_credential_identity_candidate(&json!({
            "domain": "example.com"
        }))
        .is_none());
        assert!(parse_credential_identity_candidate(&json!({
            "credential_id": "",
            "domain": "example.com"
        }))
        .is_none());
        assert!(parse_credential_identity_candidate(&json!({
            "credential_id": "   ",
            "domain": "example.com"
        }))
        .is_none());
    }

    #[test]
    fn rejects_missing_or_blank_domain() {
        assert!(parse_credential_identity_candidate(&json!({
            "credential_id": "cred-1"
        }))
        .is_none());
        assert!(parse_credential_identity_candidate(&json!({
            "credential_id": "cred-1",
            "domain": ""
        }))
        .is_none());
        assert!(parse_credential_identity_candidate(&json!({
            "credential_id": "cred-1",
            "domain": "   "
        }))
        .is_none());
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
}
