use crate::catalog::{CatalogManager, CatalogNode};
use crate::rpc::commands::normalize_path;

pub(super) fn child_path(parent_path: &str, name: &str) -> String {
    normalize_path(&format!(
        "{}/{}",
        parent_path.trim_end_matches('/'),
        name.trim_start_matches('/')
    ))
}

pub(super) fn path_depth(path: &str) -> usize {
    path.split('/').filter(|part| !part.is_empty()).count()
}

pub(super) fn catalogs_match_outside_domain(
    old_catalog: &CatalogManager,
    new_catalog: &CatalogManager,
    domain_path: &str,
) -> bool {
    stripped_root_outside_domain(old_catalog, domain_path)
        == stripped_root_outside_domain(new_catalog, domain_path)
}

fn stripped_root_outside_domain(catalog: &CatalogManager, domain_path: &str) -> CatalogNode {
    let mut root = catalog.root().clone();
    root.modtime = 0;
    if let Some(children) = root.children.as_mut() {
        children.retain(|child| child_path("/", &child.name) != domain_path);
    }
    root
}

pub(super) fn domain_roots_match(left: &Option<CatalogNode>, right: &Option<CatalogNode>) -> bool {
    normalize_domain_root(left) == normalize_domain_root(right)
}

fn normalize_domain_root(root: &Option<CatalogNode>) -> Option<CatalogNode> {
    root.as_ref().map(|root| {
        let mut normalized = root.clone();
        normalized.modtime = 0;
        normalized
    })
}
