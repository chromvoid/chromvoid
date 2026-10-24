//! Shared Apple provider contracts. Platform listeners, Keychain access and Core
//! admission remain with their runtime owners; these helpers grant no authority.
mod identity;
mod request;
mod response;

pub use identity::{CredentialIdentityProjection, project_credential_identities};
pub use request::AppleProviderRequest;
pub use response::{in_memory_response_envelope, response_envelope, secret_ref_for_request};

pub fn command_allowed(command: &str) -> bool {
    matches!(
        command.trim(),
        "credential_provider:status"
            | "credential_provider:session:open"
            | "credential_provider:session:close"
            | "credential_provider:list"
            | "credential_provider:search"
            | "credential_provider:getSecret"
            | "credential_provider:getOneTimeCode"
            | "credential_provider:recordUse"
            | "credential_provider:passkey:create"
            | "credential_provider:passkey:get"
            | "credential_provider:passkey:query"
    )
}

pub fn command_requires_local_core(command: &str) -> bool {
    !matches!(
        command.trim(),
        "credential_provider:status"
            | "credential_provider:session:open"
            | "credential_provider:session:close"
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn provider_bridge_command_allowlist_rejects_non_provider_commands() {
        assert!(super::command_allowed("credential_provider:list"));
        assert!(super::command_allowed("credential_provider:passkey:get"));
        assert!(super::command_allowed("credential_provider:getOneTimeCode"));
        assert!(!super::command_allowed("vault:unlock"));
        assert!(!super::command_allowed("catalog:list"));
        assert!(!super::command_allowed("passmanager:list"));
    }

    #[test]
    fn provider_bridge_policy_keeps_status_and_session_commands_off_the_local_core() {
        for command in [
            "credential_provider:status",
            "credential_provider:session:open",
            "credential_provider:session:close",
        ] {
            assert!(!super::command_requires_local_core(command));
        }

        for command in [
            "credential_provider:list",
            "credential_provider:search",
            "credential_provider:getSecret",
            "credential_provider:getOneTimeCode",
            "credential_provider:recordUse",
            "credential_provider:passkey:create",
            "credential_provider:passkey:get",
            "credential_provider:passkey:query",
        ] {
            assert!(super::command_requires_local_core(command));
        }
    }
}
