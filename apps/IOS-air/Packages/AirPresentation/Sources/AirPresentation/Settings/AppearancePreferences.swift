import Foundation
import Observation
import SwiftUI

/// Nonsecret Apple presentation preferences; vault authority remains in the runtime.
@MainActor
@Observable
public final class AppearancePreferences {
  public enum Theme: String, CaseIterable {
    case system, light, dark

    var label: String {
      switch self {
      case .system: "System"
      case .light: "Light"
      case .dark: "Dark"
      }
    }

    var colorScheme: ColorScheme? {
      switch self {
      case .system: nil
      case .light: .light
      case .dark: .dark
      }
    }
  }

  public enum Language: String, CaseIterable {
    case system
    case english = "en"
    case russian = "ru"

    var label: String {
      switch self {
      case .system: "System"
      case .english: "English"
      case .russian: "Русский"
      }
    }

    func locale(system: Locale) -> Locale {
      self == .system ? system : Locale(identifier: rawValue)
    }
  }

  public private(set) var theme: Theme
  public private(set) var language: Language
  private let defaults: UserDefaults

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    theme = Theme(rawValue: defaults.string(forKey: "air.appearance.theme") ?? "") ?? .system
    language =
      Language(rawValue: defaults.string(forKey: "air.appearance.language") ?? "") ?? .system
  }

  public func setTheme(_ theme: Theme) {
    self.theme = theme
    defaults.set(theme.rawValue, forKey: "air.appearance.theme")
  }

  public func setLanguage(_ language: Language) {
    self.language = language
    defaults.set(language.rawValue, forKey: "air.appearance.language")
  }
}
