import ChromVoidBridge
import SwiftUI

struct WalletView: View {
  @AirLocalizedCopy private var copy
  var model: WalletModel
  let lock: () -> Void

  var body: some View {
    // Hosted in the vault's navigation stack; see WalletNavigation.swift for its routes.
    List {
      if model.accountState == .uncertain {
        Section {
          Text(
            copy.text(
              "The operation could not be confirmed. Check the updated accounts and address before continuing."
            ))
          Button(copy.text("I have checked the updated details")) {
            model.acknowledgeAccountReconciliation()
          }
          .disabled(model.state != .ready)
        }
      }
      switch model.state {
      case .loading: ProgressView(copy.text("Loading wallets…"))
      case .failed:
        Section {
          Text(copy.text("Couldn’t load wallets. Try again."))
          Button(copy.text("Try again")) { model.reload() }
        }
      case .revoked: Text(copy.text("Vault locked"))
      case .ready: content
      }
    }
    .airCanvas()
    .privacySensitive()
    .navigationTitle(copy.text("Wallet"))
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Menu {
          Button(copy.text("Create wallet")) { model.beginSetup(.create) }
          Button(copy.text("Restore wallet")) { model.beginSetup(.restore) }
          Button(copy.text("Import private key")) { model.beginSetup(.importKey) }
        } label: {
          Label(copy.text("Add wallet"), systemImage: "plus")
        }
        .disabled(
          model.state != .ready || model.status?.enabled != true || model.accountState != .idle)
        Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
      }
    }
    // Sheets hang off the navigation stack (WalletSheets, applied by the shell); the pushes this
    // screen starts are declared here.
    .walletDestinations(model)
    .refreshable { await model.reload()?.value }
    .accessibilityIdentifier("walletCatalog")
  }

  @ViewBuilder private var content: some View {
    if model.status?.enabled != true {
      Section {
        Label(
          copy.text("Wallet operations are unavailable in this runtime."),
          systemImage: "info.circle")
      }
    }
    if model.wallets.isEmpty {
      Section {
        Label(copy.text("No wallets yet"), systemImage: "wallet.pass")
        if model.status?.enabled == true {
          Text(copy.text("Create a wallet, restore a recovery phrase or import a private key."))
            .foregroundStyle(.secondary)
        }
      }
    } else {
      // Wallets are cards paged horizontally; the wallet-level actions sit right under the
      // card, and the network list below is the same wallet seen per network.
      Section {
        WalletCardCarousel(model: model)
      }
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
      Section {
        walletActions
      }
      .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
      .listRowBackground(Color.clear)
      Section {
        if model.walletAccounts.isEmpty { Text(copy.text("No accounts in this wallet")) }
        ForEach(model.walletAccounts, id: \.accountID) { account in
          Button {
            model.openNetwork(account.accountID)
          } label: {
            assetRow(account)
          }
          .accessibilityIdentifier("walletAsset-" + account.network)
        }
      } header: {
        // The identifier lives on the header: on the Section it would overwrite every row's.
        Text(copy.text("Networks")).accessibilityIdentifier("walletAssets")
      } footer: {
        if !model.canSend {
          Text(copy.text("Transfers are unavailable for this wallet right now."))
        } else {
          Text(copy.text("Paste any address to send; the network is recognised automatically."))
        }
      }
      Section {
        if model.canRecover {
          Button {
            model.openRecovery()
          } label: {
            Label(copy.text("Export recovery phrase"), systemImage: "square.and.arrow.up")
          }
          .accessibilityIdentifier("walletExport")
        } else {
          Text(copy.text("Recovery phrase export is unavailable for this wallet."))
            .font(.footnote).foregroundStyle(.secondary)
        }
      } header: {
        Text(copy.text("Export to another wallet"))
      } footer: {
        if model.canRecover {
          Text(
            copy.text(
              "The 12 words open this wallet in Telegram Wallet, MetaMask, Trust or Phantom. Your administrative password is required."
            ))
        }
      }
    }
  }

  private var walletActions: some View {
    HStack(alignment: .top, spacing: 12) {
      actionButton(
        "Send", systemImage: "arrow.up.right", primary: true,
        disabled: !model.canSend || model.accountState != .idle, identifier: "walletSend"
      ) { model.openSend() }
      actionButton(
        "Receive", systemImage: "qrcode",
        disabled: model.accountState == .working || model.selectedAccount == nil,
        identifier: "walletReceive"
      ) { model.openReceive() }
      actionButton(
        "Activity", systemImage: "clock.arrow.circlepath", disabled: model.selectedAccount == nil,
        identifier: "walletActivity"
      ) { model.openHistory() }
      actionButton(
        "Contacts", systemImage: "person.crop.rectangle.stack",
        disabled: model.accountState != .idle, identifier: "walletContacts"
      ) { model.openAddressBook() }
    }
  }

  private func actionButton(
    _ title: String, systemImage: String, primary: Bool = false, disabled: Bool,
    identifier: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 6) {
        Image(systemName: systemImage)
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(primary ? AirPalette.onButton : AirPalette.accent)
          .frame(width: 56, height: 56)
          .background(
            primary ? AirPalette.button : Color(uiColor: .secondarySystemGroupedBackground),
            in: Circle())
        Text(copy.text(title)).font(.caption).foregroundStyle(.primary)
          .lineLimit(1).minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.45 : 1)
    .accessibilityIdentifier(identifier)
  }

  private func assetRow(_ account: WalletAccountMeta) -> some View {
    let profile = WalletNetworkPresentation.profile(for: account.network)
    return HStack(spacing: 12) {
      Text(profile?.symbol.prefix(1) ?? "?")
        .font(.caption.weight(.semibold))
        .frame(width: 32, height: 32)
        .background(AirPalette.container, in: Circle())
        .foregroundStyle(AirPalette.onContainer)
      VStack(alignment: .leading, spacing: 2) {
        Text(WalletNetworkPresentation.displayName(for: account.network))
          .foregroundStyle(.primary)
        if let label = account.label, label != account.network {
          Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      if model.balanceLoading.contains(account.accountID) {
        ProgressView().controlSize(.small)
          .accessibilityLabel(copy.text("Updating balance"))
      }
      Text(model.formattedBalance(for: account) ?? "—")
        .font(.body.monospacedDigit())
        .foregroundStyle(model.balance(for: account) == nil ? .secondary : .primary)
        .multilineTextAlignment(.trailing)
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        .accessibilityHidden(true)
    }
  }
}

#if DEBUG
  #Preview("Wallet") {
    let model = WalletPreviewFixtures.model()
    NavigationStack { WalletView(model: model, lock: {}) }.walletSheets(model)
  }
#endif
