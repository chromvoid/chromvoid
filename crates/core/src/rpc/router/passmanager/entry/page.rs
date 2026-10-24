//! Read-only projection over the same catalog and metadata owner as entry:list.
use super::super::{error::PassmanagerCommandError, path::group_path_from_entry_path};
use super::{
    grouping::{self, GroupKey},
    io::{collect_entry_dir_ids_with_meta, read_entry_meta_json},
    request::timestamp_from_map,
    sanitize::sanitize_entry_meta_for_wire,
};
use crate::{
    rpc::types::{CredentialSummary, PassmanagerEntryPageRequest, PassmanagerEntryPageResponse},
    storage::Storage,
    vault::VaultSession,
};

struct CatalogRow {
    catalog_index: usize,
    node_id: u64,
    summary: CredentialSummary,
    matches: bool,
    text_key: String,
    time_key: u64,
    group: GroupKey,
}

pub(super) fn read_page(
    session: &VaultSession,
    storage: &Storage,
    data: &serde_json::Value,
) -> Result<PassmanagerEntryPageResponse, PassmanagerCommandError> {
    let request: PassmanagerEntryPageRequest = serde_json::from_value(data.clone())
        .map_err(|_| PassmanagerCommandError::empty_payload("Invalid entry page request"))?;
    if !(1..=100).contains(&request.limit) || request.query.len() > 4096 {
        return Err(PassmanagerCommandError::empty_payload(
            "Entry page limit or query is out of bounds",
        ));
    }
    if request
        .sort
        .as_deref()
        .is_some_and(|sort| !["name", "username", "website", "created", "modified"].contains(&sort))
        || request
            .entry_type
            .as_deref()
            .is_some_and(|kind| !["login", "payment_card"].contains(&kind))
    {
        return Err(PassmanagerCommandError::empty_payload(
            "Invalid catalog sort or type filter",
        ));
    }
    if request
        .group_by
        .as_deref()
        .is_some_and(|mode| !["website", "modified", "security"].contains(&mode))
        || (request.group_by.as_deref() == Some("modified")
            && !request.grouping_time.is_some_and(|time| time > 0))
        || (request.group_by.as_deref() != Some("modified") && request.grouping_time.is_some())
    {
        return Err(PassmanagerCommandError::empty_payload(
            "Invalid catalog grouping",
        ));
    }
    let ordered = request.sort.is_some() || request.group_by.is_some();
    let quick_filters = request.quick_filters.as_deref().unwrap_or_default();
    if quick_filters.len() > 3
        || quick_filters.iter().enumerate().any(|(index, filter)| {
            !["recent", "otp", "ssh"].contains(&filter.as_str())
                || quick_filters[..index].contains(filter)
        })
    {
        return Err(PassmanagerCommandError::empty_payload(
            "Invalid quick filters",
        ));
    }
    let recent_threshold =
        super::super::path::now_unix_ms().saturating_sub(14 * 24 * 60 * 60 * 1000);
    let ssh_entry_ids: std::collections::HashSet<String> =
        if quick_filters.iter().any(|f| f == "ssh") {
            super::super::ssh::load_key_metadata(session, storage)?
                .into_iter()
                .filter_map(|key| key.source_entry_id)
                .collect()
        } else {
            std::collections::HashSet::new()
        };
    let tag_filter = request
        .tag_key
        .as_deref()
        .map(super::tags::credential_tag_key);
    if tag_filter
        .as_ref()
        .is_some_and(|key| key.is_empty() || key.len() > 128)
    {
        return Err(PassmanagerCommandError::empty_payload("Invalid tag filter"));
    }
    let group_filter = request
        .group_path
        .as_deref()
        .map(|path| super::super::group::navigation::existing_group_path(session, path))
        .transpose()?;
    let mut page = PassmanagerEntryPageResponse {
        entries: Vec::new(),
        next_offset: None,
        total_count: None,
    };
    let Some(root) = session.catalog().find_by_path("/.passmanager") else {
        return Ok(page);
    };
    let mut ids = Vec::new();
    collect_entry_dir_ids_with_meta(root, &mut ids);
    ids.sort_unstable();
    let catalog_count = ids.len();
    // Only the metadata projection and sort keys survive each read. Scope is
    // checked before reading, so unreadable entries outside it do not break it.
    let mut rows = Vec::new();
    let query = request.query.trim().to_lowercase();
    for (catalog_index, id) in ids.into_iter().enumerate() {
        let path = session.catalog().get_path(id).ok_or_else(|| {
            PassmanagerCommandError::internal("Credential catalog path is unavailable")
        })?;
        let group_path = group_path_from_entry_path(&path);
        if group_filter.as_ref().is_some_and(|group| {
            group != "/" && group_path != *group && !group_path.starts_with(&format!("{group}/"))
        }) {
            continue;
        }
        if !ordered && catalog_index < request.offset as usize {
            continue;
        }
        let mut metadata = read_entry_meta_json(session, storage, id).ok_or_else(|| {
            PassmanagerCommandError::internal("Credential metadata could not be read")
        })?;
        let object = metadata.as_object_mut().ok_or_else(|| {
            PassmanagerCommandError::internal("Credential metadata is not an object")
        })?;
        sanitize_entry_meta_for_wire(object);
        let string = |key: &str| {
            object
                .get(key)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned()
        };
        let entry_id = object
            .get("id")
            .and_then(|value| value.as_str())
            .map(str::to_owned)
            .unwrap_or_else(|| id.to_string());
        let title = string("title");
        let username = string("username");
        let entry_type = string("entry_type");
        let websites: Vec<&str> = object
            .get("urls")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|url| {
                url.as_str()
                    .or_else(|| url.get("value").and_then(|v| v.as_str()))
            })
            .collect();
        let matches = tag_filter.as_ref().is_none_or(|key| {
            object
                .get("tags")
                .and_then(|v| v.as_array())
                .is_some_and(|tags| {
                    tags.iter()
                        .filter_map(|v| v.as_str())
                        .any(|label| super::tags::credential_tag_key(label) == *key)
                })
        }) && request
            .entry_type
            .as_ref()
            .is_none_or(|kind| *kind == entry_type)
            && quick_filters.iter().all(|filter| match filter.as_str() {
                "recent" => grouping::normalized_timestamp(object)
                    .is_none_or(|timestamp| timestamp >= recent_threshold),
                "otp" => {
                    entry_type != "payment_card"
                        && object
                            .get("otps")
                            .and_then(|value| value.as_array())
                            .is_some_and(|records| !records.is_empty())
                }
                "ssh" => {
                    entry_type != "payment_card"
                        && (ssh_entry_ids.contains(&entry_id)
                            || object
                                .get("sshKeys")
                                .and_then(|value| value.as_array())
                                .is_some_and(|records| !records.is_empty()))
                }
                _ => false, // Validated above before reading the catalog.
            })
            && (query.is_empty()
                || title.to_lowercase().contains(&query)
                || username.to_lowercase().contains(&query)
                || websites
                    .iter()
                    .any(|url| url.to_lowercase().contains(&query))
                || object
                    .get("tags")
                    .and_then(|v| v.as_array())
                    .is_some_and(|tags| {
                        tags.iter().any(|tag| {
                            tag.as_str()
                                .is_some_and(|tag| tag.to_lowercase().contains(&query))
                        })
                    }));
        let text_key = match request.sort.as_deref() {
            Some("username") => username.to_lowercase(),
            Some("website") => websites.first().unwrap_or(&"").to_lowercase(),
            Some("name") => title.to_lowercase(),
            _ => String::new(),
        };
        let time_key = match request.sort.as_deref() {
            Some("created") => timestamp_from_map(object, "createdTs", "created_ts").unwrap_or(0),
            Some("modified") => timestamp_from_map(object, "updatedTs", "updated_ts").unwrap_or(0),
            _ => 0,
        };
        let group = grouping::key(request.group_by.as_deref(), request.grouping_time, object);
        let has_codes = entry_type != "payment_card"
            && object
                .get("otps")
                .and_then(|value| value.as_array())
                .is_some_and(|records| !records.is_empty());
        let summary = CredentialSummary {
            group_key: request.group_by.as_ref().map(|_| group.key.clone()),
            icon_ref: object
                .get("icon_ref")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
            website: websites
                .first()
                .map(|url| website_host(url))
                .filter(|h| !h.is_empty()),
            has_codes: has_codes.then_some(true),
            id: entry_id,
            title,
            username,
            entry_type,
            group_path,
        };
        if !ordered && !matches {
            continue;
        }
        rows.push(CatalogRow {
            catalog_index,
            node_id: id,
            summary,
            matches,
            text_key,
            time_key,
            group,
        });
        if !ordered && rows.len() == request.limit as usize {
            break;
        }
    }
    // Sort the complete projection before pagination, with node identity as a
    // stable tie break. Never sort only the rows of one returned page.
    if ordered {
        rows.sort_by(|left, right| {
            let order = left
                .text_key
                .cmp(&right.text_key)
                .then_with(|| left.time_key.cmp(&right.time_key));
            let order = if request.descending == Some(true) {
                order.reverse()
            } else {
                order
            };
            left.group
                .cmp(&right.group)
                .then(order)
                .then_with(|| left.node_id.cmp(&right.node_id))
        });
    }
    // Leave space for the envelope and cursor below the native 1 MiB boundary.
    const MAX_PAGE_BYTES: usize = 512 * 1024;
    let mut page_bytes = 128;
    let row_count = rows.len();
    if ordered {
        page.total_count = Some(page_offset(rows.iter().filter(|row| row.matches).count())?);
    }
    for (position, row) in rows.into_iter().enumerate() {
        let CatalogRow {
            catalog_index,
            summary,
            matches,
            ..
        } = row;
        let index = if ordered { position } else { catalog_index };
        if index < request.offset as usize || !matches {
            continue;
        }
        let summary_bytes = serde_json::to_vec(&summary)
            .map_err(|_| {
                PassmanagerCommandError::internal("Credential summary could not be encoded")
            })?
            .len()
            + 1;
        if page_bytes + summary_bytes > MAX_PAGE_BYTES {
            if page.entries.is_empty() {
                return Err(PassmanagerCommandError::internal(
                    "Credential summary exceeds page capacity",
                ));
            }
            page.next_offset = Some(page_offset(index)?);
            break;
        }
        page_bytes += summary_bytes;
        page.entries.push(summary);
        if page.entries.len() == request.limit as usize {
            if (ordered && position + 1 < row_count) || (!ordered && index + 1 < catalog_count) {
                page.next_offset = Some(page_offset(index + 1)?);
            }
            break;
        }
    }
    Ok(page)
}

