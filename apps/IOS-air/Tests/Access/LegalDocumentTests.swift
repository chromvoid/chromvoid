import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct LegalDocumentTests {
  @Test func aboutOpensThePublishedDocuments() throws {
    #expect(LegalDocument.allCases == [.privacyPolicy, .termsOfService])
    let privacy = try #require(LegalDocument.privacyPolicy.url)
    let terms = try #require(LegalDocument.termsOfService.url)
    #expect(privacy.absoluteString == "https://chromvoid.com/en/legal/privacy-policy/")
    #expect(terms.absoluteString == "https://chromvoid.com/en/legal/terms-of-service-eula/")
    let russian = AirCopy(locale: Locale(identifier: "ru"))
    #expect(russian.text(LegalDocument.privacyPolicy.title) == "Политика конфиденциальности")
    #expect(russian.text(LegalDocument.termsOfService.title) == "Условия использования")
  }

  @Test(arguments: [
    ("en", "Terms of Service", "Privacy Policy"),
    ("ru", "Условиями использования", "Политикой конфиденциальности"),
  ])
  func setupNoticeLinksBothDocuments(language: String, terms: String, privacy: String) {
    let notice = LegalDocument.setupNotice(AirCopy(locale: Locale(identifier: language)))
    let links = notice.runs.compactMap { run in
      run.link.map { (text: String(notice[run.range].characters), url: $0) }
    }
    #expect(links.map(\.text) == [terms, privacy])
    let documents: [LegalDocument] = [.termsOfService, .privacyPolicy]
    #expect(links.map(\.url) == documents.map(\.url))
    // The link syntax never reaches the screen.
    #expect(!String(notice.characters).contains("]("))
  }
}
