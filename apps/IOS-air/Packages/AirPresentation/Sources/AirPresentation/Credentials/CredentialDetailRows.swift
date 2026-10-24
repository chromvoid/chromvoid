import ChromVoidBridge
import SwiftUI

/// One credential field: caption label, value block, trailing action strip.
struct DetailRow<Value: View, Actions: View>: View {
  let label: String?
  @ViewBuilder let value: Value
  @ViewBuilder let actions: Actions
  var body: some View {
    HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 3) {
        if let label { Text(label).font(.footnote).foregroundStyle(.secondary) }
        value
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 0) { actions }
        .labelStyle(.iconOnly)
        .fixedSize()
        .frame(minHeight: 44)
    }
    .padding(.vertical, 2)
    .animation(nil, value: label)
  }
}

/// One 44pt action of a row's trailing strip.
struct RowAction: View {
  let symbol: String
  let title: String
  let identifier: String?
  let disabled: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.body.weight(.medium))
        .symbolReplace()
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.borderless)
    .disabled(disabled)
    .accessibilityLabel(title)
    .accessibilityIdentifier(identifier ?? "")
  }
}

/// A plain value of the credential (username, cardholder, group, tags) with an optional copy.
struct CredentialMetadataRow: View {
  @AirLocalizedCopy private var copy
  var model: CredentialDetailModel
  /// The copy key of the caption.
  let label: String
  let value: String
  /// Set when the value can be copied; the copy goes through the model's clipboard.
  var field: CredentialDetailModel.MetadataField? = nil

  var body: some View {
    DetailRow(label: copy.text(label)) {
      Text(value.isEmpty ? copy.text("Not set") : value)
        .foregroundStyle(value.isEmpty ? .secondary : .primary)
        .textSelection(.enabled)
    } actions: {
      if let field, !value.isEmpty {
        RowAction(
          symbol: "doc.on.doc", title: copy.format("Copy: %@", copy.text(label)),
          identifier: nil, disabled: !model.canInteract
        ) { model.copyMetadata(field) }
      }
    }
  }
}

#if DEBUG
  #Preview("Rows") {
    let model = CredentialPreviewFixtures.detailModel()
    List {
      CredentialMetadataRow(model: model, label: "Username", value: "alice", field: .username)
      CredentialMetadataRow(model: model, label: "Group", value: "/")
      CredentialMetadataRow(model: model, label: "Tags", value: "")
      DetailRow(label: "Custom") {
        Text("A value with two actions")
      } actions: {
        RowAction(symbol: "safari", title: "Open", identifier: nil, disabled: false) {}
        RowAction(symbol: "doc.on.doc", title: "Copy", identifier: nil, disabled: false) {}
      }
    }
    .airCanvas()
  }
#endif
