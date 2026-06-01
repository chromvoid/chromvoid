use std::collections::HashMap;

use super::super::credential_types::{
    CredentialProviderSession, CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS,
    CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES,
};

#[derive(Debug)]
pub(in crate::rpc::router) struct CredentialProviderRuntime {
    enabled: bool,
    sessions: HashMap<String, CredentialProviderSession>,
    allowlist: HashMap<String, std::time::SystemTime>,
    last_used_at_ms: HashMap<String, u64>,
}

impl Default for CredentialProviderRuntime {
    fn default() -> Self {
        Self {
            enabled: true,
            sessions: HashMap::new(),
            allowlist: HashMap::new(),
            last_used_at_ms: HashMap::new(),
        }
    }
}

impl CredentialProviderRuntime {
    pub(in crate::rpc::router) fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub(in crate::rpc::router) fn clear_all(&mut self) {
        self.sessions.clear();
        self.allowlist.clear();
        self.last_used_at_ms.clear();
    }

    pub(in crate::rpc::router) fn prune_sessions(&mut self) {
        let now = std::time::SystemTime::now();
        self.sessions.retain(|_, session| session.expires_at > now);
    }

    pub(in crate::rpc::router) fn insert_session(
        &mut self,
        token: String,
        session: CredentialProviderSession,
    ) {
        self.sessions.insert(token, session);
    }

    pub(in crate::rpc::router) fn remove_session(&mut self, token: &str) {
        self.sessions.remove(token);
    }

    pub(in crate::rpc::router) fn validate_session(
        &mut self,
        token: &str,
        consume_secret_use: bool,
    ) -> bool {
        self.prune_sessions();
        let mut should_expire = false;

        let Some(session) = self.sessions.get_mut(token) else {
            return false;
        };
        if std::time::SystemTime::now() >= session.expires_at {
            should_expire = true;
        }

        if consume_secret_use && !should_expire {
            if session.secret_uses >= CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES {
                should_expire = true;
            } else {
                session.secret_uses = session.secret_uses.saturating_add(1);
            }
        }

        if should_expire {
            self.sessions.remove(token);
            return false;
        }

        self.prune_allowlist();
        true
    }

    pub(in crate::rpc::router) fn prune_allowlist(&mut self) {
        let now = std::time::SystemTime::now();
        self.allowlist.retain(|_, expires_at| *expires_at > now);
    }

    pub(in crate::rpc::router) fn allow(&mut self, credential_id: &str) {
        self.prune_allowlist();
        let ttl = std::time::Duration::from_secs(CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS);
        let expires_at = std::time::SystemTime::now()
            .checked_add(ttl)
            .unwrap_or_else(std::time::SystemTime::now);
        self.allowlist.insert(credential_id.to_string(), expires_at);
    }

    pub(in crate::rpc::router) fn is_allowlisted(&self, credential_id: &str) -> bool {
        self.allowlist.contains_key(credential_id)
    }

    pub(in crate::rpc::router) fn record_last_used(&mut self, credential_id: &str, now_ms: u64) {
        self.last_used_at_ms
            .insert(credential_id.to_string(), now_ms);
    }

    pub(in crate::rpc::router) fn last_used_at_ms(&self, credential_id: &str) -> Option<u64> {
        self.last_used_at_ms.get(credential_id).copied()
    }
}
