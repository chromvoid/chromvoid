import ChromVoidBridge
import SwiftUI
import UIKit

/// A credential page for everyday use: identity on top, the fields you sign in with next,
/// one-time codes shown inline with their remaining time, then websites, card data, notes,
/// details and the rare actions at the bottom. Every row keeps its value readable and puts
/// the actions in a trailing 44pt strip so copy is always one tap away. The rows are
/// `CredentialSecretRow`, `CredentialMetadataRow`, `CredentialWebsiteRow` and the inline
/// `CredentialCodesSection`.
struct CredentialDetailView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialDetailModel
  let lock: () -> Void
  /// Set when the page is pushed from a catalog row so it can zoom out of that row.
  var zoom: Namespace.ID? = nil
  var body: some View {
    List {
      switch model.state {
      case .loading: ProgressView(copy.text("Loading credential…"))
      case .failed:
        Text(copy.text("Couldn’t load this credential."))
        Button(copy.text("Try again")) { model.reload() }
      case .missing: Text(copy.text("This credential is no longer available."))
      case .revoked: Text(copy.text("Vault locked"))
      case .ready:
        if let detail = model.detail { ready(detail) }
      }
    }
    .airCanvas()
    .animation(AirMotion.layout, value: model.secrets)
    .animation(AirMotion.layout, value: model.otp?.shown)
    .animation(AirMotion.layout, value: model.otp?.records.map(\.label))
    .animation(AirMotion.layout, value: model.state)
    .modifier(ZoomTarget(id: model.id, namespace: zoom))
    .privacySensitive()
    .navigationTitle(copy.text("Credential"))
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden(model.deletion == .deleting)
    .accessibilityIdentifier("credentialDetail")
    // After the page identifier, so the toast keeps its own for accessibility and tests.
    .airToast(
      model.copyFeedback == nil ? nil : copy.text("Copied. Expires in 15 seconds on this device."),
      systemImage: "checkmark", identifier: "credentialCopied"
    )
    .toolbar { toolbar }
    .alert(
      copy.text("Delete credential?"),
      isPresented: .presented({ model.deletion == .confirming }, close: { model.cancelDeletion() })
    ) {
      Button(copy.text("Delete"), role: .destructive) { model.confirmDeletion() }
        .accessibilityIdentifier("confirmDeleteCredential")
      Button(copy.text("Cancel"), role: .cancel, action: model.cancelDeletion)
    } message: {
      deleteMessage
    }
    .onChange(of: model.copyFeedback) { _, id in
      if id != nil {
        AirHaptics.confirm()
        UIAccessibility.post(
          notification: .announcement,
          argument: copy.text("Copied. Expires in 15 seconds on this device."))
      }
    }
    .task(id: model.copyFeedback) {
      guard let id = model.copyFeedback else { return }
      try? await Task.sleep(for: .seconds(3))
      if !Task.isCancelled { model.clearCopyFeedback(id) }
    }
    .sheet(item: .presence({ model.editor }, close: { model.endEditing() })) {
      editor in
      CredentialEditorView(model: editor, dismiss: model.endEditing)
    }
    .onAppear { model.showFirstCode() }
    .onDisappear { model.coverPage() }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        .accessibilityIdentifier("lockVault")
    }
    // Edit holds its place from the first frame: added once the page loads, it would push the
    // title sideways. It also keeps its label while the protected fields are read, because a
    // spinner in its place resizes the item and the whole toolbar blinks as it relays out.
    ToolbarItem(placement: .primaryAction) {
      let editable = model.state == .ready && !model.allowedSecrets.isEmpty
      Button(copy.text("Edit")) { model.beginEditing() }
        .accessibilityIdentifier("editCredential")
        .disabled(!editable || !model.canInteract)
        .animation(AirMotion.feedback, value: editable)
    }
  }

  // MARK: Sections

  @ViewBuilder private func ready(_ detail: CredentialDetail) -> some View {
    if let issue = model.editIssue {
      Section {
        Label(copy.text(issue), systemImage: "exclamationmark.triangle").foregroundStyle(.red)
      }
      .accessibilityIdentifier("credentialEditOpenIssue")
    }
    if let card = detail.paymentCard {
      cardIdentity(detail, card: card)
    } else {
      identity(detail)
    }
    if detail.entryType == "login" {
      Section {
        CredentialMetadataRow(
          model: model, label: "Username", value: detail.username, field: .username)
        CredentialSecretRow(model: model, type: "password")
      }
      // The page only reads: an empty section is left out, and adding one is in Edit.
      if let otp = model.otp, !otp.records.isEmpty || otp.issue != nil {
        CredentialCodesSection(model: otp)
      }
      if !detail.websites.isEmpty {
        Section(copy.text("Websites")) {
          ForEach(Array(detail.websites.enumerated()), id: \.offset) { index, website in
            CredentialWebsiteRow(model: model, website: website, index: index)
          }
        }
      }
    }
    if let card = detail.paymentCard {
      Section(copy.text("Card details")) {
        CredentialSecretRow(model: model, type: "card_pan")
        CredentialMetadataRow(
          model: model, label: "Cardholder name", value: card.cardholderName, field: .cardholder)
        CredentialMetadataRow(
          model: model, label: "Expiry",
          value: PaymentCardExpiry.display(month: card.expMonth, year: card.expYear))
      }
    }
    if model.allowedSecrets.contains("note") {
      Section(copy.text("Private note")) {
        CredentialSecretRow(model: model, type: "note", titled: false)
      }
    }
    Section(copy.text("Details")) {
      CredentialMetadataRow(
        model: model, label: "Group",
        value: detail.groupPath == "/" || detail.groupPath.isEmpty
          ? copy.text("Vault") : detail.groupPath)
      if !detail.tags.isEmpty {
        CredentialMetadataRow(
          model: model, label: "Tags", value: detail.tags.joined(separator: ", "))
      }
    }
    if !model.allowedSecrets.isEmpty { deleteSection }
  }

  /// A card is shown as the object itself; the number stays masked until revealed below.
  private func cardIdentity(_ detail: CredentialDetail, card: PaymentCardMetadata) -> some View {
    let revealed = model.secrets["card_pan"]
    let brand = revealed.flatMap(PaymentCardBrand.detect) ?? PaymentCardBrand(wire: card.brand)
    return Section {
      VStack(spacing: 12) {
        PaymentCardFace(
          brand: brand, last4: card.last4, holder: card.cardholderName, month: card.expMonth,
          year: card.expYear, number: revealed, code: model.secrets["card_cvv"],
          onToggleCode: { model.reveal("card_cvv") })
        Text(detail.title.isEmpty ? copy.text("Untitled credential") : detail.title)
          .font(.title3.weight(.semibold))
          .multilineTextAlignment(.center)
          .accessibilityIdentifier("credentialDetailTitle")
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 8)
      .padding(.bottom, 4)
      .listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
    }
    .listSectionSeparator(.hidden)
  }

  private func identity(_ detail: CredentialDetail) -> some View {
    Section {
      VStack(spacing: 10) {
        CredentialMonogram(title: detail.title, entryType: detail.entryType, size: 72)
        Text(detail.title.isEmpty ? copy.text("Untitled credential") : detail.title)
          .font(.title2.weight(.semibold))
          .multilineTextAlignment(.center)
          .accessibilityIdentifier("credentialDetailTitle")
        Text(copy.text(kind)).font(.subheadline).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 8)
      .padding(.bottom, 4)
      .listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
    }
    .listSectionSeparator(.hidden)
  }

  private var deleteMessage: Text {
    let warning = copy.text(
      "This removes the credential and its stored fields. This action cannot be undone.")
    return Text(model.detail?.title ?? "") + Text("\n\n") + Text(warning)
  }

  private var kind: String {
    switch model.detail?.entryType {
    case "payment_card": "Payment card"
    case "login": "Login"
    default: "Credential"
    }
  }

  private var deleteSection: some View {
    Section {
      if model.deletion == .deleting {
        ProgressView(copy.text("Deleting credential…"))
      } else if model.deletion == .uncertain {
        Text(
          copy.text(
            "The delete result could not be confirmed. Check the saved state before trying again."
          ))
        Button(copy.text("Check saved state")) { model.reload() }
          .accessibilityIdentifier("checkDeletedCredential")
      } else {
        if model.deletion == .denied {
          Text(copy.text("This vault does not allow this change."))
        }
        Button(role: .destructive, action: model.requestDeletion) {
          Label(copy.text("Delete credential"), systemImage: "trash")
            .frame(minHeight: 44)
        }
        .accessibilityIdentifier("deleteCredential")
      }
    }
  }
}

/// Applies the zoom transition only when the page was pushed from a row.
private struct ZoomTarget: ViewModifier {
  let id: String
  let namespace: Namespace.ID?
  func body(content: Content) -> some View {
    if let namespace {
      content.zoomDestination(id: id, in: namespace)
    } else {
      content
    }
  }
}

#if DEBUG
  #Preview("Login") {
    NavigationStack {
      CredentialDetailView(model: CredentialPreviewFixtures.detailModel(), lock: {})
    }
  }

  #Preview("Payment card") {
    NavigationStack {
      CredentialDetailView(model: CredentialPreviewFixtures.detailModel(card: true), lock: {})
    }
  }
#endif
