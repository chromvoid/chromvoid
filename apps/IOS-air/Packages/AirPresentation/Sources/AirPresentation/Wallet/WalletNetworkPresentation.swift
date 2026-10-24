import ChromVoidBridge
import Foundation

/// Native display/input metadata matching the existing wallet UI. Core validates and authorizes transfers.
public struct WalletNetworkPresentation: Sendable {
  public let network: String
  public let symbol: String
  public let amountUnit: String
  public let fractionDigits: Int
  public let multipleOutputs: Bool
  public let supportsComment: Bool

  public static func profile(for network: String) -> Self? {
    switch network {
    case "bitcoin":
      Self(
        network: network, symbol: "BTC", amountUnit: "satoshi", fractionDigits: 8,
        multipleOutputs: true, supportsComment: false)
    case "ton":
      Self(
        network: network, symbol: "TON", amountUnit: "nanoton", fractionDigits: 9,
        multipleOutputs: false, supportsComment: true)
    case "ethereum":
      Self(
        network: network, symbol: "ETH", amountUnit: "wei", fractionDigits: 18,
        multipleOutputs: false, supportsComment: false)
    case "solana":
      Self(
        network: network, symbol: "SOL", amountUnit: "lamport", fractionDigits: 9,
        multipleOutputs: false, supportsComment: false)
    default: nil
    }
  }
  /// Human name of the network; proper nouns, so not localized.
  public var displayName: String { Self.displayName(for: network) }
  public static func displayName(for network: String) -> String {
    switch network {
    case "bitcoin": "Bitcoin"
    case "ton": "TON"
    case "ethereum": "Ethereum"
    case "solana": "Solana"
    default: network
    }
  }
  /// Display order of the networks inside one universal wallet.
  public static let order = ["ton", "bitcoin", "ethereum", "solana"]
  public static func rank(_ network: String) -> Int {
    order.firstIndex(of: network) ?? order.count
  }
  /// Total balance of a cached response as a decimal with the network symbol.
  public func formattedTotal(_ balance: WalletBalanceGetResponse) -> String {
    formatted(balance.balance.total)
  }
  public func isAvailable(in status: WalletStatusResponse) -> Bool {
    status.enabled
      && status.networks.contains {
        $0.network == network && $0.enabled && $0.broadcastEnabled && $0.providerStatus == .ready
          && $0.capabilities?.contains {
            $0.id == network + "_native_transfer" && $0.state == .ready
          } == true
      }
  }
  /// Decimal keyboard input only; no grouping, exponent, floating point or rounded amounts.
  public func baseUnits(from value: String) -> String? {
    let value = value.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(
      of: ",", with: ".")
    let parts = value.split(separator: ".", omittingEmptySubsequences: false)
    guard (1...2).contains(parts.count) else { return nil }
    let whole = String(parts[0])
    let fraction = parts.count == 2 ? String(parts[1]) : ""
    guard !(whole.isEmpty && fraction.isEmpty), digits(whole), digits(fraction),
      fraction.count <= fractionDigits
    else { return nil }
    let units = whole + fraction + String(repeating: "0", count: fractionDigits - fraction.count)
    let normalized = units.drop { $0 == "0" }
    return normalized.isEmpty ? "0" : String(normalized)
  }
  public func decimal(from units: String) -> String? {
    guard !units.isEmpty, digits(units) else { return nil }
    let padded = String(repeating: "0", count: max(0, fractionDigits + 1 - units.count)) + units
    let split = padded.index(padded.endIndex, offsetBy: -fractionDigits)
    let whole = padded[..<split].drop { $0 == "0" }
    let fraction = String(padded[split...].reversed().drop { $0 == "0" }.reversed())
    return (whole.isEmpty ? "0" : String(whole)) + (fraction.isEmpty ? "" : "." + fraction)
  }
  public func formatted(_ units: String) -> String {
    if let decimal = decimal(from: units) { return decimal + " " + symbol }
    return units + " " + amountUnit
  }
  private func digits(_ value: String) -> Bool { value.utf8.allSatisfy { (48...57).contains($0) } }
}
