import ChromVoidBridge
import SwiftUI
import UIKit

/// Entry icons of the vault icon store, loaded in batches and kept for one vault session.
/// The catalog asks for the digests of every page it shows; rows read `icon(for:)`. A digest
/// the store does not know, or an image that does not decode, is remembered as missing so it
/// is never requested again. A failed batch is forgotten, so the next page asks for it anew.
@MainActor
@Observable
public final class CredentialIconCache {
  public struct Icon {
    public let image: UIImage
    /// The background the icon was drawn for, when the store carries one.
    public let background: Color?
  }
  public private(set) var icons: [String: Icon] = [:]
  @ObservationIgnored private var pending: Set<String> = []
  @ObservationIgnored private var missing: Set<String> = []
  @ObservationIgnored private let store: any CredentialIconStore
  @ObservationIgnored private let generation: UInt64
  /// The Core limit per `passmanager:icon:getMany` call.
  static let batchSize = 64

  public init(store: any CredentialIconStore, generation: UInt64) {
    self.store = store
    self.generation = generation
  }

  public func icon(for ref: String?) -> Icon? {
    ref.flatMap { icons[$0] }
  }

  public func request(_ refs: [String]) {
    let wanted = Set(refs).subtracting(icons.keys).subtracting(pending).subtracting(missing)
    guard !wanted.isEmpty else { return }
    pending.formUnion(wanted)
    let sorted = wanted.sorted()
    for start in stride(from: 0, to: sorted.count, by: Self.batchSize) {
      let batch = Array(sorted[start..<min(start + Self.batchSize, sorted.count)])
      Task { [weak self, store, generation] in
        let response = try? await store.credentialIcons(batch, generation: generation)
        guard let self else { return }
        self.pending.subtract(batch)
        guard let response else { return }
        for record in response.icons {
          if let data = Data(base64Encoded: record.contentBase64), let image = UIImage(data: data) {
            self.icons[record.iconRef] = Icon(
              image: image, background: record.backgroundColor.flatMap(Self.color))
          } else {
            self.missing.insert(record.iconRef)
          }
        }
        self.missing.formUnion(response.missingIconRefs)
      }
    }
  }

  /// `#RRGGBB` or `#RRGGBBAA` as the icon store writes it; anything else is no background.
  static func color(_ hex: String) -> Color? {
    var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6 || text.count == 8, let value = UInt64(text, radix: 16) else {
      return nil
    }
    let shift: UInt64 = text.count == 8 ? 8 : 0
    let alpha = text.count == 8 ? Double(value & 0xFF) / 255 : 1
    return Color(
      red: Double((value >> (16 + shift)) & 0xFF) / 255,
      green: Double((value >> (8 + shift)) & 0xFF) / 255,
      blue: Double((value >> shift) & 0xFF) / 255, opacity: alpha)
  }
}
