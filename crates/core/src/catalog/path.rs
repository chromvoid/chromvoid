//! Path parsing and name validation utilities

use crate::error::{Error, Result};

/// Parse a path into parts
pub(super) fn parse_path(path: &str) -> Vec<&str> {
    path.split('/').filter(|s| !s.is_empty()).collect()
}

/// Validate a node name
pub(super) fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(Error::InvalidName("name cannot be empty".to_string()));
    }

    if name.contains('/') || name.contains('\0') {
        return Err(Error::InvalidName(format!(
            "name contains invalid characters: {}",
            name
        )));
    }

    if name == "." || name == ".." {
        return Err(Error::InvalidName(format!("reserved name: {}", name)));
    }

    Ok(())
}

#[cfg(test)]
#[path = "path_tests.rs"]
mod tests;
