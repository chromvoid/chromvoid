import Foundation

/// The published legal documents. Settings → About opens them in the browser and the first-run
/// setup says they apply; their addresses live only here. The site publishes them in English.
enum LegalDocument: CaseIterable, Identifiable {
  case privacyPolicy
  case termsOfService

  var id: Self { self }

  var address: String {
    switch self {
    case .privacyPolicy: "https://chromvoid.com/en/legal/privacy-policy/"
    case .termsOfService: "https://chromvoid.com/en/legal/terms-of-service-eula/"
    }
  }

  var url: URL? { URL(string: address) }

  /// The About row's catalog key.
  var title: String {
    switch self {
    case .privacyPolicy: "Privacy Policy"
    case .termsOfService: "Terms of Service"
    }
  }

  var symbol: String {
    switch self {
    case .privacyPolicy: "hand.raised"
    case .termsOfService: "doc.plaintext"
    }
  }

  var accessibilityIdentifier: String {
    switch self {
    case .privacyPolicy: "openPrivacyPolicy"
    case .termsOfService: "openTermsOfService"
    }
  }

  /// The first-run line under the setup action: nothing to accept, only that both documents apply.
  /// The translation owns the sentence and where its two links fall; the addresses come from here.
  static func setupNotice(_ copy: AirCopy) -> AttributedString {
    let markdown = copy.format(
      "By continuing, you agree to the [Terms of Service](%1$@) and acknowledge the [Privacy Policy](%2$@).",
      termsOfService.address, privacyPolicy.address)
    // A translation that breaks the link syntax still reads as a sentence, only without links.
    let options = AttributedString.MarkdownParsingOptions(
      interpretedSyntax: .inlineOnlyPreservingWhitespace)
    return (try? AttributedString(markdown: markdown, options: options))
      ?? AttributedString(markdown)
  }
}
