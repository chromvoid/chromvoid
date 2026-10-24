import ChromVoidBridge
import SwiftUI

struct WalletSendView: View {
  /// The button the keyboard must not cover.
  private static let submitAnchor = "walletSendSubmit"
  @AirLocalizedCopy private var copy
  var model: WalletSendModel
  var addressBook: WalletAddressBookModel
  let dismiss: () -> Void
  let showHistory: () -> Void
  @FocusState private var focus: WalletSendModel.Field?

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          Section {
            LabeledContent(copy.text("Network"), value: model.profile.displayName)
              .accessibilityIdentifier("walletSendNetwork")
            LabeledContent(copy.text("Account ID"), value: model.accountID).font(.footnote)
          } footer: {
            if let mismatch = model.networkMismatch {
              Text(
                copy.format(
                  "This address belongs to %@, and this wallet has no account on it.",
                  WalletNetworkPresentation.displayName(for: mismatch))
              ).foregroundStyle(.red)
            } else if let detected = model.detectedNetwork, detected == model.profile.network {
              Text(
                copy.format(
                  "Network detected from the address: %@",
                  WalletNetworkPresentation.displayName(for: detected)))
            } else {
              Text(copy.text("Paste any address; the network is recognised automatically."))
            }
          }
          if let issue = model.issue {
            Section {
              Label(copy.text(issue.copy), systemImage: "exclamationmark.triangle")
            }.id("sendIssue")
          }
          switch model.state {
          case .editing, .preparing: input
          case .reviewing, .staleReview, .confirming, .cancelling, .cancelFailed: review
          case .submitted, .uncertain: result
          case .revoked: Text(copy.text("Vault locked"))
          }
          if model.busy { ProgressView(copy.text("Updating…")) }
        }
        .airCanvas()
        .privacySensitive()
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(copy.text(model.state == .editing ? "Send" : "Review transfer"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: model.focusRevision) { focus = model.focus }
        .keepsSubmitVisible(Self.submitAnchor, in: scroll)
        .onChange(of: model.issue) { _, issue in
          if issue != nil { scroll.scrollTo("sendIssue", anchor: .top) }
        }
        .onChange(of: model.state) { _, state in if state == .revoked { dismiss() } }
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text("Close")) {
              focus = nil
              if model.requestDismiss() { dismiss() }
            }.disabled(model.busy)
          }
        }
        .interactiveDismissDisabled(
          model.busy || model.state == .reviewing || model.state == .staleReview
            || model.state == .cancelFailed || (model.state == .editing && model.hasChanges)
        )
        .confirmationDialog(
          copy.text("Discard transfer?"),
          isPresented: Binding(
            get: { model.confirmingDiscard }, set: { if !$0 { model.cancelDiscard() } }),
          titleVisibility: .visible
        ) {
          Button(copy.text("Discard changes"), role: .destructive) { model.discard() }
          Button(copy.text("Keep editing"), role: .cancel) { model.cancelDiscard() }
        } message: {
          Text(
            copy.text("The prepared transfer will be cancelled and the form will be cleared."))
        }
        .accessibilityIdentifier("walletSendForm")
      }
    }
  }

  @ViewBuilder private var input: some View {
    if !model.available {
      Section { Text(copy.text("Transfers are unavailable for this account or network.")) }
    }
    ForEach(Array(model.recipients.enumerated()), id: \.element.id) { index, recipient in
      Section(copy.format("Recipient %@", copy.count(index + 1))) {
        TextField(copy.text("Address"), text: binding(.address(recipient.id)), axis: .vertical)
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .focused($focus, equals: .address(recipient.id))
        Menu {
          ForEach(model.contacts(from: addressBook.entries), id: \.entryID) { contact in
            Button(contact.label) { model.chooseContact(contact, for: recipient.id) }
          }
          if model.contacts(from: addressBook.entries).isEmpty {
            Text(copy.text("No saved contacts for this network"))
          }
        } label: {
          Label(copy.text("Choose contact"), systemImage: "person.crop.circle")
        }
        TextField(
          copy.format("Amount (%@)", model.profile.symbol),
          text: binding(.amount(recipient.id))
        )
        .keyboardType(.decimalPad).focused($focus, equals: .amount(recipient.id))
        Button {
          focus = nil
          model.calculateQuote(maximumFor: recipient.id)
        } label: {
          Label(
            copy.text(
              model.maximumRecipientID == recipient.id ? "Maximum selected" : "Use maximum"),
            systemImage: "arrow.up.to.line")
        }.disabled(model.quoting || !model.available)
        if model.recipients.count > 1 {
          Button(copy.text("Remove recipient"), role: .destructive) {
            model.removeRecipient(recipient.id)
          }
        }
      }.disabled(model.state != .editing)
    }
    if model.profile.multipleOutputs {
      Section { Button(copy.text("Add recipient")) { model.addRecipient() } }
        .disabled(model.state != .editing)
    }
    Section(copy.text("Fee")) {
      Picker(
        copy.text("Fee priority"),
        selection: Binding(get: { model.feeTier }, set: { model.chooseFee($0) })
      ) {
        Text(copy.text("Slow")).tag(WalletFeeTier.slow)
        Text(copy.text("Standard")).tag(WalletFeeTier.standard)
        Text(copy.text("Fast")).tag(WalletFeeTier.fast)
      }
      if model.profile.supportsComment {
        TextField(copy.text("Comment"), text: binding(.comment), axis: .vertical)
          .focused($focus, equals: .comment)
      }
      Button(copy.text("Calculate fee")) {
        focus = nil
        model.calculateQuote()
      }
      .disabled(model.quoting || !model.available)
      if model.quoting { ProgressView(copy.text("Calculating…")) }
      if let quote = model.quote, let preview = quote.currentPreview {
        LabeledContent(
          copy.text("Estimated fee"),
          value: amount(preview.estimatedFee, unit: preview.amountUnit))
      }
    }.disabled(model.state != .editing)
    Section {
      Button(copy.text("Review transfer")) {
        focus = nil
        model.prepare()
      }
      .disabled(model.state != .editing || !model.available)
      Text(
        copy.text(
          "You will review the recipients, fee and total before authorizing the transfer.")
      )
      .font(.footnote).foregroundStyle(.secondary)
    }
    .id(Self.submitAnchor)
  }

  @ViewBuilder private var review: some View {
    if let prepared = model.prepared {
      ForEach(Array(prepared.preview.outputs.enumerated()), id: \.offset) { index, output in
        Section(copy.format("Recipient %@", copy.count(index + 1))) {
          Text(amount(output.amount, unit: prepared.preview.amountUnit)).font(
            .title3.weight(.semibold))
          Text(output.address).font(.footnote.monospaced())
          if let comment = output.comment { Text(comment) }
        }
      }
      Section {
        LabeledContent(
          copy.text("Fee"),
          value: amount(prepared.preview.estimatedFee, unit: prepared.preview.amountUnit))
        LabeledContent(
          copy.text("Total debit"),
          value: amount(prepared.preview.totalDebit, unit: prepared.preview.amountUnit))
        LabeledContent(
          copy.text("Valid until"),
          value: copy.date(Date(timeIntervalSince1970: Double(prepared.expiresAt) / 1_000)))
      }
      if !prepared.preview.warnings.isEmpty {
        Section(copy.text("Confirm warnings")) {
          ForEach(prepared.preview.warnings, id: \.code) { warning in
            Toggle(
              warningText(warning),
              isOn: Binding(
                get: { model.acceptedWarnings.contains(warning.code) },
                set: { _ in model.toggleWarning(warning.code) }))
          }
        }.disabled(model.state != .reviewing)
      }
      if model.state == .reviewing || model.state == .confirming {
        Section {
          SecureField(copy.text("Administrative password"), text: binding(.password))
            .textContentType(.password).focused($focus, equals: .password)
          Text(copy.text("Use your administrative password to authorize this transfer."))
            .font(.footnote).foregroundStyle(.secondary)
          Button(copy.text("Confirm transfer")) {
            focus = nil
            model.confirm()
          }
        }.disabled(model.busy)
      }
      Section {
        Button(
          copy.text(model.state == .cancelFailed ? "Retry cancellation" : "Back to editing")
        ) { model.cancelReview() }
        .disabled(model.busy)
      }
    }
  }
  private var result: some View {
    Section {
      Label(
        copy.text(model.state == .submitted ? "Transfer submitted" : "Transfer outcome unknown"),
        systemImage: model.state == .submitted ? "clock" : "exclamationmark.triangle")
      if let confirmation = model.confirmation {
        Text(confirmation.txHash ?? confirmation.txRef).font(.footnote.monospaced())
      }
      Text(
        copy.text(
          model.state == .submitted
            ? "Check activity for confirmation from the network."
            : "Check activity before creating another transfer. Do not send the same payment again."
        ))
      Button(copy.text("View activity"), action: showHistory)
    }
  }
  private func binding(_ field: WalletSendModel.Field) -> Binding<String> {
    Binding(get: { model.value(field) }, set: { model.change(field, to: $0) })
  }
  private func amount(_ value: String, unit: String) -> String {
    unit == model.profile.amountUnit ? model.profile.formatted(value) : value + " " + unit
  }
  private func warningText(_ warning: WalletWarning) -> String {
    switch warning.code {
    case "dust_change_to_fee":
      copy.text("Bitcoin change below the dust limit is included in the fee.")
    case "destination_uninitialized_bounceable":
      copy.text(
        "The destination account is not initialized and this address can return the payment.")
    default: warning.message
    }
  }
}

