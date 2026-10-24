import ChromVoidBridge
import SwiftUI

/// A protected field of the credential. Label above value, trailing action strip. The value
/// is dots until shown; the strip keeps show and copy in a fixed order so the hand learns
/// where copy lives. Changing the value belongs to the edit form. A read in flight changes
/// nothing on screen: the model drops a second action until it lands, so no control dims or
/// swaps for the few milliseconds it takes, which read as every icon blinking.
struct CredentialSecretRow: View {
  @AirLocalizedCopy private var copy
  var model: CredentialDetailModel
  /// The Core secret type: `password`, `card_pan`, `card_cvv` or `note`.
  let type: String
  /// Whether the caption is shown; the note section already names its one row.
  var titled = true

  var body: some View {
    let busy = !model.canInteract
    let shown = model.secrets[type]
    DetailRow(label: titled ? copy.text(secretLabel(type)) : nil) {
      // Both states share one font and a one-line minimum, so toggling never moves the row.
      if let shown {
        // The number reads in the network's groups here as it does on the card.
        let display =
          type == "card_pan" ? PaymentCardText.grouped(PaymentCardText.digits(shown)) : shown
        Text(shown.isEmpty ? copy.text("Empty value") : display)
          .font(type == "note" ? .body : .system(.body, design: .monospaced))
          .foregroundStyle(shown.isEmpty ? .secondary : .primary)
          .frame(minHeight: 22, alignment: .leading)
          // No `textSelection`: the system Copy would put the value on the general clipboard,
          // past the 15 s, local-only copy this row's button makes. Copy is the way out.
          .accessibilityIdentifier("secretValue_" + type)
      } else {
        Text("••••••••")
          .font(type == "note" ? .body : .system(.body, design: .monospaced))
          .foregroundStyle(.secondary)
          .frame(minHeight: 22, alignment: .leading)
          .accessibilityLabel(copy.text("Hidden value"))
      }
      if let issue = model.secretIssues[type] {
        Text(copy.text(issue)).font(.footnote).foregroundStyle(.secondary)
      }
    } actions: {
      RowAction(
        symbol: shown == nil ? "eye" : "eye.slash",
        title: copy.format(shown == nil ? "Show: %@" : "Hide: %@", copy.text(secretLabel(type))),
        identifier: "showSecret_" + type, disabled: busy
      ) { model.reveal(type) }
      RowAction(
        symbol: "doc.on.doc", title: copy.format("Copy: %@", copy.text(secretLabel(type))),
        identifier: "copySecret_" + type, disabled: busy
      ) { model.copySecret(type) }
    }
  }
}

/// The copy key of a secret type's caption, shared with the editor.
func secretLabel(_ type: String) -> String {
  switch type {
  case "password": "Password"
  case "card_pan": "Card number"
  case "card_cvv": "Security code"
  default: "Private note"
  }
}

#if DEBUG
  #Preview("Secrets") {
    let model = CredentialPreviewFixtures.detailModel()
    List {
      Section { CredentialSecretRow(model: model, type: "password") }
      Section("Private note") { CredentialSecretRow(model: model, type: "note", titled: false) }
    }
    .airCanvas()
  }
#endif
