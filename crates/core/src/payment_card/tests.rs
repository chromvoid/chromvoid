use super::*;

#[test]
fn networks_follow_iin_ranges() {
    let cases = [
        ("4111 1111 1111 1111", Some(CardNetwork::Visa)),
        ("5555555555554444", Some(CardNetwork::Mastercard)),
        ("2223000048400011", Some(CardNetwork::Mastercard)),
        ("2200000000000004", Some(CardNetwork::Mir)),
        ("2204123412341234", Some(CardNetwork::Mir)),
        ("378282246310005", Some(CardNetwork::Amex)),
        ("6200000000000005", Some(CardNetwork::UnionPay)),
        ("3530111333300000", Some(CardNetwork::Jcb)),
        ("6011111111111117", Some(CardNetwork::Discover)),
        ("6455000000000000", Some(CardNetwork::Discover)),
        ("30569309025904", Some(CardNetwork::DinersClub)),
        ("6759649826438453", Some(CardNetwork::Maestro)),
        ("5018000000000000", Some(CardNetwork::Maestro)),
        ("9", None),
        ("1234567812345678", None),
    ];
    for (number, expected) in cases {
        assert_eq!(CardNetwork::detect(number), expected, "{number}");
    }
}

#[test]
fn wire_spelling_round_trips_and_unknown_is_no_network() {
    for network in CardNetwork::ALL {
        assert_eq!(CardNetwork::from_wire(network.wire()), Some(network));
    }
    assert_eq!(CardNetwork::from_wire(" VISA "), Some(CardNetwork::Visa));
    // Names other managers export.
    assert_eq!(
        CardNetwork::from_wire("American Express"),
        Some(CardNetwork::Amex)
    );
    assert_eq!(
        CardNetwork::from_wire("Diners Club"),
        Some(CardNetwork::DinersClub)
    );
    assert_eq!(
        CardNetwork::from_wire("China UnionPay"),
        Some(CardNetwork::UnionPay)
    );
    assert_eq!(CardNetwork::from_wire("Мир"), Some(CardNetwork::Mir));
    assert_eq!(
        CardNetwork::from_wire("Master-Card"),
        Some(CardNetwork::Mastercard)
    );
    assert_eq!(CardNetwork::from_wire("RuPay"), None);
    assert_eq!(CardNetwork::from_wire(UNKNOWN_NETWORK), None);
    assert_eq!(CardNetwork::from_wire(""), None);
}

#[test]
fn groups_are_the_networks_and_cover_its_longest_number() {
    let amex = CardFormat::of(Some(CardNetwork::Amex));
    assert_eq!(amex.groups, [4, 6, 5]);
    assert_eq!(
        (amex.max_digits, amex.printed_digits, amex.code_digits),
        (15, 15, 4)
    );
    let diners = CardFormat::of(Some(CardNetwork::DinersClub));
    assert_eq!(diners.groups, [4, 6, 4, 5]);
    assert_eq!(diners.printed_digits, 14);
    let mastercard = CardFormat::of(Some(CardNetwork::Mastercard));
    assert_eq!(mastercard.groups, [4, 4, 4, 4]);
    assert_eq!((mastercard.max_digits, mastercard.code_digits), (16, 3));
    let visa = CardFormat::of(Some(CardNetwork::Visa));
    assert_eq!(visa.groups, [4, 4, 4, 4, 3]);
    assert_eq!((visa.max_digits, visa.printed_digits), (19, 16));
    let unknown = CardFormat::of(None);
    assert_eq!(unknown.groups, [4, 4, 4, 4, 3]);
    assert_eq!(
        (
            unknown.max_digits,
            unknown.printed_digits,
            unknown.code_digits
        ),
        (19, 16, 4)
    );
    for network in CardNetwork::ALL {
        let format = CardFormat::of(Some(network));
        let covered: usize = format.groups.iter().map(|size| *size as usize).sum();
        assert_eq!(covered, format.max_digits, "{network:?}");
    }
}

