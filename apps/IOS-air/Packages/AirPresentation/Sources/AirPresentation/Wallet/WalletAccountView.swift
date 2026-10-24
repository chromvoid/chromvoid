import SwiftUI

struct WalletAccountView: View {
  @AirLocalizedCopy private var copy
  var model: WalletModel
  let route: WalletModel.AccountRoute
  @FocusState private var networkFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        if let issue = model.accountIssue {
          Section { Text(copy.text(issue.copy)).foregroundStyle(.red) }
        }
        if model.accountState == .uncertain {
          Section {
            if isAdding {
              Button(copy.text("Close and check accounts")) { model.closeAccountRoute() }
            } else {
              Button(copy.text("I have checked the updated details")) {
                model.acknowledgeAccountReconciliation()
              }.disabled(model.state != .ready)
            }
          }
        }
        switch route {
        case .add: addAccount
        case .receive: receive
        }
        if model.accountState == .working {
          Section { ProgressView(copy.text("Updating account…")) }
        }
      }
      .airCanvas()
      .privacySensitive()
      .navigationTitle(copy.text(isAdding ? "Add account" : "Receive"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Close")) { model.closeAccountRoute() }
            .disabled(model.accountState == .working)
        }
        // toolbar-mode: fixed by the route that opened the screen
        if isAdding {
          ToolbarItem(placement: .confirmationAction) {
            Button(copy.text("Add")) {
              model.addAccount()
              networkFocused = model.accountIssue == .chooseNetwork
            }.disabled(model.accountState != .idle || model.state != .ready)
          }
        }
      }
      .interactiveDismissDisabled(model.accountState == .working)
    }
  }
  private var isAdding: Bool {
    if case .add = route { return true }
    return false
  }
  private var addAccount: some View {
    Section {
      if let wallet = model.accountWallet {
        LabeledContent(copy.text("Wallet"), value: wallet.label)
      } else {
        Text(copy.text("This wallet is no longer available."))
      }
      Picker(
        copy.text("Network"),
        selection: Binding(
          get: { model.accountNetwork }, set: { model.chooseAccountNetwork($0) })
      ) {
        Text(copy.text("Choose a network")).tag(String?.none)
        ForEach(model.derivableNetworks, id: \.self) { network in
          Text(network).tag(Optional(network))
        }
      }
      .focused($networkFocused)
      .disabled(model.accountState != .idle || model.state != .ready)
    } footer: {
      Text(copy.text("The new account will belong to this wallet and selected network."))
    }
  }
  @ViewBuilder private var receive: some View {
    switch model.state {
    case .loading: ProgressView(copy.text("Loading wallets…"))
    case .failed:
      Text(copy.text("Couldn’t load wallets. Try again."))
      Button(copy.text("Try again")) { model.reload() }
    case .revoked: Text(copy.text("Vault locked"))
    case .ready:
      if let account = model.receivingAccount {
        if model.walletAccounts.count > 1 {
          Section(copy.text("Network")) {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                ForEach(model.walletAccounts, id: \.accountID) { candidate in
                  let active = candidate.accountID == account.accountID
                  Button {
                    model.switchReceivingAccount(candidate.accountID)
                  } label: {
                    Text(WalletNetworkPresentation.displayName(for: candidate.network))
                      .font(.subheadline.weight(active ? .semibold : .regular))
                      .padding(.horizontal, 12).padding(.vertical, 6)
                      .background(
                        active ? AirPalette.container : Color.secondary.opacity(0.1),
                        in: Capsule())
                  }
                  .buttonStyle(.plain)
                  .disabled(model.accountState == .working)
                  .accessibilityAddTraits(active ? [.isSelected] : [])
                  .accessibilityIdentifier("receiveNetwork-" + candidate.network)
                }
              }
            }
          }
        }
        let network = WalletNetworkPresentation.displayName(for: account.network)
        Section {
          VStack(spacing: 16) {
            if let address = model.receivingAddress {
              AirQRCode(value: address)
                .frame(width: 200, height: 200)
                .padding(12)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                  RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color(uiColor: .separator), lineWidth: 0.5))
              VStack(spacing: 6) {
                Text(copy.format("Address · %@", network))
                  .font(.footnote).foregroundStyle(.secondary)
                WalletAddressText(address: address)
                  .multilineTextAlignment(.center)
                  .accessibilityIdentifier("receiveAddress")
              }
              HStack(spacing: 12) {
                Button {
                  model.copyReceivingAddress()
                } label: {
                  Label(
                    copy.text(model.addressCopied ? "Copied" : "Copy"),
                    systemImage: model.addressCopied ? "checkmark" : "doc.on.doc"
                  )
                  .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                ShareLink(item: address) {
                  Label(copy.text("Share"), systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
              }
            } else if model.accountState != .working {
              Text(copy.text("No receiving address yet."))
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
        } footer: {
          Text(
            copy.text(
              "Send only assets of this network to this address. Anything sent from another network is lost."
            ))
        }
        if model.canDeriveReceiveAddress {
          Section {
            Button(copy.text("New address")) {
              model.generateReceivingAddress()
            }
            .disabled(model.accountState != .idle)
          } footer: {
            Text(
              copy.text(
                "Bitcoin gives you a fresh address for every transfer for privacy. All previous addresses stay yours."
              ))
          }
        }
      } else {
        Text(copy.text("This account is no longer available."))
      }
    }
  }
}

extension WalletModel.AccountIssue {
  fileprivate var copy: String {
    switch self {
    case .chooseNetwork: "Choose an available network."
    case .denied: "This vault does not allow this operation."
    case .unavailable: "This account operation is unavailable."
    case .invalidInput: "The account could not be updated. Check the selected network and account."
    case .uncertain:
      "The operation could not be confirmed. Check the updated accounts and address before continuing."
    }
  }
}

#if DEBUG
  #Preview("Receive") {
    WalletAccountView(
      model: WalletPreviewFixtures.receiveModel(),
      route: .receive(accountID: WalletPreviewFixtures.tonAccountID))
  }
#endif
