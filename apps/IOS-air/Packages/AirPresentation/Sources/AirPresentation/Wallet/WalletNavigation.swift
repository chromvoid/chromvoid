import SwiftUI

/// Pushes the wallet root owns: the network screen and its own activity. Each screen declares
/// only the pushes it starts, like the rest of the vault; two active pushes bound to one screen
/// would make SwiftUI pop the first.
struct WalletDestinations: ViewModifier {
  var model: WalletModel

  func body(content: Content) -> some View {
    content
      .navigationDestination(
        isPresented: .presented({ model.networkAccountID != nil }, close: { model.closeNetwork() })
      ) {
        if let accountID = model.networkAccountID {
          WalletNetworkView(model: model, accountID: accountID)
        }
      }
      .navigationDestination(
        isPresented: .presented({ model.historyPresented }, close: { model.closeHistory() })
      ) {
        WalletHistoryScreen(model: model)
      }
  }
}

/// The push the network screen owns: its activity.
struct WalletNetworkDestinations: ViewModifier {
  var model: WalletModel

  func body(content: Content) -> some View {
    content.navigationDestination(
      isPresented: .presented({ model.networkHistoryPresented }, close: { model.closeHistory() })
    ) {
      WalletHistoryScreen(model: model)
    }
  }
}

private struct WalletHistoryScreen: View {
  var model: WalletModel

  var body: some View {
    if let history = model.history {
      WalletHistoryView(
        model: history, accountName: model.selectedAccount?.label ?? history.accountID)
    }
  }
}

/// The wallet's sheets, attached to the navigation stack container rather than to a screen: a
/// sheet attached to a screen that is covered by a push waits until that screen is back on
/// top, so Receive from the network screen would only appear after popping.
struct WalletSheets: ViewModifier {
  var model: WalletModel

  func body(content: Content) -> some View {
    content
      .sheet(item: .presence({ model.setup }, close: { model.closeSetup() })) {
        setup in
        WalletSetupView(model: setup, dismiss: model.closeSetup)
      }
      .sheet(
        item: .presence({ model.accountRoute }, close: { model.closeAccountRoute() })
      ) { route in
        WalletAccountView(model: model, route: route)
      }
      .sheet(
        isPresented: .presented({ model.addressBookPresented }, close: { model.closeAddressBook() })
      ) {
        WalletAddressBookView(model: model.addressBook, dismiss: model.closeAddressBook)
      }
      .sheet(
        item: .presence({ model.recovery }, close: { model.closeRecovery() })
      ) { recovery in
        WalletRecoveryView(model: recovery, dismiss: model.closeRecovery)
      }
      .sheet(item: .presence({ model.send }, close: { model.closeSend() })) {
        send in
        WalletSendView(
          model: send, addressBook: model.addressBook, dismiss: model.closeSend,
          showHistory: model.showSendHistory)
      }
  }
}

extension View {
  func walletDestinations(_ model: WalletModel) -> some View {
    modifier(WalletDestinations(model: model))
  }
  func walletNetworkDestinations(_ model: WalletModel) -> some View {
    modifier(WalletNetworkDestinations(model: model))
  }
  func walletSheets(_ model: WalletModel) -> some View {
    modifier(WalletSheets(model: model))
  }
}