#[test]
fn a_number_is_whole_at_its_usual_checked_length_or_at_its_longest() {
    // A checked sixteen-digit Visa is whole; the same length with a wrong check digit is not,
    // since the person may be typing a nineteen-digit one.
    let visa = inspect("4111 1111 1111 1111");
    assert!(visa.complete && visa.valid_length && visa.checksum_valid);
    let typo = inspect("4111111111111112");
    assert!(!typo.complete && typo.valid_length && !typo.checksum_valid);
    assert!(inspect("4111111111111111110").complete);
    // Mastercard issues only sixteen digits: whole there even when the check fails.
    let mastercard = inspect("5555555555554445");
    assert!(mastercard.complete && !mastercard.checksum_valid);
    assert!(inspect("378282246310005").complete);
    assert!(!inspect("37828224631000").complete);
    // Maestro commonly runs to nineteen digits: a checked sixteen is not yet whole.
    let maestro = inspect("6759649826438453");
    assert!(maestro.checksum_valid && maestro.valid_length && !maestro.complete);
    // Too short to judge.
    let short = inspect("4111 1111");
    assert!(!short.complete && !short.valid_length && !short.checksum_valid && !short.storable);
    assert_eq!(short.format.network, Some(CardNetwork::Visa));
    let empty = inspect("");
    assert_eq!(empty.format, CardFormat::of(None));
    assert!(!empty.complete);
}

#[test]
fn length_is_the_networks_and_twelve_to_nineteen_without_one() {
    assert!(!inspect("5555 5555 5555 44").valid_length);
    assert!(!inspect("37828224631000").valid_length);
    assert!(inspect("123456789012").valid_length);
    assert!(!inspect("12345678901").valid_length);
    // Core stores any 12 to 19 digits, whatever the network issues.
    let odd = inspect("5555 5555 5555 44");
    assert!(odd.storable && !odd.valid_length);
    assert!(!inspect(&"4".repeat(20)).storable);
}

#[test]
fn stored_values_are_digits_within_the_limits() {
    assert_eq!(
        normalize_number("4111-1111 1111 1111").as_deref(),
        Some("4111111111111111")
    );
    assert_eq!(normalize_number("41111111111"), None);
    assert_eq!(normalize_number(&"4".repeat(20)), None);
    assert_eq!(normalize_code(" 123 ").as_deref(), Some("123"));
    assert_eq!(normalize_code("12"), None);
    assert_eq!(normalize_code("12345"), None);
}

#[test]
fn a_card_is_named_by_its_network_and_last_four_and_kept_unique() {
    assert_eq!(
        default_title(Some(CardNetwork::Visa), "1111"),
        "Visa •••• 1111"
    );
    assert_eq!(
        default_title(Some(CardNetwork::Mir), "0004"),
        "Мир •••• 0004"
    );
    assert_eq!(default_title(None, "5678"), "•••• 5678");
    let visa = Some(CardNetwork::Visa);
    assert!(is_default_title("Visa •••• 1111", visa, "1111"));
    assert!(is_default_title("Visa •••• 1111 (3)", visa, "1111"));
    assert!(!is_default_title("Visa •••• 1111 (x)", visa, "1111"));
    assert!(!is_default_title("Visa •••• 1111 travel", visa, "1111"));
    assert!(!is_default_title("Travel", visa, "1111"));
    assert!(!is_default_title("Visa •••• 2222", visa, "1111"));
    let taken = ["Visa •••• 1111", "Visa •••• 1111 (2)"];
    assert_eq!(
        unique_title("Visa •••• 1111", |name| taken.contains(&name)),
        "Visa •••• 1111 (3)"
    );
    assert_eq!(
        unique_title("Visa •••• 2222", |name| taken.contains(&name)),
        "Visa •••• 2222"
    );
}
