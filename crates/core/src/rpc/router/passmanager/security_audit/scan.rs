//! Stateless, read-only audit pages. Passwords never leave this scoped scan.
use super::super::{
    entry::{collect_entry_dir_ids_with_meta, read_entry_meta_json, sanitize_entry_meta_for_wire},
    error::PassmanagerCommandError as Error,
    password_generator::{DIGITS, LOWERCASE, SYMBOLS, UPPERCASE},
    path::group_path_from_entry_path,
    secret::secret_filename,
};
use crate::{
    error::ErrorCode,
    rpc::{
        router::domain_read::{read_blob_by_node, DomainReadScope},
        types::{
            CredentialAuditEntrySummary, CredentialAuditStrengthScore, CredentialSecurityAuditRow,
            CredentialSummary, PassmanagerSecurityAuditPageRequest,
            PassmanagerSecurityAuditPageResponse,
        },
    },
    storage::Storage,
    vault::VaultSession,
};
use serde_json::Value;
use std::collections::HashSet;
use zeroize::Zeroizing;

pub(in crate::rpc::router::passmanager) fn read_page(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<PassmanagerSecurityAuditPageResponse, Error> {
    let request: PassmanagerSecurityAuditPageRequest = serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid audit page request"))?;
    if !(1..=100).contains(&request.limit)
        || request
            .issue
            .as_deref()
            .is_some_and(|issue| !["weak", "reused", "without_otp", "failed"].contains(&issue))
        || request
            .revision
            .as_ref()
            .is_some_and(|revision| revision.len() != 64)
        || (request.offset > 0 && request.revision.is_none())
    {
        return Err(Error::empty_payload("Invalid audit page options"));
    }
    let mut revision = blake3::Hasher::new();
    revision.update(b"credential-audit-v1");
    let mut rows = Vec::new();
    let mut passwords = Vec::new();
    if let Some(root) = session.catalog().find_by_path("/.passmanager") {
        // Catalog-owned source revisions include password-only edits, unlike metadata timestamps.
        serde_json::to_writer(&mut revision, root)
            .map_err(|_| Error::internal("Invalid audit catalog"))?;
        let mut nodes = Vec::new();
        collect_entry_dir_ids_with_meta(root, &mut nodes);
        nodes.sort_unstable();
        let mut identities = HashSet::new();
        for node_id in nodes {
            let mut meta = read_entry_meta_json(session, storage, node_id)
                .ok_or_else(|| Error::internal("Credential metadata could not be read"))?;
            let object = meta
                .as_object_mut()
                .ok_or_else(|| Error::internal("Invalid credential metadata"))?;
            sanitize_entry_meta_for_wire(object);
            let text = |key: &str| {
                object
                    .get(key)
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned()
            };
            let id = object
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| node_id.to_string());
            if id.is_empty() || !identities.insert(id.clone()) {
                return Err(Error::internal("Invalid credential identity"));
            }
            let entry_type = text("entry_type");
            let is_login = entry_type == "login";
            let has_otp = is_login
                && object
                    .get("otps")
                    .and_then(Value::as_array)
                    .is_some_and(|otps| !otps.is_empty());
            let password = if is_login {
                read_password(session, storage, node_id)
            } else {
                Ok(None)
            };
            let audit = match password {
                Ok(password) => {
                    let score = password
                        .as_ref()
                        .filter(|p| !p.is_empty())
                        .map(|p| strength(p));
                    if let Some(password) = password.filter(|p| !p.is_empty()) {
                        passwords.push((rows.len(), password));
                    }
                    Some(CredentialAuditEntrySummary {
                        entry_id: id.clone(),
                        weak_password: score.is_some_and(|score| score <= 1),
                        reused_password: false,
                        has_two_factor: has_otp,
                        strength_score: CredentialAuditStrengthScore(score),
                    })
                }
                Err(()) => None,
            };
            let path = session
                .catalog()
                .get_path(node_id)
                .ok_or_else(|| Error::internal("Credential path is unavailable"))?;
            rows.push(CredentialSecurityAuditRow {
                credential: CredentialSummary {
                    id,
                    title: text("title"),
                    username: text("username"),
                    entry_type,
                    group_path: group_path_from_entry_path(&path),
                    group_key: None,
                    // Audit rows carry their own `has_two_factor`; the catalog-only fields stay
                    // out of this projection so the v1 oracle shape holds.
                    icon_ref: None,
                    website: None,
                    has_codes: None,
                },
                audit,
            });
        }
    }
    // Exact equality without persistent or serializable password fingerprints.
    passwords.sort_unstable_by(|left, right| left.1.as_str().cmp(right.1.as_str()));
    for pair in passwords.windows(2) {
        if pair[0].1.as_str() == pair[1].1.as_str() {
            for (index, _) in pair {
                if let Some(audit) = &mut rows[*index].audit {
                    audit.reused_password = true;
                }
            }
        }
    }
    drop(passwords); // Zeroizing<String> wipes every owned password before projection/serialization.
                     // Failed reads and their recovery also invalidate a continuation, even without catalog mutation.
    serde_json::to_writer(&mut revision, &rows)
        .map_err(|_| Error::internal("Invalid audit results"))?;
    let revision = revision.finalize().to_hex().to_string();
    if request
        .revision
        .as_ref()
        .is_some_and(|expected| *expected != revision)
    {
        return Err(Error::new(
            "Credentials changed; restart the audit",
            Some(ErrorCode::SyncConflict),
        ));
    }
    let mut result = PassmanagerSecurityAuditPageResponse {
        algorithm_version: super::SECURITY_AUDIT_ALGORITHM_VERSION,
        revision,
        entries: Vec::new(),
        next_offset: None,
        total_count: u32::try_from(rows.len())
            .map_err(|_| Error::internal("Audit exceeds capacity"))?,
        failed_count: 0,
        weak_password_count: 0,
        reused_password_count: 0,
        two_factor_count: 0,
    };
    for row in &rows {
        if let Some(audit) = &row.audit {
            result.weak_password_count += u32::from(audit.weak_password);
            result.reused_password_count += u32::from(audit.reused_password);
            result.two_factor_count += u32::from(audit.has_two_factor);
        } else {
            result.failed_count += 1;
        }
    }
    let mut bytes = 0;
    for (index, row) in rows
        .into_iter()
        .filter(|row| matches_issue(row, request.issue.as_deref()))
        .enumerate()
        .skip(request.offset as usize)
    {
        if result.entries.len() >= request.limit as usize {
            result.next_offset = Some(index as u32);
            break;
        }
        let size = serde_json::to_vec(&row)
            .map_err(|_| Error::internal("Invalid audit row"))?
            .len();
        if bytes + size > 500 * 1024 {
            if result.entries.is_empty() {
                return Err(Error::internal("Audit row exceeds capacity"));
            }
            result.next_offset = Some(index as u32);
            break;
        }
        bytes += size;
        result.entries.push(row);
    }
    Ok(result)
}