extension WalletSendModel.Issue {
  fileprivate var copy: String {
    switch self {
    case .required(.password): "Enter the administrative password."
    case .required: "Enter a recipient address."
    case .invalidAmount: "Enter a positive amount with the supported decimal precision."
    case .invalidAddress: "Check the recipient addresses."
    case .insufficientFunds: "There are not enough funds to cover the transfer and fee."
    case .unavailable: "Transfers are unavailable for this account or network."
    case .denied: "This operation is unavailable with your current access."
    case .stale: "This transfer is no longer current. Return to editing and review it again."
    case .quoteRequired: "Calculate the maximum again before reviewing the transfer."
    case .reauthentication: "The administrative password could not authorize this transfer."
    case .warnings: "Confirm every warning before authorizing the transfer."
    case .failed: "Couldn’t prepare the transfer. Check the details and try again."
    case .cancellationFailed:
      "Cancellation could not be confirmed. Retry cancellation before continuing."
    case .uncertain:
      "The transfer outcome is unknown. Check activity before making another transfer."
    }
  }
}

#if DEBUG
  #Preview("Send") {
    if let send = WalletPreviewFixtures.sendModel() {
      WalletSendView(
        model: send, addressBook: WalletPreviewFixtures.addressBookModel(), dismiss: {},
        showHistory: {})
    }
  }
#endif
