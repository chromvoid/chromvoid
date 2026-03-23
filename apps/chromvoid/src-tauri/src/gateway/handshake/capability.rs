use super::super::state::GatewayState;
use super::super::types::*;

/// Check capability grants for a command. Returns `Ok(())` if allowed,
/// `Err(reason)` if the command should be denied.
pub(in crate::gateway) fn check_capability(
    state: &mut GatewayState,
    extension_id: &str,
    command: &str,
    grant_id: Option<&str>,
    origin: Option<&str>,
    node_id: Option<u64>,
) -> Result<(), String> {
    let category = classify_command(command);
    let policy = state.get_or_create_policy(extension_id);

    // 1. Check allowed commands
    match &policy.allowed_commands {
        AllowedCommands::All => {}
        AllowedCommands::ReadOnly => {
            if category != CommandCategory::ReadOnly {
                return Err(format!(
                    "command '{}' not allowed by read-only policy",
                    command
                ));
            }
        }
        AllowedCommands::Custom { commands } => {
            if !commands.iter().any(|c| c == command) {
                return Err(format!("command '{}' not in allowlist", command));
            }
        }
    }

    // 2. For sensitive commands: check action grant if required
    if category == CommandCategory::Sensitive && policy.require_action_grant {
        let Some(gid) = grant_id else {
            return Err("action grant required for sensitive command".to_string());
        };
        let store = state.grant_store_mut(extension_id);
        if !store.consume_action_grant(gid, command, node_id) {
            return Err("invalid or expired action grant".to_string());
        }
    }

    // 3. For sensitive commands with origin: check site grant if required
    if category == CommandCategory::Sensitive && policy.require_site_grant {
        let Some(orig) = origin else {
            return Err("origin required for sensitive command".to_string());
        };

        // Check site allowlist first (if non-empty, origin must be in it)
        if !policy.site_allowlist.is_empty() && !policy.site_allowlist.iter().any(|s| s == orig) {
            return Err(format!("origin '{}' not in site allowlist", orig));
        }

        let store = state.grant_store_mut(extension_id);
        if !store.has_site_grant(orig) {
            return Err(format!("no site grant for origin '{}'", orig));
        }
    }

    Ok(())
}
