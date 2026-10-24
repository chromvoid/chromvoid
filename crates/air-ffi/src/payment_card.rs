//! Core's payment card rules for the native card form and the card face: the network, its
//! grouping and lengths, whether a number reads as whole, and the name a card gets when none is
//! typed. Pure functions of the digits being typed; nothing is kept, and the copy handed over is
//! wiped after reading.
use chromvoid_core::payment_card::{self, CardFormat, CardNetwork};
use zeroize::Zeroizing;

/// How a card of one network is written.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct AirPaymentCardFormat {
    /// Core's spelling of the network, as `payment_card.brand` stores it; None when the digits
    /// or the stored brand name no network.
    pub network: Option<String>,
    /// Group sizes the network prints, covering `max_digits`.
    pub groups: Vec<u32>,
    /// The longest number the network issues; 19 when it is not known.
    pub max_digits: u32,
    /// The length a masked number is drawn at (`•••• •••• •••• 4242`).
    pub printed_digits: u32,
    /// The longest security code the card can have; 4 when the network is not known.
    pub code_digits: u32,
}

/// A number as typed so far.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct AirPaymentCardNumber {
    pub format: AirPaymentCardFormat,
    /// The number is whole: the form may move on to the next field.
    pub complete: bool,
    /// The network issues numbers this long (12 to 19 digits when it is not known).
    pub valid_length: bool,
    /// The Luhn check digit holds; false below 12 digits.
    pub checksum_valid: bool,
    /// The vault stores a number this long (12 to 19 digits); it refuses any other.
    pub storable: bool,
}

impl From<CardFormat> for AirPaymentCardFormat {
    fn from(format: CardFormat) -> Self {
        Self {
            network: format.network.map(|network| network.wire().to_string()),
            groups: format.groups.into_iter().map(u32::from).collect(),
            max_digits: format.max_digits as u32,
            printed_digits: format.printed_digits as u32,
            code_digits: format.code_digits as u32,
        }
    }
}

/// `number` may carry separators; only its digits are read.
#[uniffi::export]
pub fn inspect_payment_card_number(number: String) -> AirPaymentCardNumber {
    let number = Zeroizing::new(number);
    let inspection = payment_card::inspect(&number);
    AirPaymentCardNumber {
        format: inspection.format.into(),
        complete: inspection.complete,
        valid_length: inspection.valid_length,
        checksum_valid: inspection.checksum_valid,
        storable: inspection.storable,
    }
}

/// The format of a stored card from its `brand`, for the card face before the number is read.
#[uniffi::export]
pub fn payment_card_format(brand: String) -> AirPaymentCardFormat {
    CardFormat::of(CardNetwork::from_wire(&brand)).into()
}

/// The name Core gives a card saved without one: `Visa •••• 1111`, or `•••• 1111` for a
/// network it does not know. The form shows it where the name would be typed; Core numbers it
/// when the group already has one (`Visa •••• 1111 (2)`).
#[uniffi::export]
pub fn payment_card_default_title(brand: String, last4: String) -> String {
    payment_card::default_title(CardNetwork::from_wire(&brand), &last4)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspection_crosses_the_boundary_with_cores_spelling() {
        let amex = inspect_payment_card_number("3782 822463 10005".into());
        assert_eq!(amex.format.network.as_deref(), Some("amex"));
        assert_eq!(amex.format.groups, [4, 6, 5]);
        assert!(amex.complete && amex.valid_length && amex.checksum_valid);
        let stored = payment_card_format("mir".into());
        assert_eq!(stored.network.as_deref(), Some("mir"));
        assert_eq!(
            (stored.max_digits, stored.printed_digits, stored.code_digits),
            (19, 16, 3)
        );
        assert_eq!(payment_card_format("unknown".into()).network, None);
        assert_eq!(
            payment_card_format("American Express".into())
                .network
                .as_deref(),
            Some("amex")
        );
    }
}
