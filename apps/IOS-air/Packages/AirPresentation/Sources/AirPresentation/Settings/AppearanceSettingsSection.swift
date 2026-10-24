import SwiftUI

struct AppearanceSettingsSection: View {
  @Environment(AppearancePreferences.self) private var preferences
  @AirLocalizedCopy private var copy

  var body: some View {
    Section(copy.text("Appearance")) {
      Picker(
        copy.text("Theme"),
        selection: Binding(get: { preferences.theme }, set: { preferences.setTheme($0) })
      ) {
        ForEach(AppearancePreferences.Theme.allCases, id: \.self) { theme in
          Text(copy.text(theme.label)).tag(theme)
        }
      }
      .accessibilityIdentifier("themeSetting")
      Picker(
        copy.text("Language"),
        selection: Binding(get: { preferences.language }, set: { preferences.setLanguage($0) })
      ) {
        ForEach(AppearancePreferences.Language.allCases, id: \.self) { language in
          Text(copy.text(language.label)).tag(language)
        }
      }
      .accessibilityIdentifier("languageSetting")
    }
  }
}
