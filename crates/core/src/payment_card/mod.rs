//! What a payment card number says about itself: its network, how the network prints it, how
//! many digits it may have, how long its security code is and whether its check digit holds.
//!
//! Core owns these rules so the vault and every client read a number the same way: the vault
//! stores `brand` from them and refuses a number or a code outside their lengths, and the
//! native clients group and check a number with them while it is typed. Nothing here keeps or
//! logs the digits, and nothing returns more of them than a card's name shows: its last four.

use std::ops::RangeInclusive;

use zeroize::Zeroizing;

/// The fewest digits any network issues; Core refuses a shorter number.
pub const MIN_NUMBER_DIGITS: usize = 12;
/// The most digits any network issues; Core refuses a longer number.
pub const MAX_NUMBER_DIGITS: usize = 19;
/// A security code is three digits, four on American Express cards.
pub const CODE_DIGITS: RangeInclusive<usize> = 3..=4;
/// `brand` of a card whose number names no network Core knows.
pub const UNKNOWN_NETWORK: &str = "unknown";

/// Groups of four, as most networks print a number; cut to the network's longest number.
const FOURS: [u8; 5] = [4, 4, 4, 4, 3];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardNetwork {
    Visa,
    Mastercard,
    Mir,
    Amex,
    UnionPay,
    Jcb,
    Discover,
    DinersClub,
    Maestro,
}

impl CardNetwork {
    pub const ALL: [CardNetwork; 9] = [
        CardNetwork::Visa,
        CardNetwork::Mastercard,
        CardNetwork::Mir,
        CardNetwork::Amex,
        CardNetwork::UnionPay,
        CardNetwork::Jcb,
        CardNetwork::Discover,
        CardNetwork::DinersClub,
        CardNetwork::Maestro,
    ];

