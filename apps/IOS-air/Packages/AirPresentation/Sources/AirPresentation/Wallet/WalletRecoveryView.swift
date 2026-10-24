import SwiftUI

struct WalletRecoveryView: View {
  @AirLocalizedCopy private var copy
  var model: WalletRecoveryModel
  let dismiss: () -> Void
  @FocusState private var passwordFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        Section {
          LabeledContent(copy.text("Wallet"), value: model.walletName)
          Text(
            copy.text(
              "Anyone with these recovery details can control this wallet. Keep them private and store them securely."
            )
          )
          .font(.footnote).foregroundStyle(.secondary)
        }
        if let issue = model.issue {
          Section { Label(copy.text(issue.copy), systemImage: "exclamationmark.triangle") }
        }
        if let recovery = model.recovery, model.state == .revealed {
          if let rotation = model.rotation {
            Section(copy.text("Signing key rotation")) {
              Label(copy.text("Rotation broadcast"), systemImage: "arrow.triangle.2.circlepath")
              LabeledContent(copy.text("Sequence number"), value: String(rotation.seqno))
              Text(
                copy.text(
                  "Write down all 24 words now. The previous phrase keeps working until the network confirms the new key; after that only this phrase recovers the wallet. Telegram Wallet needs all 24 words; other wallets keep using the first 12."
                )
              )
              .font(.footnote).foregroundStyle(.secondary)
            }.accessibilityIdentifier("walletRotationResult")
          }
          let rotated = recovery.mnemonicStandard == "rotation" && recovery.mnemonic.count == 24
          Section(copy.text("Recovery phrase")) {
            LabeledContent(
              copy.text("Mnemonic standard"), value: standardName(recovery.mnemonicStandard))
            if rotated {
              Text(copy.text("Words 1–12 · every wallet")).font(.footnote.weight(.semibold))
              wordGrid(recovery.mnemonic.prefix(12), offset: 0)
              Text(copy.text("Words 13–24 · Telegram Wallet only")).font(
                .footnote.weight(.semibold))
              wordGrid(recovery.mnemonic.dropFirst(12), offset: 12)
              Text(
                copy.text(
                  "Telegram Wallet restores this wallet from all 24 words. MetaMask, Trust, Phantom and this app’s Bitcoin, Ethereum and Solana accounts use only the first 12."
                )
              ).font(.footnote).foregroundStyle(.secondary)
            } else {
              wordGrid(recovery.mnemonic[...], offset: 0)
              if recovery.mnemonicStandard == "rotation" {
                Text(
                  copy.text(
                    "These 12 words restore the wallet in Telegram Wallet and in any BIP39 wallet such as MetaMask, Trust or Phantom."
                  )
                ).font(.footnote).foregroundStyle(.secondary)
              }
            }
            Button(copy.text("Copy recovery phrase")) { model.copy(.mnemonic) }
            if model.copied == .mnemonic {
              Text(copy.text("Copied")).foregroundStyle(.secondary)
            }
            if rotated {
              Button(copy.text("Copy first 12 words")) { model.copy(.anchorWords) }
                .accessibilityIdentifier("copyWalletAnchorWords")
              if model.copied == .anchorWords {
                Text(copy.text("Copied")).foregroundStyle(.secondary)
              }
            }
          }
          if let passphrase = recovery.bip39Passphrase, !passphrase.isEmpty {
            Section(copy.text("BIP39 passphrase")) {
              Text(passphrase).font(.body.monospaced())
              Text(copy.text("This passphrase is also required to restore this wallet."))
                .font(.footnote).foregroundStyle(.secondary)
              Button(copy.text("Copy passphrase")) { model.copy(.passphrase) }
              if model.copied == .passphrase {
                Text(copy.text("Copied")).foregroundStyle(.secondary)
              }
            }
          }
          Section { Button(copy.text("Hide recovery details")) { model.hideValues() } }
        } else if model.state != .revoked {
          Section {
            SecureField(
              copy.text("Administrative password"),
              text: Binding(get: { model.password }, set: { model.changePassword($0) })
            ).textContentType(.password).focused($passwordFocused)
            Text(
              copy.text(
                "Enter your administrative password to view this wallet’s recovery details.")
            )
            .font(.footnote).foregroundStyle(.secondary)
            Button(copy.text("Show recovery details")) {
              passwordFocused = false
              model.reveal()
            }
            if model.state == .loading { ProgressView(copy.text("Loading…")) }
          }.disabled(model.state == .loading)
          if model.canRotate {
            Section {
              Button {
                passwordFocused = false
                model.rotateKey()
              } label: {
                Label(copy.text("Rotate signing key"), systemImage: "arrow.triangle.2.circlepath")
              }
              .accessibilityIdentifier("rotateWalletSigningKey")
            } footer: {
              Text(
                copy.text(
                  "Replaces the key that signs transactions without changing the wallet address. You will receive a new 24-word recovery phrase for Telegram Wallet; other wallets keep using the first 12 words."
                ))
            }.disabled(model.state == .loading)
          }
        }
      }
      .airCanvas()
      .privacySensitive()
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(copy.text("Wallet recovery"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Close"), action: dismiss)
        }
      }
      .onChange(of: model.passwordFocusRevision) { passwordFocused = true }
      .onChange(of: model.state) { _, state in if state == .revoked { dismiss() } }
      .accessibilityIdentifier("walletRecoveryForm")
    }
  }
  private func wordGrid(_ words: ArraySlice<String>, offset: Int) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 120), alignment: .leading)],
      alignment: .leading, spacing: 12
    ) {
      ForEach(Array(words.enumerated()), id: \.offset) { index, word in
        Text(String(offset + index + 1) + ". " + word).font(.body.monospaced())
      }
    }
  }
  private func standardName(_ value: String) -> String {
    switch value {
    case "ton_native": "TON"
    case "rotation": "Telegram Wallet"
    case "bip39": "BIP39"
    default: value
    }
  }
}

extension WalletRecoveryModel.Issue {
  fileprivate var copy: String {
    switch self {
    case .passwordRequired: "Enter the administrative password."
    case .reauthentication: "The administrative password could not authorize recovery access."
    case .denied: "This operation is unavailable with your current access."
    case .unsupported: "Recovery phrase export is unavailable for this wallet."
    case .failed: "Couldn’t load recovery details. Try again."
    case .rotationPending:
      "A signing key rotation is still pending. Wait for the network to confirm it or for it to expire."
    case .rotationUnavailable: "Signing key rotation is unavailable for this wallet."
    }
  }
}
