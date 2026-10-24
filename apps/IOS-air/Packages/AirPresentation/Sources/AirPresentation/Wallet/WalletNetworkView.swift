import ChromVoidBridge
import SwiftUI

/// One network of the wallet: balance, the two actions, the receive address and history.
/// Opened by tapping a network row; the advanced "another account" lives in its menu.
struct WalletNetworkView: View {
  @AirLocalizedCopy private var copy
  var model: WalletModel
  let accountID: String

  private var account: WalletAccountMeta? {
    model.walletAccounts.first { $0.accountID == accountID }
  }

  var body: some View {
    List {
      if let account {
        let profile = WalletNetworkPresentation.profile(for: account.network)
        Section {
          VStack(spacing: 8) {
            Text(profile?.symbol.prefix(1) ?? "?")
              .font(.title2.weight(.semibold))
              .frame(width: 56, height: 56)
              .background(AirPalette.container, in: Circle())
              .foregroundStyle(AirPalette.onContainer)
            HStack(spacing: 6) {
              if model.balanceLoading.contains(account.accountID) {
                ProgressView().controlSize(.small)
              }
              Text(model.formattedBalance(for: account) ?? "—")
                .font(.system(size: 34, weight: .bold).monospacedDigit())
                .minimumScaleFactor(0.6).lineLimit(1)
            }
            if let balance = model.balance(for: account) {
              Text(
                copy.format(
                  "Last updated %@",
                  copy.date(Date(timeIntervalSince1970: Double(balance.fetchedAt) / 1_000)))
              )
              .font(.footnote).foregroundStyle(.secondary)
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          HStack(spacing: 12) {
            Button {
              model.openSend()
            } label: {
              Label(copy.text("Send"), systemImage: "arrow.up.right")
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.canSend || model.accountState != .idle)
            Button {
              model.openReceive()
            } label: {
              Label(copy.text("Receive"), systemImage: "qrcode")
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(model.accountState == .working)
          }
          .padding(.bottom, 4)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))

        Section {
          if let address = account.currentReceiveAddress ?? account.address, !address.isEmpty {
            HStack(spacing: 12) {
              WalletAddressText(address: address)
                .lineLimit(1).truncationMode(.middle)
              Spacer(minLength: 8)
              Button {
                model.copyAddress(of: account.accountID)
              } label: {
                Image(systemName: model.addressCopied ? "checkmark" : "doc.on.doc")
                  .frame(width: 36, height: 36)
                  .background(
                    Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
              }
              .buttonStyle(.plain)
              .accessibilityLabel(copy.text("Copy address"))
            }
          } else {
            Text(copy.text("No receiving address yet."))
          }
          if account.network == "bitcoin", account.accountModel == "utxo" {
            Button {
              model.generateReceivingAddress(for: account.accountID)
            } label: {
              HStack {
                Text(copy.text("New address"))
                Spacer()
                if let index = account.nextReceiveIndex, index > 0 {
                  Text(copy.format("%@ used", copy.count(index))).foregroundStyle(.secondary).font(
                    .footnote)
                }
              }
            }
            .disabled(model.accountState != .idle)
          }
        } header: {
          Text(copy.text("Receiving address"))
        } footer: {
          if account.network == "bitcoin" {
            Text(
              copy.text(
                "Bitcoin gives you a fresh address for every transfer for privacy. All previous addresses stay yours."
              ))
          } else {
            Text(copy.text("This address stays the same for every transfer."))
          }
        }

        Section {
          Button {
            model.openHistory()
          } label: {
            Label(copy.text("Activity"), systemImage: "clock.arrow.circlepath")
          }
        }
        if model.accountState == .working {
          Section { ProgressView(copy.text("Updating account…")) }
        }
      } else {
        Text(copy.text("This account is no longer available."))
      }
    }
    .airCanvas()
    .privacySensitive()
    .navigationTitle(account.map { WalletNetworkPresentation.displayName(for: $0.network) } ?? "")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // The menu holds its place while the account loads: added afterwards, it would push
      // the title sideways as it appeared.
      ToolbarItem(placement: .primaryAction) {
        let derivable = account.map { model.derivableNetworks.contains($0.network) } ?? false
        Menu {
          Button {
            if let account { model.openAddAccount(network: account.network) }
          } label: {
            Label(copy.text("Add another account"), systemImage: "plus")
          }
          .disabled(model.accountState != .idle)
        } label: {
          Image(systemName: "ellipsis.circle")
        }
        .disabled(!derivable)
        .animation(AirMotion.feedback, value: derivable)
        .accessibilityIdentifier("walletNetworkMenu")
      }
    }
    .refreshable { await model.reload()?.value }
    .walletNetworkDestinations(model)
    .accessibilityIdentifier("walletNetwork")
  }
}

/// A monospaced address whose first and last characters are emphasised so it can be checked
/// at a glance against a printed or messaged copy.
struct WalletAddressText: View {
  let address: String

  var body: some View {
    let head = String(address.prefix(6))
    let tail = String(address.dropFirst(6).suffix(6))
    let middle = String(address.dropFirst(6).dropLast(min(6, max(0, address.count - 6))))
    (Text(head).bold() + Text(middle).foregroundColor(.secondary) + Text(tail).bold())
      .font(.system(size: 15, design: .monospaced))
      .textSelection(.enabled)
  }
}

#if DEBUG
  #Preview("Network") {
    let model = WalletPreviewFixtures.model(selectedNetwork: "ton")
    NavigationStack {
      WalletNetworkView(model: model, accountID: WalletPreviewFixtures.tonAccountID)
    }
    .walletSheets(model)
  }
#endif