    /// The network's spelling in `payment_card.brand`.
    pub fn wire(self) -> &'static str {
        match self {
            CardNetwork::Visa => "visa",
            CardNetwork::Mastercard => "mastercard",
            CardNetwork::Mir => "mir",
            CardNetwork::Amex => "amex",
            CardNetwork::UnionPay => "unionpay",
            CardNetwork::Jcb => "jcb",
            CardNetwork::Discover => "discover",
            CardNetwork::DinersClub => "dinersclub",
            CardNetwork::Maestro => "maestro",
        }
    }

    /// The network's name as cards print it; the same in every language.
    pub fn display_name(self) -> &'static str {
        match self {
            CardNetwork::Visa => "Visa",
            CardNetwork::Mastercard => "Mastercard",
            CardNetwork::Mir => "Мир",
            CardNetwork::Amex => "American Express",
            CardNetwork::UnionPay => "UnionPay",
            CardNetwork::Jcb => "JCB",
            CardNetwork::Discover => "Discover",
            CardNetwork::DinersClub => "Diners Club",
            CardNetwork::Maestro => "Maestro",
        }
    }

    /// A stored `brand`; `unknown` and anything unrecognised are no network. Imports carry the
    /// names other managers write (`American Express`, `Diners Club`, `China UnionPay`, `Мир`),
    /// so case, spaces and dashes are ignored and those names are read too.
    pub fn from_wire(value: &str) -> Option<Self> {
        let key: String = value
            .chars()
            .filter(|c| !c.is_whitespace() && *c != '-' && *c != '_')
            .flat_map(char::to_lowercase)
            .collect();
        let network = match key.as_str() {
            "visa" => CardNetwork::Visa,
            "mastercard" => CardNetwork::Mastercard,
            "mir" | "мир" => CardNetwork::Mir,
            "amex" | "americanexpress" => CardNetwork::Amex,
            "unionpay" | "chinaunionpay" | "cup" => CardNetwork::UnionPay,
            "jcb" => CardNetwork::Jcb,
            "discover" => CardNetwork::Discover,
            "dinersclub" | "diners" => CardNetwork::DinersClub,
            "maestro" => CardNetwork::Maestro,
            _ => return None,
        };
        Some(network)
    }

    /// The network from the leading digits (IIN ranges); separators are ignored. Longest-prefix
    /// rules come first, and Maestro's broad ranges last, so Mastercard and Mir win.
    pub fn detect(number: &str) -> Option<Self> {
        let digits = digits_of(number);
        Self::from_digits(&digits)
    }

    fn from_digits(digits: &str) -> Option<Self> {
        if digits.len() < 2 {
            return None;
        }
        let prefix = |n: usize| -> i64 {
            digits
                .get(..n)
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(-1)
        };
        let two = prefix(2);
        let three = prefix(3);
        let four = prefix(4);
        let network = if digits.len() >= 4 && (2200..=2204).contains(&four) {
            CardNetwork::Mir
        } else if (digits.len() >= 4 && (2221..=2720).contains(&four)) || (51..=55).contains(&two) {
            CardNetwork::Mastercard
        } else if two == 34 || two == 37 {
            CardNetwork::Amex
        } else if digits.starts_with('4') {
            CardNetwork::Visa
        } else if digits.len() >= 4 && (3528..=3589).contains(&four) {
            CardNetwork::Jcb
        } else if digits.starts_with("6011")
            || digits.starts_with("65")
            || (644..=649).contains(&three)
        {
            CardNetwork::Discover
        } else if digits.starts_with("62") {
            CardNetwork::UnionPay
        } else if (300..=305).contains(&three) || two == 36 || two == 38 || two == 39 {
            CardNetwork::DinersClub
        } else if two == 50 || (56..=69).contains(&two) {
            CardNetwork::Maestro
        } else {
            return None;
        };
        Some(network)
    }

    /// How many digits the network issues.
    pub fn lengths(self) -> RangeInclusive<usize> {
        match self {
            CardNetwork::Mastercard => 16..=16,
            CardNetwork::Amex => 15..=15,
            CardNetwork::Visa => 13..=19,
            CardNetwork::UnionPay | CardNetwork::DinersClub => 14..=19,
            CardNetwork::Mir | CardNetwork::Jcb | CardNetwork::Discover => 16..=19,
            CardNetwork::Maestro => MIN_NUMBER_DIGITS..=MAX_NUMBER_DIGITS,
        }
    }

    /// The length nearly every card of the network has. A number of this length whose check
    /// digit holds is taken as whole; a network with no such length (Maestro and UnionPay
    /// commonly issue 16 to 19 digits) is whole only at its longest.
    fn usual_length(self) -> Option<usize> {
        match self {
            CardNetwork::Amex => Some(15),
            CardNetwork::DinersClub => Some(14),
            CardNetwork::Visa
            | CardNetwork::Mastercard
            | CardNetwork::Mir
            | CardNetwork::Jcb
            | CardNetwork::Discover => Some(16),
            CardNetwork::UnionPay | CardNetwork::Maestro => None,
        }
    }

    /// The groups the network prints. American Express prints 4-6-5 and Diners Club 4-6-4;
    /// the rest print fours. The network decides, not the length, so a number does not regroup
    /// under the hand as it grows.
    fn groups(self) -> &'static [u8] {
        match self {
            CardNetwork::Amex => &[4, 6, 5],
            CardNetwork::DinersClub => &[4, 6, 4, 5],
            _ => &FOURS,
        }
    }

    fn code_digits(self) -> usize {
        match self {
            CardNetwork::Amex => 4,
            _ => 3,
        }
    }
}

/// How a card of one network is written, from its number or from its stored `brand`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardFormat {
    pub network: Option<CardNetwork>,
    /// Group sizes covering `max_digits`, as the network prints them.
    pub groups: Vec<u8>,
    /// The longest number the network issues; 19 when the network is not known.
    pub max_digits: usize,
    /// The length a masked number is drawn at (`•••• •••• •••• 4242`).
    pub printed_digits: usize,
    /// The longest security code the card can have; 4 when the network is not known.
    pub code_digits: usize,
}

impl CardFormat {
    pub fn of(network: Option<CardNetwork>) -> Self {
        let max_digits = network.map_or(MAX_NUMBER_DIGITS, |network| *network.lengths().end());
        let source = network.map_or(&FOURS[..], CardNetwork::groups);
        let mut groups = Vec::with_capacity(source.len());
        let mut covered = 0;
        for &size in source {
            if covered >= max_digits {
                break;
            }
            let size = (size as usize).min(max_digits - covered);
            groups.push(size as u8);
            covered += size;
        }
        Self {
            network,
            groups,
            max_digits,
            printed_digits: network.and_then(CardNetwork::usual_length).unwrap_or(16),
            code_digits: network.map_or(*CODE_DIGITS.end(), CardNetwork::code_digits),
        }
    }
}

