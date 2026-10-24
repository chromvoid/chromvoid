import ChromVoidBridge
import SwiftUI

/// One website of a login: the value, open in the browser when it is a web origin, and copy.
struct CredentialWebsiteRow: View {
  @AirLocalizedCopy private var copy
  var model: CredentialDetailModel
  let website: String
  /// Position in the credential's website list; only the first row carries the caption.
  let index: Int
  @Environment(\.openURL) private var openURL

  var body: some View {
    DetailRow(label: index == 0 ? copy.text("Website") : nil) {
      Text(website).textSelection(.enabled)
    } actions: {
      if let url = Self.browserURL(website) {
        RowAction(
          symbol: "safari", title: copy.format("Open: %@", website), identifier: nil,
          disabled: false
        ) { openURL(url) }
      }
      RowAction(
        symbol: "doc.on.doc", title: copy.format("Copy: %@", website), identifier: nil,
        disabled: !model.canInteract
      ) { model.copyMetadata(.website(index)) }
    }
  }

  /// Only web origins open outside the app; everything else stays a copyable value.
  static func browserURL(_ website: String) -> URL? {
    let trimmed = website.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !trimmed.contains(" ") else { return nil }
    let candidate = trimmed.contains("://") ? trimmed : "https://" + trimmed
    guard let url = URL(string: candidate), let scheme = url.scheme?.lowercased(),
      ["http", "https"].contains(scheme), let host = url.host, host.contains(".")
    else { return nil }
    return url
  }
}

#if DEBUG
  #Preview("Websites") {
    let model = CredentialPreviewFixtures.detailModel()
    List {
      Section("Websites") {
        CredentialWebsiteRow(model: model, website: "https://example.org", index: 0)
        CredentialWebsiteRow(model: model, website: "mail.example.org", index: 1)
        CredentialWebsiteRow(model: model, website: "intranet", index: 2)
      }
    }
    .airCanvas()
  }
#endif
