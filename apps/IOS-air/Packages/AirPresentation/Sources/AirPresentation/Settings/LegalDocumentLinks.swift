import SwiftUI
import UIKit

/// About's rows for the published legal documents. They leave the app for the browser, so the
/// trailing mark is an outward arrow where the neighbouring rows show a chevron.
struct LegalDocumentLinks: View {
  @AirLocalizedCopy private var copy

  var body: some View {
    ForEach(LegalDocument.allCases) { document in
      if let url = document.url {
        Link(destination: url) {
          HStack(spacing: 8) {
            Label {
              Text(copy.text(document.title)).foregroundStyle(Color.primary)
            } icon: {
              Image(systemName: document.symbol)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.forward")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(Color(uiColor: .tertiaryLabel))
              .accessibilityHidden(true)
          }
        }
        .accessibilityIdentifier(document.accessibilityIdentifier)
      }
    }
  }
}