/// A number as typed so far: how to write it, and whether it reads as a whole card number.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NumberInspection {
    pub format: CardFormat,
    /// The number cannot take another digit or is a checked number of the network's usual
    /// length: the form may move on to the next field.
    pub complete: bool,
    /// The network issues numbers this long (12 to 19 digits when the network is not known).
    pub valid_length: bool,
    /// The Luhn check digit holds; false below 12 digits.
    pub checksum_valid: bool,
    /// Core stores a number of this many digits (12 to 19); it refuses any other.
    pub storable: bool,
}

pub fn inspect(number: &str) -> NumberInspection {
    let digits = digits_of(number);
    let network = CardNetwork::from_digits(&digits);
    let format = CardFormat::of(network);
    let count = digits.len();
    let checksum_valid = count >= MIN_NUMBER_DIGITS && luhn(&digits);
    let valid_length = network
        .map_or(MIN_NUMBER_DIGITS..=MAX_NUMBER_DIGITS, CardNetwork::lengths)
        .contains(&count);
    let usual = network.and_then(CardNetwork::usual_length);
    let complete = count >= format.max_digits || (usual == Some(count) && checksum_valid);
    NumberInspection {
        format,
        complete,
        valid_length,
        checksum_valid,
        storable: (MIN_NUMBER_DIGITS..=MAX_NUMBER_DIGITS).contains(&count),
    }
}

/// The name a card gets when none is typed: its network and last four digits, as its face
/// prints them masked (`Visa •••• 1111`), or the last four alone for a network Core does not
/// know. A card is told apart by these; a name typed by hand is optional.
pub fn default_title(network: Option<CardNetwork>, last4: &str) -> String {
    match network {
        Some(network) => format!("{} •••• {last4}", network.display_name()),
        None => format!("•••• {last4}"),
    }
}

/// The name [`default_title`] gives, or that name numbered to stay unique in its group
/// (`Visa •••• 1111 (2)`): a name Core chose, which it may choose again.
pub fn is_default_title(title: &str, network: Option<CardNetwork>, last4: &str) -> bool {
    let base = default_title(network, last4);
    let Some(rest) = title.strip_prefix(base.as_str()) else {
        return false;
    };
    rest.is_empty()
        || rest
            .strip_prefix(" (")
            .and_then(|rest| rest.strip_suffix(')'))
            .is_some_and(|number| !number.is_empty() && number.bytes().all(|b| b.is_ascii_digit()))
}

/// `base`, or `base (2)`, `base (3)` and on: the first name `taken` does not refuse.
pub fn unique_title(base: &str, mut taken: impl FnMut(&str) -> bool) -> String {
    if !taken(base) {
        return base.to_string();
    }
    (2..)
        .map(|number| format!("{base} ({number})"))
        .find(|candidate| !taken(candidate))
        .expect("an unbounded range always finds a free name")
}

/// The number as Core stores it, digits only; refused outside 12 to 19 digits.
pub fn normalize_number(value: &str) -> Option<String> {
    let digits = digits_of(value);
    (MIN_NUMBER_DIGITS..=MAX_NUMBER_DIGITS)
        .contains(&digits.len())
        .then(|| digits.to_string())
}

/// The security code as Core stores it, digits only; refused outside 3 or 4 digits.
pub fn normalize_code(value: &str) -> Option<String> {
    let digits = digits_of(value);
    CODE_DIGITS
        .contains(&digits.len())
        .then(|| digits.to_string())
}

fn digits_of(value: &str) -> Zeroizing<String> {
    Zeroizing::new(value.chars().filter(char::is_ascii_digit).collect())
}

fn luhn(digits: &str) -> bool {
    let sum: u32 = digits
        .bytes()
        .rev()
        .enumerate()
        .map(|(index, byte)| {
            let digit = u32::from(byte - b'0');
            if index % 2 == 1 {
                let doubled = digit * 2;
                if doubled > 9 {
                    doubled - 9
                } else {
                    doubled
                }
            } else {
                digit
            }
        })
        .sum();
    sum % 10 == 0
}

#[cfg(test)]
mod tests;
