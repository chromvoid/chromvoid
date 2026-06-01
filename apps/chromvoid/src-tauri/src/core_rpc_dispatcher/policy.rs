#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CoreRpcPriority {
    PrivacyCritical,
    UserBlocking,
    LowPriority,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CoreRpcCommandPolicy<'a> {
    pub(crate) command: &'a str,
    pub(crate) priority: CoreRpcPriority,
    pub(crate) cancels_low_priority: bool,
    pub(crate) requires_split_handler: bool,
}

pub(crate) fn command_policy(command: &str) -> CoreRpcCommandPolicy<'_> {
    match command {
        "vault:lock" => CoreRpcCommandPolicy {
            command,
            priority: CoreRpcPriority::PrivacyCritical,
            cancels_low_priority: true,
            requires_split_handler: false,
        },
        "vault:rekey" | "master:rekey" => CoreRpcCommandPolicy {
            command,
            priority: CoreRpcPriority::UserBlocking,
            cancels_low_priority: true,
            requires_split_handler: false,
        },
        "wallet:transaction:confirm" | "wallet:backup:export" => CoreRpcCommandPolicy {
            command,
            priority: CoreRpcPriority::PrivacyCritical,
            cancels_low_priority: false,
            requires_split_handler: false,
        },
        "catalog:media:inspect" => CoreRpcCommandPolicy {
            command,
            priority: CoreRpcPriority::LowPriority,
            cancels_low_priority: false,
            requires_split_handler: true,
        },
        _ => CoreRpcCommandPolicy {
            command,
            priority: CoreRpcPriority::UserBlocking,
            cancels_low_priority: false,
            requires_split_handler: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_commands_default_to_user_blocking() {
        let policy = command_policy("future:command");

        assert_eq!(policy.priority, CoreRpcPriority::UserBlocking);
        assert!(!policy.cancels_low_priority);
        assert!(!policy.requires_split_handler);
    }

    #[test]
    fn vault_lock_is_privacy_critical_and_cancels_low_priority() {
        let policy = command_policy("vault:lock");

        assert_eq!(policy.priority, CoreRpcPriority::PrivacyCritical);
        assert!(policy.cancels_low_priority);
        assert!(!policy.requires_split_handler);
    }

    #[test]
    fn vault_rekey_is_user_blocking_and_cancels_low_priority() {
        let policy = command_policy("vault:rekey");

        assert_eq!(policy.priority, CoreRpcPriority::UserBlocking);
        assert!(policy.cancels_low_priority);
        assert!(!policy.requires_split_handler);
    }

    #[test]
    fn master_rekey_is_user_blocking_and_cancels_low_priority() {
        let policy = command_policy("master:rekey");

        assert_eq!(policy.priority, CoreRpcPriority::UserBlocking);
        assert!(policy.cancels_low_priority);
        assert!(!policy.requires_split_handler);
    }

    #[test]
    fn media_inspect_is_low_priority_split_only() {
        let policy = command_policy("catalog:media:inspect");

        assert_eq!(policy.priority, CoreRpcPriority::LowPriority);
        assert!(!policy.cancels_low_priority);
        assert!(policy.requires_split_handler);
    }

    #[test]
    fn wallet_confirm_and_export_are_privacy_critical() {
        for command in ["wallet:transaction:confirm", "wallet:backup:export"] {
            let policy = command_policy(command);

            assert_eq!(policy.priority, CoreRpcPriority::PrivacyCritical);
            assert!(!policy.cancels_low_priority);
            assert!(!policy.requires_split_handler);
        }
    }
}
