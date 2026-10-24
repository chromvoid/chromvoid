import Foundation
import SwiftUI
import os

/// Distinguishes catalog copy from user content in mixed lists, such as website grouping.
public enum AirText: Equatable, Sendable {
  case key(String)
  case verbatim(String)
}

/// Presentation models retain canonical catalog keys. Resolve them here at display time;
/// copy/export actions pass their selected locale explicitly. Never pass user content as a key.
struct AirCopy {
  let locale: Locale

  private struct TranslationKey: Hashable, Sendable {
    let locale: Locale
    let text: String
  }

  // LocalizedStringResource can reread string tables on each lookup. Share only
  // immutable catalog copy across renders, keyed by the complete selected locale.
  private static let translations = OSAllocatedUnfairLock(initialState: [TranslationKey: String]())

  func date(_ value: Date) -> String { value.formatted(.dateTime.locale(locale)) }

  func byteCount(_ value: Int64) -> String {
    value.formatted(.byteCount(style: .file).locale(locale))
  }

  func count(_ value: Int) -> String { value.formatted(.number.locale(locale)) }

  func text(_ key: String) -> String {
    Self.translations.withLock { translations in
      let cacheKey = TranslationKey(locale: locale, text: key)
      if let value = translations[cacheKey] { return value }
      let value = String(
        localized: LocalizedStringResource(
          String.LocalizationValue(key), locale: locale, bundle: .atURL(Bundle.module.bundleURL)))
      // Eviction affects lookup cost only; Foundation remains the translation owner.
      if translations.count >= 2048 { translations.removeAll(keepingCapacity: true) }
      translations[cacheKey] = value
      return value
    }
  }

  /// Catalog copy with placeholders (`"Copy: %@"`): the translation owns word order and
  /// punctuation, so callers never concatenate localized fragments.
  func format(_ key: String, _ arguments: CVarArg...) -> String {
    String(format: text(key), locale: locale, arguments: arguments)
  }

  func text(_ value: AirText) -> String {
    switch value {
    case .key(let key): text(key)
    case .verbatim(let value): value
    }
  }
}

/// Reads the environment each time SwiftUI renders; changing language preserves view identity.
@propertyWrapper
struct AirLocalizedCopy: DynamicProperty {
  @Environment(\.locale) private var locale
  var wrappedValue: AirCopy { AirCopy(locale: locale) }
}