/// The host of a website value as the catalog row shows it: parsed like the website grouping,
/// without the `www.` prefix and lowercased. A value without a host yields an empty string.
pub(crate) fn website_host(value: &str) -> String {
    let value = value.trim();
    let url = if value.contains("://") {
        value.to_owned()
    } else {
        format!("https://{value}")
    };
    url::Url::parse(&url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.strip_prefix("www.").unwrap_or(host).to_lowercase())
        })
        .unwrap_or_default()
}

fn page_offset(index: usize) -> Result<u32, PassmanagerCommandError> {
    u32::try_from(index)
        .map_err(|_| PassmanagerCommandError::internal("Credential catalog exceeds page capacity"))
}

#[cfg(test)]
mod website_host_tests {
    use super::website_host;

    #[test]
    fn strips_scheme_path_credentials_port_and_www() {
        assert_eq!(
            website_host("https://www.Example.com/login?next=1"),
            "example.com"
        );
        assert_eq!(website_host("drive.example.com"), "drive.example.com");
        assert_eq!(
            website_host("http://user:secret@mail.example.org:8443/x"),
            "mail.example.org"
        );
        assert_eq!(
            website_host(" https://accounts.example.net "),
            "accounts.example.net"
        );
    }

    #[test]
    fn value_without_a_host_is_empty() {
        assert_eq!(website_host(""), "");
        assert_eq!(website_host("not a url"), "");
        assert_eq!(website_host("https://"), "");
    }
}
