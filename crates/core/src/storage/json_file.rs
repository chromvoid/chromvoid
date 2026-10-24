//! Optional non-vault JSON metadata with the existing default-on-read-failure policy.
//! These readers must not be used for encrypted vault admission or key availability checks.

use serde::de::DeserializeOwned;
use std::path::Path;

pub fn read_json_or_default<T>(path: &Path, context: &str) -> T
where
    T: DeserializeOwned + Default,
{
    read_optional_json(path, context).unwrap_or_default()
}

pub fn read_optional_json<T>(path: &Path, context: &str) -> Option<T>
where
    T: DeserializeOwned,
{
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("{context}: failed to read JSON {}: {error}", path.display());
            }
            return None;
        }
    };

    match serde_json::from_str(&contents) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!(
                "{context}: failed to parse JSON {}: {error}",
                path.display()
            );
            None
        }
    }
}
