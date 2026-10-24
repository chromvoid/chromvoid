import ChromVoidBridge
import SwiftUI

/// Wallets as physical cards, paged horizontally: the same vocabulary as the payment card in
/// the password manager (18pt continuous corners, gradient face, white type, soft shadow).
struct WalletCardCarousel: View {
  var model: WalletModel

  var body: some View {
    TabView(
      selection: Binding(
        get: { model.selectedWalletID }, set: { if let id = $0 { model.selectWallet(id) } })
    ) {
      ForEach(Array(model.wallets.enumerated()), id: \.element.walletID) { index, wallet in
        WalletCardFace(model: model, wallet: wallet, palette: index)
          .padding(.horizontal, 16)
          .padding(.top, 4)
          .padding(.bottom, 28)
          .tag(Optional(wallet.walletID))
      }
    }
    .tabViewStyle(.page(indexDisplayMode: model.wallets.count > 1 ? .always : .never))
    .indexViewStyle(.page(backgroundDisplayMode: .never))
    .frame(height: 226)
    .accessibilityIdentifier("walletCards")
  }
}

struct WalletCardFace: View {
  @AirLocalizedCopy private var copy
  var model: WalletModel
  let wallet: WalletSummary
  let palette: Int

  var body: some View {
    let accounts = model.accounts(of: wallet.walletID)
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(
          LinearGradient(
            colors: Self.gradients[palette % Self.gradients.count],
            startPoint: .topLeading, endPoint: .bottomTrailing))
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(.white.opacity(0.18), lineWidth: 0.5)
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 3) {
            Text(wallet.label)
              .font(.system(size: 19, weight: .semibold))
              .lineLimit(1).minimumScaleFactor(0.7)
            Text(kind)
              .font(.system(size: 11, weight: .semibold))
              .textCase(.uppercase).tracking(0.6).opacity(0.7)
          }
          Spacer()
          Image(systemName: "wallet.pass")
            .font(.system(size: 22, weight: .medium)).opacity(0.9)
            .accessibilityHidden(true)
        }
        Spacer(minLength: 12)
        if accounts.isEmpty {
          Text(copy.text("No accounts in this wallet")).font(.footnote).opacity(0.8)
        } else {
          HStack(spacing: 8) {
            ForEach(accounts.prefix(3), id: \.accountID) { account in
              chip(for: account)
            }
          }
        }
      }
      .padding(18)
      .foregroundStyle(.white)
    }
    .frame(height: 176)
    .shadow(color: .black.opacity(0.22), radius: 14, y: 8)
    .privacySensitive()
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("walletCard-" + wallet.walletID)
  }

  private func chip(for account: WalletAccountMeta) -> some View {
    let profile = WalletNetworkPresentation.profile(for: account.network)
    return VStack(alignment: .leading, spacing: 2) {
      Text(profile?.symbol ?? account.network.uppercased())
        .font(.system(size: 11, weight: .medium)).opacity(0.8)
      Text(amount(for: account, profile: profile))
        .font(.system(size: 16, weight: .semibold).monospacedDigit())
        .lineLimit(1).minimumScaleFactor(0.6)
    }
    .padding(.horizontal, 10).padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private func amount(for account: WalletAccountMeta, profile: WalletNetworkPresentation?)
    -> String
  {
    guard let balance = model.balance(for: account) else { return "—" }
    guard let profile, let decimal = profile.decimal(from: balance.balance.total) else {
      return balance.balance.total
    }
    return decimal
  }

  private var kind: String {
    if wallet.kind != "hd" { return copy.text("Imported key") }
    if wallet.walletMode == "ton_only" { return copy.text("Telegram Wallet") }
    if wallet.mnemonicStandard == "bip39" { return copy.text("BIP39 wallet") }
    return copy.text("Universal wallet")
  }

  /// Brand cyan first (lit top-left corner), then muted alternatives so several wallets stay apart.
  static let gradients: [[Color]] = [
    AirPalette.cardCyan,
    [
      Color(red: 0.36, green: 0.37, blue: 0.45), Color(red: 0.23, green: 0.24, blue: 0.30),
      Color(red: 0.14, green: 0.15, blue: 0.19),
    ],
    [
      Color(red: 0.30, green: 0.34, blue: 0.62), Color(red: 0.20, green: 0.23, blue: 0.45),
      Color(red: 0.12, green: 0.14, blue: 0.28),
    ],
    [
      Color(red: 0.24, green: 0.45, blue: 0.36), Color(red: 0.15, green: 0.32, blue: 0.26),
      Color(red: 0.09, green: 0.20, blue: 0.16),
    ],
  ]
}

#if DEBUG
  #Preview("Wallet cards") {
    List {
      Section {
        WalletCardCarousel(model: WalletPreviewFixtures.model())
      }
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
    }
    .airCanvas()
  }
#endif
