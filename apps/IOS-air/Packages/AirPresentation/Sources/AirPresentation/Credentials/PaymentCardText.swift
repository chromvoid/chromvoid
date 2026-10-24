import ChromVoidBridge
import Foundation

/// A card number as the network prints it, in Core's groups: fours for most networks,
/// 4-6-5 for American Express, 4-6-4 for Diners Club.
enum PaymentCardText {
  /// The ASCII digits of `text`, the only ones Core reads.
  static func digits(_ text: String) -> String {
    text.filter { $0.isASCII && $0.isNumber }
  }

  static func grouped(_ digits: String, groups: [UInt32]) -> String {
    var rest = Substring(digits)
    var parts: [String] = []
    for size in groups where !rest.isEmpty {
      parts.append(String(rest.prefix(Int(size))))
      rest = rest.dropFirst(Int(size))
    }
    if !rest.isEmpty { parts.append(String(rest)) }
    return parts.joined(separator: " ")
  }

  /// `digits` grouped by the network they name.
  static func grouped(_ digits: String) -> String {
    grouped(digits, groups: PaymentCardRules.inspect(digits).format.groups)
  }

  /// A number drawn without its digits: dots at the network's usual length, then the last
  /// four, grouped as the network prints them (`•••• •••• •••• 4242`, `•••• •••••• •4242`).
  static func masked(last4: String?, format: AirPaymentCardFormat) -> String {
    let tail = last4.map { String($0.suffix(4)) } ?? "••••"
    let dots = String(repeating: "•", count: max(0, Int(format.printedDigits) - tail.count))
    return grouped(dots + tail, groups: format.groups)
  }
}

/// Typing on the card face, shared by the new-card form and the editor: what a keystroke
/// leaves in a field, and whether the field is done so focus can move on. The number follows
/// Core's rules; the expiry is read as the card prints it, `MM / YY`.
enum PaymentCardTyping {
  struct Result: Equatable {
    let value: String
    /// The field was just completed by typing forward.
    let done: Bool
  }

  /// Digits only, no more than the network issues; done once Core reads the number as whole.
  static func number(_ typed: String, previous: String) -> Result {
    let digits = PaymentCardText.digits(typed)
    let inspection = PaymentCardRules.inspect(digits)
    let value = String(digits.prefix(Int(inspection.format.maxDigits)))
    return Result(value: value, done: value.count > previous.count && inspection.complete)
  }

  /// `3` is March and reads `03`; two digits of a real month finish the field.
  static func month(_ typed: String, previous: String) -> Result {
    let digits = String(PaymentCardText.digits(typed).prefix(2))
    guard digits.count > previous.count else { return Result(value: digits, done: false) }
    if digits.count == 1, let first = digits.first, first >= "2" {
      return Result(value: "0" + digits, done: true)
    }
    return Result(value: digits, done: digits.count == 2 && PaymentCardExpiry.month(digits) != nil)
  }

  /// Two digits as printed or the full year. `20` waits: it may begin `2035`.
  static func year(_ typed: String, previous: String) -> Result {
    let digits = String(PaymentCardText.digits(typed).prefix(4))
    let grew = digits.count > previous.count
    return Result(
      value: digits, done: grew && (digits.count == 4 || (digits.count == 2 && digits != "20")))
  }

  /// No longer than the network's code; done at that length.
  static func code(_ typed: String, previous: String, limit: Int) -> Result {
    let digits = String(PaymentCardText.digits(typed).prefix(limit))
    return Result(value: digits, done: digits.count > previous.count && digits.count == limit)
  }

  /// Why the number cannot be saved, or nil. Core stores 12 to 19 digits.
  static func numberError(_ number: String) -> String? {
    number.isEmpty || PaymentCardRules.inspect(number).storable
      ? nil : "Enter the whole card number."
  }

  /// The name Core gives the card if none is typed, once the number is whole enough to store;
  /// else the stored card's, if the form edits one.
  static func titleHint(number: String, stored: PaymentCardMetadata? = nil) -> String? {
    let digits = PaymentCardText.digits(number)
    let inspection = PaymentCardRules.inspect(digits)
    if inspection.storable {
      return PaymentCardRules.defaultTitle(
        brand: inspection.format.network ?? stored?.brand ?? "", last4: String(digits.suffix(4)))
    }
    guard let stored, let last4 = stored.last4 else { return nil }
    return PaymentCardRules.defaultTitle(brand: stored.brand, last4: last4)
  }

  /// A number Core would store but no network issues as typed: worth a second look.
  static func numberWarning(_ number: String) -> String? {
    guard !number.isEmpty else { return nil }
    let inspection = PaymentCardRules.inspect(number)
    guard inspection.storable, !(inspection.validLength && inspection.checksumValid) else {
      return nil
    }
    return "This number does not pass the card check. Check the digits before saving."
  }
}
