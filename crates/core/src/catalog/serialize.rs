//! Catalog serialization/deserialization

use crate::error::Result;

use super::node::CatalogNode;

#[derive(serde::Serialize, serde::Deserialize)]
struct CatalogEnvelope {
    // Catalog version (short field name)
    #[serde(rename = "v")]
    version: u64,
    // Root node
    #[serde(rename = "r")]
    root: CatalogNode,
}

/// Serialize a catalog (root + version) to JSON bytes.
pub fn serialize_catalog(root: &CatalogNode, version: u64) -> Result<Vec<u8>> {
    let env = CatalogEnvelope {
        version,
        root: root.clone(),
    };

    let json = serde_json::to_vec(&env)?;
    Ok(json)
}

/// Deserialize a catalog from JSON bytes.
///
/// Backward compatible: accepts the legacy format where the payload is the root node.
pub fn deserialize_catalog(data: &[u8]) -> Result<(CatalogNode, u64)> {
    let env = serde_json::from_slice::<CatalogEnvelope>(data)?;
    Ok((env.root, env.version))
}

#[cfg(test)]
#[path = "serialize_tests.rs"]
mod tests;
