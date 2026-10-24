//! Credential CSV mapping; quoting and record boundaries belong to the csv crate.
use super::external::{folder_path, safe_name};
use crate::credential_import::ImportDocumentInfo;
use crate::error::ErrorCode;
use crate::rpc::{
    helpers::clear_rpc_strings,
    types::{CredentialImportWarning, CredentialImportWarningCode as Warning, RpcResponse},
};
use csv::{ReaderBuilder, StringRecord, Trim};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ENTRIES: usize = 10_000;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Field {
    Title,
    Username,
    Password,
    Url,
    Note,
    Folder,
    Tags,
}
impl Field {
    fn from_header(header: &str) -> Option<Self> {
        match header.trim().to_ascii_lowercase().as_str() {
            "title" | "name" => Some(Self::Title),
            "username" | "user" | "login_username" | "loginusername" => Some(Self::Username),
            "password" | "pass" | "login_password" | "loginpassword" => Some(Self::Password),
            "url" | "uri" | "login_uri" | "loginuri" => Some(Self::Url),
            "notes" | "extra" => Some(Self::Note),
            "folder" | "grouping" => Some(Self::Folder),
            "tags" | "tag" => Some(Self::Tags),
            _ => None,
        }
    }
}
fn invalid(message: &'static str) -> RpcResponse {
    RpcResponse::error(message, Some(ErrorCode::EmptyPayload))
}
fn reader(bytes: &[u8], delimiter: u8) -> csv::Reader<&[u8]> {
    ReaderBuilder::new()
        .delimiter(delimiter)
        .trim(Trim::Headers)
        .from_reader(bytes)
}
fn delimiter(bytes: &[u8]) -> Result<u8, RpcResponse> {
    let mut candidates = Vec::new();
    for delimiter in [b',', b';', b'\t'] {
        let mut reader = reader(bytes, delimiter);
        if let Ok(headers) = reader.headers() {
            let fields: BTreeSet<_> = headers.iter().filter_map(Field::from_header).collect();
            if fields.contains(&Field::Title) && fields.contains(&Field::Password) {
                candidates.push(delimiter);
            }
        }
    }
    match candidates.as_slice() {
        [delimiter] => Ok(*delimiter),
        _ => Err(invalid(
            "CSV needs unambiguous title and password column headers",
        )),
    }
}
fn value<'a>(row: &'a StringRecord, columns: &BTreeMap<Field, usize>, field: Field) -> &'a str {
    columns
        .get(&field)
        .and_then(|index| row.get(*index))
        .unwrap_or_default()
}
fn bounded(value: &str, maximum: usize) -> bool {
    value.encode_utf16().take(maximum + 1).count() <= maximum
}

pub(super) fn convert(bytes: &[u8]) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
    let mut reader = reader(bytes, delimiter(bytes)?);
    let headers = reader
        .headers()
        .map_err(|_| invalid("Invalid CSV headers"))?;
    let mut columns = BTreeMap::new();
    let mut unknown = Vec::new();
    for (index, name) in headers.iter().enumerate() {
        if let Some(field) = Field::from_header(name) {
            if columns.insert(field, index).is_some() {
                return Err(invalid("CSV contains conflicting credential columns"));
            }
        } else {
            unknown.push(index);
        }
    }
    let mut skipped = 0_u32;
    let mut limited = 0_u32;
    let mut omitted_columns = BTreeSet::new();
    let mut folders = BTreeSet::new();
    let mut entries = Vec::new();
    for row in reader.records() {
        let row = match row {
            Ok(row) => row,
            Err(error) if matches!(error.kind(), csv::ErrorKind::UnequalLengths { .. }) => {
                skipped = skipped.saturating_add(1);
                continue;
            }
            Err(_) => {
                for entry in &mut entries {
                    clear_rpc_strings(entry);
                }
                return Err(invalid("CSV records could not be read"));
            }
        };
        if entries.len() >= MAX_ENTRIES {
            limited = limited.saturating_add(1);
            continue;
        }
        let title = value(&row, &columns, Field::Title).trim();
        let password = value(&row, &columns, Field::Password);
        let username = value(&row, &columns, Field::Username).trim();
        let url = value(&row, &columns, Field::Url).trim();
        let note = value(&row, &columns, Field::Note);
        if title.is_empty()
            || password.is_empty()
            || !bounded(title, 300)
            || !bounded(password, 10_000)
            || !bounded(username, 300)
            || !bounded(url, 2000)
            || !bounded(note, 50_000)
        {
            skipped = skipped.saturating_add(1);
            continue;
        }
        for index in &unknown {
            if row.get(*index).is_some_and(|value| !value.is_empty()) {
                omitted_columns.insert(*index);
            }
        }
        let folder = folder_path(value(&row, &columns, Field::Folder).trim());
        if !folder.is_empty() {
            folders.insert(folder.clone());
        }
        let tags: Vec<_> = value(&row, &columns, Field::Tags)
            .split([',', ';'])
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .collect();
        entries.push(json!({"title":safe_name(title),"entryType":"login","folderPath":folder,
            "username":username,"password":password,"note":note,"tags":tags,
            "urls":if url.is_empty() {Vec::<Value>::new()} else {vec![json!({"value":url,"match":"base_domain"})]},
            "import_source":{"type":"login","imported_at":super::super::path::now_unix_ms(),"folder_path":folder}
        }));
    }
    if entries.is_empty() && skipped > 0 {
        return Err(invalid("This CSV has no valid credential rows"));
    }
    let warnings = [
        (Warning::EntryLimit, limited),
        (Warning::InvalidRows, skipped),
        (
            Warning::UnmappedColumns,
            u32::try_from(omitted_columns.len()).unwrap_or(u32::MAX),
        ),
    ]
    .into_iter()
    .filter(|(_, count)| *count > 0)
    .map(|(code, count)| CredentialImportWarning { code, count })
    .collect();
    Ok((
        Value::Object(Map::from_iter([
            (
                "folders".into(),
                Value::Array(folders.into_iter().map(Value::String).collect()),
            ),
            ("entries".into(), Value::Array(entries)),
        ])),
        ImportDocumentInfo {
            legacy_ids: Default::default(),
            source: Some("csv".into()),
            warnings,
        },
    ))
}
