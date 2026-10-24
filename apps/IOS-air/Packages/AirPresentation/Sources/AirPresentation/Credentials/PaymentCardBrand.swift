import ChromVoidBridge
import SwiftUI

/// Card networks as Core names them in the `brand` field. Core decides the network from a
/// number's leading digits and reads the spellings imports carry (`PaymentCardRules`); this
/// type names and draws it.
public enum PaymentCardBrand: String, CaseIterable, Sendable {
  case visa, mastercard, mir, amex, unionpay, jcb, discover, dinersclub, maestro

  public var wire: String { rawValue }

  /// Core's spelling of a network; nil names none.
  init?(network: String?) {
    guard let network, let brand = PaymentCardBrand(rawValue: network) else { return nil }
    self = brand
  }

  /// A stored `brand` as Core reads it: `unknown` and unrecognised names are no network.
  public init?(wire: String) {
    self.init(network: PaymentCardRules.format(brand: wire).network)
  }

  /// The network the digits typed so far name.
  public static func detect(_ number: String) -> PaymentCardBrand? {
    PaymentCardBrand(network: PaymentCardRules.inspect(number).format.network)
  }

  public var name: String {
    switch self {
    case .visa: "Visa"
    case .mastercard: "Mastercard"
    case .mir: "Мир"
    case .amex: "American Express"
    case .unionpay: "UnionPay"
    case .jcb: "JCB"
    case .discover: "Discover"
    case .dinersclub: "Diners Club"
    case .maestro: "Maestro"
    }
  }
}
