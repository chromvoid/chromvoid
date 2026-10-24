import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct AppearancePreferencesTests {
  @Test func selectionSurvivesRelaunchAndSystemSelectionUsesCurrentEnvironment() throws {
    let domain = "air-appearance-test-" + UUID().uuidString
    let defaults = try #require(UserDefaults(suiteName: domain))
    defer { defaults.removePersistentDomain(forName: domain) }
    let preferences = AppearancePreferences(defaults: defaults)
    #expect(preferences.theme == .system && preferences.language == .system)
    preferences.setTheme(.dark)
    preferences.setLanguage(.russian)
    let relaunched = AppearancePreferences(defaults: defaults)
    #expect(relaunched.theme == .dark && relaunched.language == .russian)
    #expect(relaunched.language.locale(system: Locale(identifier: "en")).identifier == "ru")
    relaunched.setLanguage(.system)
    #expect(relaunched.language.locale(system: Locale(identifier: "en_GB")).identifier == "en_GB")
    #expect(relaunched.language.locale(system: Locale(identifier: "ru_RU")).identifier == "ru_RU")
    #expect(preferences.theme == .dark)
  }

  @Test func catalogUsesSelectedLanguageAndNeverTranslatesUserGroupNames() throws {
    let english = AirCopy(locale: Locale(identifier: "en"))
    let russian = AirCopy(locale: Locale(identifier: "ru"))
    #expect(english.text("Name") == "Name")
    #expect(russian.text("Name") == "Название")
    let userGroup = try #require(CredentialsModel.Grouping.website.title(for: "Name"))
    let emptyGroup = try #require(CredentialsModel.Grouping.website.title(for: ""))
    #expect(russian.text(userGroup) == "Name")
    #expect(russian.text(emptyGroup) == "Без сайта")
    #expect(english.text(emptyGroup) == "No website")
    #expect(String(format: russian.text("Stored: %lld"), Int64(12)) == "Сохранено: 12")
    // Revisit warmed keys after switching language; user content still bypasses lookup.
    #expect(english.text("Name") == "Name")
    #expect(russian.text("Name") == "Название")
    #expect(russian.text(.verbatim("Name")) == "Name")
  }

  @Test func datesFileSizesAndCountsFollowTheSelectedLanguage() throws {
    let english = AirCopy(locale: Locale(identifier: "en_US"))
    let russian = AirCopy(locale: Locale(identifier: "ru_RU"))
    let date = try #require(
      Calendar(identifier: .gregorian).date(
        from: DateComponents(year: 2010, month: 5, day: 2, hour: 12)))
    #expect(english.date(date).contains("5/2/2010"))
    #expect(russian.date(date).contains("02.05.2010"))
    #expect(english.byteCount(1_500_000).contains("1.5"))
    #expect(english.byteCount(1_500_000).contains("MB"))
    #expect(russian.byteCount(1_500_000).contains("1,5"))
    #expect(russian.byteCount(1_500_000).contains("МБ"))
    #expect(english.count(12_345) == "12,345")
    #expect(russian.count(12_345).filter { !$0.isWhitespace } == "12345")
    #expect(english.count(12_345) != russian.count(12_345))
  }

}
