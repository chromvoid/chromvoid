//! `brand` and the default name of a stored card. The network rules are Core's `payment_card`,
//! shared with the clients; unknown prefixes keep the client's value or "unknown".

use super::super::super::domain_uow::DomainUnitOfWork;
pub use crate::payment_card::UNKNOWN_NETWORK as UNKNOWN_BRAND;
use crate::payment_card::{self, CardNetwork};

/// The network's wire spelling from the leading digits.
pub fn detect_brand(pan: &str) -> Option<&'static str> {
    CardNetwork::detect(pan).map(CardNetwork::wire)
}

/// The name Core gives a card saved without one - its network and last four digits - kept
/// unique among the entries of `parent_path`; `own` is the entry itself when it is renamed in
/// place. None while the card has no last four digits.
pub fn default_card_title(
    uow: &DomainUnitOfWork<'_>,
    parent_path: &str,
    payment_card: &serde_json::Map<String, serde_json::Value>,
    own: Option<u64>,
) -> Option<String> {
    let last4 = payment_card.get("last4")?.as_str()?;
    let base = payment_card::default_title(card_network(payment_card), last4);
    Some(payment_card::unique_title(&base, |name| {
        uow.catalog()
            .find_by_path(&format!("{}/{name}", parent_path.trim_end_matches('/')))
            .is_some_and(|node| Some(node.node_id) != own)
    }))
}

/// The network a stored card names in `brand`.
pub fn card_network(
    payment_card: &serde_json::Map<String, serde_json::Value>,
) -> Option<CardNetwork> {
    payment_card
        .get("brand")
        .and_then(serde_json::Value::as_str)
        .and_then(CardNetwork::from_wire)
}

/// Fills `brand` from the number when the client did not name a network.
pub fn apply_brand(payment_card: &mut serde_json::Map<String, serde_json::Value>, pan: &str) {
    let current = payment_card
        .get("brand")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if current.is_empty() || current.eq_ignore_ascii_case(UNKNOWN_BRAND) {
        let brand = detect_brand(pan).unwrap_or(UNKNOWN_BRAND);
        payment_card.insert(
            "brand".to_string(),
            serde_json::Value::String(brand.to_string()),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_keeps_explicit_brand_and_fills_unknown() {
        let mut card = serde_json::Map::new();
        card.insert("brand".into(), serde_json::Value::String("unknown".into()));
        apply_brand(&mut card, "4111111111111111");
        assert_eq!(card["brand"], "visa");
        card.insert("brand".into(), serde_json::Value::String("mir".into()));
        apply_brand(&mut card, "4111111111111111");
        assert_eq!(card["brand"], "mir");
        let mut empty = serde_json::Map::new();
        apply_brand(&mut empty, "1234");
        assert_eq!(empty["brand"], "unknown");
    }
}
