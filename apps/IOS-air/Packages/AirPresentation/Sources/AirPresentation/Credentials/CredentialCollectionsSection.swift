import ChromVoidBridge
import SwiftUI

/// The collections of the vault root: codes, passkeys, SSH keys and the wallet as a grid of
/// tiles above the password groups. The counts refresh whenever the catalog becomes ready.
struct CredentialCollectionsSection: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  let openPasskeys: () -> Void
  let openWallet: () -> Void
  /// Network accounts of the wallet, from the wallet model the shell owns.
  var walletCount: String? = nil

  var body: some View {
    Section {
      LazyVGrid(
        columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
        spacing: 12
      ) {
        CollectionTile(
          title: copy.text("Codes"), systemImage: "number",
          count: model.collectionCounts.codes, identifier: "openCodes"
        ) { model.beginCodes() }
        CollectionTile(
          title: copy.text("Passkeys"), systemImage: "person.badge.key",
          count: model.collectionCounts.passkeys, identifier: "openPasskeys", action: openPasskeys)
        CollectionTile(
          title: copy.text("SSH keys"), systemImage: "terminal", count: model.collectionCounts.ssh,
          identifier: "openSSHKeys", action: model.beginSSH)
        CollectionTile(
          title: copy.text("Wallet"), systemImage: "wallet.pass", count: walletCount,
          identifier: "openWallet", action: openWallet)
      }
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
      .padding(.bottom, 4)
      .task(id: model.state) { if model.state == .ready { model.refreshCollectionCounts() } }
    }
    .listSectionSeparator(.hidden)
  }
}

/// A collection at the vault root: symbol in the brand container, the count as the main
/// figure, the name below. An empty collection shows a quiet dash instead of a zero. Tap
/// opens its own screen.
private struct CollectionTile: View {
  let title: String
  let systemImage: String
  let count: String?
  let identifier: String
  let action: () -> Void
  private var isEmpty: Bool { count == "0" }

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top) {
          Image(systemName: systemImage)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AirPalette.onContainer)
            .frame(width: 30, height: 30)
            .background(
              AirPalette.container, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
          Spacer()
          if let count {
            Text(isEmpty ? "—" : count)
              .font(.title2.weight(isEmpty ? .regular : .semibold).monospacedDigit())
              .foregroundStyle(isEmpty ? .tertiary : .primary)
              .numericText()
          }
        }
        Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        Color(uiColor: .secondarySystemGroupedBackground),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(count.map { title + ", " + $0 } ?? title)
    .accessibilityIdentifier(identifier)
  }
}

#if DEBUG
  #Preview("Collections") {
    List {
      CredentialCollectionsSection(
        model: CredentialPreviewFixtures.catalogModel(), openPasskeys: {}, openWallet: {},
        walletCount: "2")
    }
    .airCanvas()
  }
#endif
