import SwiftUI

struct WalletSetupView: View {
  @AirLocalizedCopy private var copy
  var model: WalletSetupModel
  let dismiss: () -> Void
  @FocusState private var focus: WalletSetupModel.Field?
  @State private var advancedExpanded = false

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          if let issue = model.issue {
            Section {
              Label(copy.text(issue.copy), systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
            }.id("walletSetupIssue")
          }
          if model.state != .uncertain {
            Section { field(.label, title: "Name") }
            if model.intent == .importKey {
              importFields
            } else {
              Section(copy.text(model.intent == .create ? "Wallet type" : "Recovery profile")) {
                if model.intent == .restore {
                  Picker(
                    copy.text("Recovery profile"),
                    selection: Binding(get: { model.profile }, set: { model.selectProfile($0) })
                  ) {
                    ForEach(
                      WalletSetupModel.RecoveryProfile.available(for: model.intent), id: \.self
                    ) { profile in
                      Text(copy.text(profile.title)).tag(profile)
                    }
                  }
                  .accessibilityIdentifier("walletRecoveryProfile")
                } else {
                  LabeledContent(copy.text("Wallet type"), value: copy.text(model.profile.title))
                }
                if model.profile == .tonOnly {
                  Text(
                    copy.text(
                      "Compatible with the Telegram Wallet contract: 12 words, or 24 words after a signing key rotation."
                    )
                  ).font(.footnote).foregroundStyle(.secondary)
                }
                if model.profile == .telegramMultichain {
                  Text(
                    copy.text(
                      "One 12-word phrase for every network. The same words open the TON account in Telegram Wallet and the Bitcoin, Ethereum and Solana accounts in MetaMask, Trust or Phantom."
                    )
                  ).font(.footnote).foregroundStyle(.secondary)
                  if model.intent == .create {
                    Text(
                      copy.text(
                        "The wallet is stored in your encrypted vault. You can export its 12 words for another wallet app at any time from the wallet screen."
                      )
                    ).font(.footnote).foregroundStyle(.secondary)
                  }
                }
              }
              if model.intent == .restore {
                Section(copy.text("Recovery phrase")) {
                  field(.mnemonic, title: "Recovery phrase", secure: true)
                }
              }
              if model.profile.allowsPassphrase {
                Section {
                  DisclosureGroup(isExpanded: $advancedExpanded) {
                    Toggle(
                      copy.text("Use a BIP39 passphrase"),
                      isOn: Binding(
                        get: { model.usePassphrase }, set: { model.setPassphraseEnabled($0) })
                    )
                    .disabled(model.state != .editing)
                    .accessibilityIdentifier("walletPassphraseToggle")
                    if model.usePassphrase {
                      field(.passphrase, title: "BIP39 passphrase", secure: true)
                    }
                    Text(
                      copy.text(
                        "Optional. A passphrase changes the Bitcoin, Ethereum and Solana accounts and is required to restore them. Most wallets cannot import it; leave it off unless you know you need it. The TON account never uses it."
                      )
                    ).font(.footnote).foregroundStyle(.secondary)
                  } label: {
                    Text(copy.text("Advanced"))
                  }
                  .accessibilityIdentifier("walletAdvancedOptions")
                }
              }
            }
          }
        }
        .airCanvas()
        .disabled(model.state == .saving || model.state == .revoked)
        .privacySensitive()
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: model.focusRevision) { focus = model.focus }
        .onChange(of: model.issue) { _, issue in
          if issue != nil { scroll.scrollTo("walletSetupIssue", anchor: .top) }
        }
        .navigationTitle(copy.text(title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text(model.state == .uncertain ? "Close" : "Cancel")) {
              if model.requestDismiss() { dismiss() }
            }.disabled(model.state == .saving)
          }
          ToolbarItem(placement: .confirmationAction) {
            Button {
              focus = nil
              model.submit()
            } label: {
              // The spinner sits over the label: an item that changes width makes the whole
              // toolbar blink as it relays out.
              Text(copy.text("Save"))
                .opacity(model.state == .saving ? 0 : 1)
                .overlay {
                  if model.state == .saving {
                    ProgressView().accessibilityLabel(copy.text("Saving wallet…"))
                  }
                }
            }.disabled(model.state != .editing)
              .accessibilityIdentifier("saveWalletSetup")
          }
        }
        .interactiveDismissDisabled(model.isDirty || model.state == .saving)
        .confirmationDialog(
          copy.text("Discard wallet setup?"),
          isPresented: .presented({ model.confirmingDiscard }, close: { model.cancelDiscard() }),
          titleVisibility: .visible
        ) {
          Button(copy.text("Discard changes"), role: .destructive, action: dismiss)
          Button(copy.text("Keep editing"), role: .cancel, action: model.cancelDiscard)
        } message: {
          Text(copy.text("The entered keys and recovery phrase will be cleared from this form."))
        }
        .accessibilityIdentifier("walletSetupForm")
      }
    }
  }

  private var title: String {
    switch model.intent {
    case .create: "Create wallet"
    case .restore: "Restore wallet"
    case .importKey: "Import private key"
    }
  }
  private var importFields: some View {
    Section(copy.text("Private key")) {
      Picker(
        copy.text("Network"),
        selection: Binding(
          get: { model.importNetwork },
          set: { if let value = $0 { model.selectImportNetwork(value) } })
      ) {
        ForEach(model.availableImportNetworks, id: \.self) { network in
          Text(network.rawValue).tag(Optional(network))
        }
      }
      Picker(
        copy.text("Key encoding"),
        selection: Binding(get: { model.encoding }, set: { model.selectEncoding($0) })
      ) {
        ForEach(model.importNetwork?.encodings ?? [], id: \.self) { Text($0).tag($0) }
      }
      field(.privateKey, title: "Private key", secure: true)
    }
  }
  @ViewBuilder
  private func field(_ field: WalletSetupModel.Field, title: String, secure: Bool = false)
    -> some View
  {
    let binding = Binding(get: { model.value(field) }, set: { model.change(field, to: $0) })
    HStack {
      if secure {
        CredentialSecretInput(
          text: binding,
          focusRequest: model.focus == field ? model.focusRevision : nil,
          revealed: model.revealed.contains(field), label: copy.text(title),
          identifier: "wallet_" + field.rawValue, numeric: false)
        Button {
          model.toggleVisibility(field)
        } label: {
          Image(systemName: model.revealed.contains(field) ? "eye.slash" : "eye")
            .frame(minWidth: 44, minHeight: 44)
        }.buttonStyle(.borderless)
          .accessibilityLabel(
            copy.text(model.revealed.contains(field) ? "Hide value" : "Show value"))
      } else {
        TextField(copy.text(title), text: binding).focused($focus, equals: field)
      }
    }.disabled(model.state != .editing)
    if model.missingFields.contains(field) {
      Text(copy.text("This field is required.")).font(.footnote).foregroundStyle(.red)
    }
  }
}

extension WalletSetupModel.RecoveryProfile {
  fileprivate var title: String {
    switch self {
    case .multichain: "Multichain (BIP39)"
    case .telegramMultichain: "Universal wallet"
    case .tonOnly: "Telegram Wallet"
    case .tonLegacy: "TON legacy (24 words)"
    }
  }
}

extension WalletSetupModel.Issue {
  fileprivate var copy: String {
    switch self {
    case .unavailable: "Wallet operations are unavailable in this runtime."
    case .chooseNetwork: "Choose an available network."
    case .expiredPhrase: "The wallet draft expired before it was saved. Try again."
    case .invalidInput:
      "Check the recovery phrase, key format and selected networks. An expired draft needs a new phrase."
    case .denied: "This vault does not allow this operation."
    case .generationFailed: "Couldn’t generate a recovery phrase. Try again."
    case .uncertainSave:
      "The wallet save could not be confirmed. Close this form and check your wallets before trying again."
    }
  }
}
