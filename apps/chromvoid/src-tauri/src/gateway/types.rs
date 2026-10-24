use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::state::now_ms;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessDuration {
    UntilVaultLocked,
    Hour1,
    Hour24,
}

impl Default for AccessDuration {
    fn default() -> Self {
        Self::UntilVaultLocked
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedExtension {
    pub id: String,
    pub created_at_ms: u64,
    pub last_active_ms: Option<u64>,
    pub revoked: bool,
    pub label: Option<String>,
}

/// Route-bound identity class established by the Noise handshake.
///
/// This value is selected by the desktop pairing flow and never accepted
/// from an encrypted request payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GatewayActorKind {
    BrowserExtension,
    CliAgent,
}

impl Default for GatewayActorKind {
    fn default() -> Self {
        Self::BrowserExtension
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedAgent {
    pub id: String,
    pub created_at_ms: u64,
    pub last_active_ms: Option<u64>,
    pub revoked: bool,
    pub label: Option<String>,
}

// ---------------------------------------------------------------------------
// Capability grant types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandCategory {
    ReadOnly,
    Sensitive,
    CatalogWrite,
}

pub fn classify_command(command: &str) -> CommandCategory {
    match command {
        command
            if command.starts_with("passmanager:import:")
                && command != "passmanager:import:limits" =>
        {
            CommandCategory::CatalogWrite
        }
        "catalog:secret:read"
        | "catalog:secret:write"
        | "catalog:derivative:read"
        | "catalog:derivative:write"
        | "catalog:download"
        | "catalog:upload"
        | "passmanager:secret:read"
        | "passmanager:ssh:secret:read"
        | "passmanager:ssh:key:export"
        | "passmanager:otp:generate"
        | "passmanager:otp:record:code"
        | "passmanager:root:export"
        | "passmanager:otp:preview" => CommandCategory::Sensitive,
        "catalog:attachment:prepare"
        | "catalog:createDir"
        | "catalog:rename"
        | "catalog:delete"
        | "catalog:move"
        | "catalog:createFile"
        | "catalog:updateMeta"
        | "catalog:file:replace"
        | "passmanager:entry:create"
        | "passmanager:entry:save"
        | "passmanager:entry:update"
        | "passmanager:entry:delete"
        | "passmanager:entry:move"
        | "passmanager:entry:rename"
        | "passmanager:entry:websites:update"
        | "passmanager:secret:save"
        | "passmanager:secret:delete"
        | "passmanager:tag:save"
        | "passmanager:tag:delete"
        | "passmanager:tags:setCatalog"
        | "passmanager:group:rename"
        | "passmanager:group:ensure"
        | "passmanager:group:setMeta"
        | "passmanager:group:delete"
        | "passmanager:root:import"
        | "passmanager:icon:put"
        | "passmanager:icon:setMeta"
        | "passmanager:icon:gc"
        | "passmanager:securityAudit:set"
        | "passmanager:otp:setSecret"
        | "passmanager:otp:removeSecret"
        | "passmanager:otp:renameSecret"
        | "passmanager:otp:record:save"
        | "passmanager:otp:record:delete"
        | "passmanager:ssh:keygen"
        | "passmanager:ssh:key:import"
        | "passmanager:ssh:key:edit"
        | "passmanager:ssh:key:update"
        | "passmanager:ssh:key:delete"
        | "passmanager:ssh:secret:save"
        | "passmanager:ssh:secret:delete" => CommandCategory::CatalogWrite,
        _ => CommandCategory::ReadOnly,
    }
}

/// Env Runtime actions are confined to the typed `/agent` route. Even its
/// metadata RPCs must never be reachable through the extension's generic Core
/// forwarding surface.
pub fn is_agent_only_core_command(command: &str) -> bool {
    command.starts_with("env_runtime:")
}

/// Authenticated device-peer RPCs are not part of the browser extension or
/// agent Gateway surface, even when their capability name is discoverable
/// through the shared Core capability document.
pub fn is_private_peer_core_command(command: &str) -> bool {
    matches!(command, "catalog:derivative:ensure")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum AllowedCommands {
    All,
    ReadOnly,
    Custom { commands: Vec<String> },
}

impl Default for AllowedCommands {
    fn default() -> Self {
        Self::All
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityPolicy {
    pub extension_id: String,
    #[serde(default)]
    pub allowed_commands: AllowedCommands,
    #[serde(default = "default_true")]
    pub require_action_grant: bool,
    #[serde(default = "default_true")]
    pub require_site_grant: bool,
    #[serde(default)]
    pub site_allowlist: Vec<String>,
}

fn default_true() -> bool {
    true
}

impl CapabilityPolicy {
    pub fn default_for(extension_id: String) -> Self {
        Self {
            extension_id,
            allowed_commands: AllowedCommands::default(),
            require_action_grant: true,
            require_site_grant: true,
            site_allowlist: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionGrant {
    pub grant_id: String,
    pub extension_id: String,
    pub command: String,
    pub node_id: Option<u64>,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub consumed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteGrant {
    pub grant_id: String,
    pub extension_id: String,
    pub origin: String,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct GrantStore {
    pub action_grants: HashMap<String, ActionGrant>,
    pub site_grants: HashMap<String, SiteGrant>,
}

impl GrantStore {
    /// Remove expired grants.
    pub fn gc(&mut self) {
        let now = now_ms();
        self.action_grants
            .retain(|_, g| !g.consumed && g.expires_at_ms > now);
        self.site_grants.retain(|_, g| g.expires_at_ms > now);
    }

    /// Revoke all grants.
    pub fn revoke_all(&mut self) {
        self.action_grants.clear();
        self.site_grants.clear();
    }

    /// Consume a single-use action grant. Returns `true` if the grant is valid.
    pub fn consume_action_grant(
        &mut self,
        grant_id: &str,
        command: &str,
        node_id: Option<u64>,
    ) -> bool {
        let now = now_ms();
        let Some(grant) = self.action_grants.get_mut(grant_id) else {
            return false;
        };
        if grant.consumed || grant.expires_at_ms <= now {
            return false;
        }
        if grant.command != command {
            return false;
        }
        if grant.node_id.is_some() && grant.node_id != node_id {
            return false;
        }
        grant.consumed = true;
        true
    }

    /// Check if a valid site grant exists for the given origin.
    pub fn has_site_grant(&self, origin: &str) -> bool {
        let now = now_ms();
        self.site_grants
            .get(origin)
            .map(|g| g.expires_at_ms > now)
            .unwrap_or(false)
    }
}

#[cfg(test)]
#[path = "types_tests.rs"]
mod tests;
