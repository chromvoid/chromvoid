import Foundation

/// Core's payment card rules, through air-ffi: the ones Android uses and the vault applies on
/// save. The network, how it groups a number, its lengths and code length, and whether a
/// number reads as whole. Pure and immediate functions of text already typed; nothing here
/// reads or saves the vault.
public enum PaymentCardRules {
  /// `number` may carry separators; only its digits are read.
  public static func inspect(_ number: String) -> AirPaymentCardNumber {
    inspectPaymentCardNumber(number: number)
  }

  /// The format of a stored card from its `brand`, before its number is read.
  public static func format(brand: String) -> AirPaymentCardFormat {
    paymentCardFormat(brand: brand)
  }

  /// The name Core gives a card saved without one: `Visa •••• 1111`.
  public static func defaultTitle(brand: String, last4: String) -> String {
    paymentCardDefaultTitle(brand: brand, last4: last4)
  }
}