fn matches_issue(row: &CredentialSecurityAuditRow, issue: Option<&str>) -> bool {
    match issue {
        None => true,
        Some("failed") => row.audit.is_none(),
        Some("weak") => row.audit.as_ref().is_some_and(|audit| audit.weak_password),
        Some("reused") => row
            .audit
            .as_ref()
            .is_some_and(|audit| audit.reused_password),
        Some("without_otp") => {
            row.credential.entry_type == "login"
                && row
                    .audit
                    .as_ref()
                    .is_some_and(|audit| !audit.has_two_factor)
        }
        _ => false, // Validated before any catalog/secret read.
    }
}

fn read_password(
    session: &VaultSession,
    storage: &Storage,
    node_id: u64,
) -> Result<Option<Zeroizing<String>>, ()> {
    let node = session.catalog().find_by_id(node_id).ok_or(())?;
    let name = secret_filename("password").ok_or(())?;
    let Some(secret) = node.find_child(&name) else {
        return Ok(None);
    };
    let bytes = Zeroizing::new(
        read_blob_by_node(
            session,
            storage,
            DomainReadScope::Passmanager,
            secret.node_id,
        )
        .map_err(|_| ())?,
    );
    let value = std::str::from_utf8(&bytes).map_err(|_| ())?;
    Ok(Some(Zeroizing::new(value.to_owned())))
}

/// Artifact algorithm v1 parity with the existing TS heuristic; not a crack-time guarantee.
fn strength(password: &str) -> u8 {
    let mut pool = 0;
    for (present, alphabet) in [
        (password.bytes().any(|c| c.is_ascii_lowercase()), LOWERCASE),
        (password.bytes().any(|c| c.is_ascii_uppercase()), UPPERCASE),
        (password.bytes().any(|c| c.is_ascii_digit()), DIGITS),
        (
            password.chars().any(|c| !c.is_ascii_alphanumeric()),
            SYMBOLS,
        ),
    ] {
        if present {
            pool += alphabet.len();
        }
    }
    let entropy = if pool == 0 {
        0.0
    } else {
        (password.encode_utf16().count() as f64 * (pool as f64).log2()).floor()
    };
    if entropy >= 100.0 {
        4
    } else if entropy >= 70.0 {
        3
    } else if entropy >= 45.0 {
        2
    } else if entropy >= 28.0 {
        1
    } else {
        0
    }
}
