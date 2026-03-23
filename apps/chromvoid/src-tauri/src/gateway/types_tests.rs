use super::*;

#[test]
fn classify_sensitive_commands() {
    assert_eq!(
        classify_command("catalog:secret:read"),
        CommandCategory::Sensitive
    );
    assert_eq!(
        classify_command("catalog:secret:write"),
        CommandCategory::Sensitive
    );
    assert_eq!(
        classify_command("catalog:download"),
        CommandCategory::Sensitive
    );
    assert_eq!(
        classify_command("catalog:upload"),
        CommandCategory::Sensitive
    );
    assert_eq!(
        classify_command("passmanager:otp:generate"),
        CommandCategory::Sensitive
    );
    assert_eq!(
        classify_command("passmanager:secret:read"),
        CommandCategory::Sensitive
    );
}

#[test]
fn classify_catalog_write_commands() {
    assert_eq!(
        classify_command("catalog:createDir"),
        CommandCategory::CatalogWrite
    );
    assert_eq!(
        classify_command("catalog:rename"),
        CommandCategory::CatalogWrite
    );
    assert_eq!(
        classify_command("catalog:delete"),
        CommandCategory::CatalogWrite
    );
    assert_eq!(
        classify_command("catalog:move"),
        CommandCategory::CatalogWrite
    );
}

#[test]
fn classify_readonly_commands() {
    assert_eq!(classify_command("catalog:list"), CommandCategory::ReadOnly);
    assert_eq!(classify_command("vault:unlock"), CommandCategory::ReadOnly);
    assert_eq!(classify_command("vault:status"), CommandCategory::ReadOnly);
}

#[test]
fn grant_store_consume_action_grant() {
    let mut store = GrantStore::default();
    let now = now_ms();
    store.action_grants.insert(
        "g1".to_string(),
        ActionGrant {
            grant_id: "g1".to_string(),
            extension_id: "ext1".to_string(),
            command: "catalog:secret:read".to_string(),
            node_id: Some(42),
            created_at_ms: now,
            expires_at_ms: now + 30_000,
            consumed: false,
        },
    );

    assert!(!store.consume_action_grant("g1", "catalog:delete", Some(42)));
    assert!(!store.consume_action_grant("g1", "catalog:secret:read", Some(99)));
    assert!(store.consume_action_grant("g1", "catalog:secret:read", Some(42)));
    assert!(!store.consume_action_grant("g1", "catalog:secret:read", Some(42)));
}

#[test]
fn grant_store_consume_action_grant_no_node_id() {
    let mut store = GrantStore::default();
    let now = now_ms();
    store.action_grants.insert(
        "g2".to_string(),
        ActionGrant {
            grant_id: "g2".to_string(),
            extension_id: "ext1".to_string(),
            command: "catalog:download".to_string(),
            node_id: None,
            created_at_ms: now,
            expires_at_ms: now + 30_000,
            consumed: false,
        },
    );

    assert!(store.consume_action_grant("g2", "catalog:download", Some(999)));
}

#[test]
fn grant_store_site_grant() {
    let mut store = GrantStore::default();
    let now = now_ms();
    store.site_grants.insert(
        "https://github.com".to_string(),
        SiteGrant {
            grant_id: "sg1".to_string(),
            extension_id: "ext1".to_string(),
            origin: "https://github.com".to_string(),
            created_at_ms: now,
            expires_at_ms: now + 900_000,
        },
    );

    assert!(store.has_site_grant("https://github.com"));
    assert!(!store.has_site_grant("https://evil.com"));
}

#[test]
fn grant_store_revoke_all() {
    let mut store = GrantStore::default();
    let now = now_ms();
    store.action_grants.insert(
        "g1".to_string(),
        ActionGrant {
            grant_id: "g1".to_string(),
            extension_id: "ext1".to_string(),
            command: "catalog:secret:read".to_string(),
            node_id: None,
            created_at_ms: now,
            expires_at_ms: now + 30_000,
            consumed: false,
        },
    );
    store.site_grants.insert(
        "https://x.com".to_string(),
        SiteGrant {
            grant_id: "sg1".to_string(),
            extension_id: "ext1".to_string(),
            origin: "https://x.com".to_string(),
            created_at_ms: now,
            expires_at_ms: now + 900_000,
        },
    );

    store.revoke_all();
    assert!(store.action_grants.is_empty());
    assert!(store.site_grants.is_empty());
}

#[test]
fn grant_store_gc_removes_expired() {
    let mut store = GrantStore::default();
    let now = now_ms();
    store.action_grants.insert(
        "g_old".to_string(),
        ActionGrant {
            grant_id: "g_old".to_string(),
            extension_id: "ext1".to_string(),
            command: "catalog:download".to_string(),
            node_id: None,
            created_at_ms: now.saturating_sub(60_000),
            expires_at_ms: now.saturating_sub(1),
            consumed: false,
        },
    );
    store.action_grants.insert(
        "g_new".to_string(),
        ActionGrant {
            grant_id: "g_new".to_string(),
            extension_id: "ext1".to_string(),
            command: "catalog:download".to_string(),
            node_id: None,
            created_at_ms: now,
            expires_at_ms: now + 30_000,
            consumed: false,
        },
    );

    store.gc();
    assert_eq!(store.action_grants.len(), 1);
    assert!(store.action_grants.contains_key("g_new"));
}
