import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct WalletModelTests {
  @Test func selectionStaysWithinTheWalletAndSurvivesReload() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 4, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    #expect(model.selectedWalletID == "a" && model.selectedAccountID == "a1")
    model.selectAccount("a2")
    await model.reload()?.value
    #expect(model.selectedAccountID == "a2")
    model.selectWallet("b")
    #expect(model.selectedAccountID == "b1")
    model.selectAccount("a1")
    #expect(model.selectedAccountID == "b1")
    store.wallets.removeAll { $0.walletID == "b" }
    store.accounts.removeAll { $0.walletID == "b" }
    await model.reload()?.value
    #expect(model.selectedWalletID == "a" && model.selectedAccountID == "a1")
    #expect(store.generations.allSatisfy { $0 == 4 })
  }

  @Test func creationSelectsItsIdentityAndUncertainCloseReconcilesWithoutAnotherWrite() async throws
  {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.beginSetup(.restore)
    let setup = try #require(model.setup)
    setup.change(.label, to: "New wallet")
    setup.change(.mnemonic, to: "synthetic words")
    await setup.submit()?.value
    await ready(model)
    #expect(model.setup == nil && model.selectedWallet?.walletID == "created")
    #expect(model.selectedAccount?.accountID == "created-account" && store.writes == 1)
    store.uncertainSave = true
    model.beginSetup(.restore)
    let uncertain = try #require(model.setup)
    uncertain.change(.label, to: "Unconfirmed wallet")
    uncertain.change(.mnemonic, to: "other words")
    await uncertain.submit()?.value
    #expect(uncertain.state == .uncertain && store.writes == 2)
    model.closeSetup()
    #expect(model.state == .loading && model.setup == nil && uncertain.state == .revoked)
    await ready(model)
    #expect(model.wallets.contains { $0.walletID == "unconfirmed" })
    #expect(store.writes == 2)
  }

  @Test func revokedCatalogCannotPublishAnOutstandingReadOrKeepItsForm() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.beginSetup(.restore)
    let setup = try #require(model.setup)
    setup.change(.mnemonic, to: "transient secret")
    store.delayList = true
    let read = model.reload()
    await store.waitForList()
    model.revoke()
    store.releaseList()
    await read?.value
    #expect(model.state == .revoked && model.status == nil && model.wallets.isEmpty)
    #expect(model.accounts.isEmpty && model.setup == nil && setup.value(.mnemonic).isEmpty)
    #expect(model.reload() == nil)
  }

  @Test func inactiveCoverHidesASecretWithoutDiscardingTheDraft() async throws {
    let model = WalletModel(
      store: WalletCatalogStore(), contacts: WalletContactsTestStore(),
      history: WalletHistoryTestStore(), send: WalletSendTestStore(),
      recovery: WalletRecoveryTestStore(), generation: 1,
      clipboard: WalletClipboard())
    await model.reload()?.value
    model.beginSetup(.restore)
    let setup = try #require(model.setup)
    setup.change(.mnemonic, to: "transient recovery words")
    setup.toggleVisibility(.mnemonic)
    #expect(setup.revealed.contains(.mnemonic))
    model.coverSensitiveValues()
    #expect(setup.revealed.isEmpty && setup.value(.mnemonic) == "transient recovery words")
    model.revoke()
    #expect(setup.value(.mnemonic).isEmpty && setup.revealed.isEmpty)
  }

  @Test func accountCreationRequiresNetworkAndSurvivesConcurrentReadRefresh() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.openAddAccount()
    #expect(model.addAccount() == nil && model.accountIssue == .chooseNetwork)
    // Account creation needs only the enabled Core network ID, not a private-key import profile.
    let advertised = store.status.networks[0].with(network: "fixture-enabled-chain")
    store.status = store.status.with(networks: [advertised])
    await model.reload()?.value
    model.chooseAccountNetwork("fixture-enabled-chain")
    store.delayMutation = true
    let write = try #require(model.addAccount())
    await store.waitForMutation()
    #expect(model.addAccount() == nil)
    model.closeAccountRoute()
    #expect(model.accountRoute != nil)
    await model.reload()?.value
    #expect(model.accountState == .working && store.accountWrites == 1)
    store.releaseMutation()
    await write.value
    #expect(model.accountState == .idle && model.accountRoute == nil)
    #expect(model.selectedWalletID == "a" && model.selectedAccountID == "added-account")
    #expect(
      model.accounts.contains {
        $0.accountID == "added-account" && $0.network == "fixture-enabled-chain"
      })
  }

  @Test func onlyOneSheetPresentsAtATimeAndDismissalsAreScoped() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard())
    await model.reload()?.value
    #expect(model.presentation == nil)
    model.openReceive()
    #expect(model.accountRoute != nil && model.presentation?.id == "account:receive:a1")
    // A second sheet cannot open over the first, and closing a sheet that is not shown is a no-op.
    model.openAddressBook()
    model.beginSetup(.create)
    model.openRecovery()
    #expect(!model.addressBookPresented && model.setup == nil && model.recovery == nil)
    model.closeSetup()
    model.closeAddressBook()
    model.closeRecovery()
    #expect(model.accountRoute != nil)
    model.closeAccountRoute()
    #expect(model.presentation == nil)
    // Sheets open over the pushed network screen, which stays where it is.
    model.openNetwork("a1")
    model.openReceive()
    #expect(model.accountRoute != nil && model.networkAccountID == "a1")
    model.closeAccountRoute()
    model.openAddressBook()
    #expect(model.addressBookPresented && model.networkAccountID == "a1")
    model.closeAddressBook()
    #expect(model.presentation == nil && model.networkAccountID == "a1")
    // Activity over the network screen is the network screen's own push; closing the network
    // screen takes it down with it.
    model.openHistory()
    #expect(model.networkHistoryPresented && !model.historyPresented)
    model.closeHistory()
    #expect(!model.historyShown)
    model.openHistory()
    model.closeNetwork()
    #expect(model.networkAccountID == nil && !model.historyShown)
    model.openHistory()
    #expect(model.historyPresented && !model.networkHistoryPresented)
  }

  @Test func networkScreenIsModelStateAndFollowsTheAccount() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard())
    await model.reload()?.value
    #expect(model.networkAccountID == nil)
    model.openNetwork("missing")
    #expect(model.networkAccountID == nil)
    model.openNetwork("a2")
    #expect(model.networkAccountID == "a2" && model.selectedAccountID == "a2")
    // One network screen at a time; history and receive are pushed or presented over it.
    model.openNetwork("a1")
    #expect(model.networkAccountID == "a2")
    model.openReceive()
    #expect(model.accountRoute != nil)
    model.closeAccountRoute()
    model.closeNetwork()
    #expect(model.networkAccountID == nil && model.selectedAccountID == "a2")
    // The screen closes when its account disappears from the catalog.
    model.openNetwork("a2")
    store.accounts.removeAll { $0.accountID == "a2" }
    await model.reload()?.value
    #expect(model.networkAccountID == nil)
  }

  @Test func networkScreenPreselectsAddAccountAndCopiesAnyAccountAddress() async throws {
    let store = WalletCatalogStore()
    let clipboard = WalletClipboard()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: clipboard)
    await model.reload()?.value
    // The network screen opens the add-account sheet with its network already chosen; an
    // unknown network leaves the choice open instead of failing.
    model.openAddAccount(network: "bitcoin")
    #expect(model.accountRoute != nil && model.accountNetwork == "bitcoin")
    model.closeAccountRoute()
    model.openAddAccount(network: "nope")
    #expect(model.accountRoute != nil && model.accountNetwork == nil)
    model.closeAccountRoute()
    // Copy works for an account that is not the selected one, and the fresh address for one
    // is requested for exactly that account.
    model.copyAddress(of: "a2")
    #expect(clipboard.values == ["a2-address"] && model.addressCopied)
    await model.generateReceivingAddress(for: "a2")?.value
    #expect(store.addressRequests.map(\.accountID) == ["a2"])
    #expect(model.walletAccounts.first { $0.accountID == "a2" }?.currentReceiveAddress == "next-a2")
    #expect(model.generateReceivingAddress(for: "missing") == nil)
  }

  @Test func receivingAddressAndClipboardFollowTheCapturedAccountAndRevoke() async throws {
    let store = WalletCatalogStore()
    let clipboard = WalletClipboard()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: clipboard)
    await model.reload()?.value
    model.openReceive()
    model.copyReceivingAddress()
    #expect(clipboard.values == ["a1-address"])
    model.selectWallet("b")
    #expect(model.receivingAccount?.accountID == "a1")
    store.delayMutation = true
    let write = try #require(model.generateReceivingAddress())
    await store.waitForMutation()
    #expect(model.receivingAddress == nil && model.generateReceivingAddress() == nil)
    model.copyReceivingAddress()
    #expect(clipboard.values.count == 1)
    store.releaseMutation()
    await write.value
    #expect(model.receivingAddress == "next-a1" && store.addressRequests.count == 1)
    #expect(
      store.addressRequests[0].accountID == "a1" && store.addressRequests[0].purpose == "receive")
    model.copyReceivingAddress()
    #expect(clipboard.values.last == "next-a1")
    model.closeAccountRoute()
    model.selectWallet("b")
    model.openReceive()
    #expect(model.receivingAddress == "b1-address" && !model.addressCopied)
    store.uncertainAddressWrite = true
    await model.generateReceivingAddress()?.value
    #expect(model.accountState == .uncertain && model.receivingAddress == "next-b1")
    #expect(model.generateReceivingAddress() == nil && store.addressRequests.count == 2)
    model.copyReceivingAddress()
    #expect(clipboard.values.last == "next-b1")
    model.acknowledgeAccountReconciliation()
    #expect(model.accountState == .idle)
    model.revoke()
    #expect(model.receivingAddress == nil && clipboard.values.isEmpty && model.accountRoute == nil)
  }

  @Test func uncertainAccountWriteReconcilesAndRequiresAnExplicitCheckBeforeAnotherWrite()
    async throws
  {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.openAddAccount()
    model.chooseAccountNetwork("bitcoin")
    store.uncertainAccountWrite = true
    await model.addAccount()?.value
    #expect(model.state == .ready && model.accountState == .uncertain)
    #expect(model.accounts.contains { $0.accountID == "added-account" })
    #expect(model.addAccount() == nil && store.accountWrites == 1)
    model.acknowledgeAccountReconciliation()
    #expect(model.accountState == .uncertain)
    model.closeAccountRoute()
    model.openAddAccount()
    #expect(model.accountRoute == nil)
    model.acknowledgeAccountReconciliation()
    model.openAddAccount()
    #expect(model.accountRoute != nil && model.accountNetwork == nil && store.accountWrites == 1)
  }

  @Test func removedWalletAndLateMutationCannotSwitchTheOperationTarget() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.openAddAccount()
    model.chooseAccountNetwork("bitcoin")
    store.wallets.removeFirst()
    await model.reload()?.value
    #expect(model.accountWallet == nil && model.derivableNetworks.isEmpty)
    #expect(
      model.addAccount() == nil && model.accountIssue == .unavailable && store.accountWrites == 0)
    model.closeAccountRoute()
    model.openAddAccount()
    model.chooseAccountNetwork("bitcoin")
    store.delayMutation = true
    let write = try #require(model.addAccount())
    await store.waitForMutation()
    model.revoke()
    store.releaseMutation()
    await write.value
    #expect(model.state == .revoked && model.accounts.isEmpty && model.selectedWalletID == nil)
    #expect(model.accountRoute == nil && model.accountState == .idle)
  }

  @Test func addressBookIsVaultScopedAndClosesOnlyAfterItsEditor() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: WalletClipboard()
    )
    await model.reload()?.value
    model.openAddressBook()
    await model.addressBook.reload()?.value
    #expect(model.addressBookPresented && model.addressBook.networks == ["bitcoin"])
    model.selectWallet("b")
    model.beginSetup(.restore)
    #expect(model.selectedWalletID == "a" && model.setup == nil)
    model.addressBook.add()
    model.addressBook.change(.label, to: "Unsaved")
    model.closeAddressBook()
    #expect(model.addressBookPresented)
    model.addressBook.discard()
    model.closeAddressBook()
    #expect(!model.addressBookPresented)
    model.openAddressBook()
    model.revoke()
    #expect(!model.addressBookPresented && model.addressBook.state == .revoked)
  }

  @Test func historyBelongsToTheAccountSurvivesSwitchingAndIsPurgedWithTheSession() async throws {
    let store = WalletCatalogStore()
    let historyStore = WalletHistoryTestStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: historyStore,
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(), generation: 4,
      clipboard: WalletClipboard())
    await model.reload()?.value
    let first = try #require(model.history)
    await first.loadIfNeeded()?.value
    #expect(first.accountID == "a1" && first.walletID == "a" && !first.providerReady)
    model.selectWallet("b")
    let second = try #require(model.history)
    #expect(second !== first && second.accountID == "b1")
    model.selectWallet("a")
    #expect(model.history === first)
    await model.reload()?.value
    #expect(model.history === first && first.state == .ready && historyStore.reads.count == 1)
    store.accounts.removeAll { $0.accountID == "a1" }
    await model.reload()?.value
    #expect(first.state == .revoked && model.history?.accountID == "a2")
    let remaining = try #require(model.history)
    model.revoke()
    #expect(model.history == nil && remaining.state == .revoked && second.state == .revoked)
  }

  @Test func balancesAreFetchedLiveForReachableNetworksOfTheSelectedWallet() async throws {
    let store = WalletCatalogStore()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 4, clipboard: WalletClipboard())
    // The default fixture provider is unavailable: nothing is fetched, the cache stays empty.
    await model.reload()?.value
    #expect(store.balanceRequests.isEmpty && model.balances.isEmpty)

    store.status = WalletSendTestStore().status("bitcoin")
    await model.reload()?.value
    await Task.yield()
    #expect(store.balanceRequests.sorted() == ["a1", "a2"])
    #expect(model.balanceLoading.isEmpty)
    let a1 = try #require(model.walletAccounts.first { $0.accountID == "a1" })
    #expect(model.formattedBalance(for: a1) == "1.5 BTC" && model.selectedBalance != nil)

    // Switching wallets fetches that wallet's accounts; a failed fetch keeps the cached value.
    store.balanceFailure = WalletCatalogError.uncertain
    model.selectWallet("b")
    await Task.yield()
    await Task.yield()
    #expect(store.balanceRequests.last == "b1" && model.balanceLoading.isEmpty)
    #expect(model.formattedBalance(for: a1) == "1.5 BTC")
    model.revoke()
    #expect(model.balances.isEmpty && model.balanceLoading.isEmpty)
  }

  @Test func restoreDiscoveryRunsOncePerNetworkBeforeBalancesAreFetched() async throws {
    let store = WalletCatalogStore()
    store.status = WalletSendTestStore().status("bitcoin")
    store.wallets = [
      WalletCatalogStore.wallet("a", pending: ["bitcoin"]), WalletCatalogStore.wallet("b"),
    ]
    store.delayMutation = true
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 4, clipboard: WalletClipboard())
    await model.reload()?.value
    await store.waitForMutation()
    let a1 = try #require(model.walletAccounts.first { $0.accountID == "a1" })
    // Wallet "a" still has to scan Bitcoin: plain balances wait, the scan runs on one account.
    #expect(model.discoveryPending(for: a1) && model.discoveringWalletID == "a")
    #expect(store.discoveryRequests == ["a1"] && store.balanceRequests == ["a1"])

    store.delayMutation = false
    store.releaseMutation()
    for _ in 0..<40 where store.balanceRequests.count < 3 { await Task.yield() }
    // The follow-up reload sees the cleared flag and fetches the wallet's balances.
    #expect(!model.discoveryPending(for: a1) && model.discoveringWalletID == nil)
    #expect(store.balanceRequests.sorted() == ["a1", "a1", "a2"])

    // A failed scan leaves Core's flag set but is not retried on every reload.
    store.wallets = [
      WalletCatalogStore.wallet("a", pending: ["bitcoin"]), WalletCatalogStore.wallet("b"),
    ]
    store.discoveryRequests = []
    await model.reload()?.value
    for _ in 0..<6 { await Task.yield() }
    #expect(store.discoveryRequests.isEmpty && model.discoveryPending(for: a1))
  }

  @Test func receiveSwitchesNetworkAccountsWithinTheWalletOnly() async throws {
    let store = WalletCatalogStore()
    let clipboard = WalletClipboard()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: WalletSendTestStore(), recovery: WalletRecoveryTestStore(),
      generation: 1, clipboard: clipboard)
    await model.reload()?.value
    model.switchReceivingAccount("a2")
    #expect(model.accountRoute == nil && model.selectedAccountID == "a1")
    model.openReceive()
    model.copyReceivingAddress()
    model.switchReceivingAccount("a2")
    #expect(model.receivingAccount?.accountID == "a2" && model.selectedAccountID == "a2")
    #expect(model.receivingAddress == "a2-address" && !model.addressCopied)
    model.switchReceivingAccount("b1")
    #expect(model.receivingAccount?.accountID == "a2" && model.selectedWalletID == "a")
    model.closeAccountRoute()
    #expect(model.selectedAccountID == "a2" && model.history?.accountID == "a2")
  }

  @Test func sendCapturesTheAccountAndSessionRevokesItsDraft() async throws {
    let store = WalletCatalogStore()
    let sends = WalletSendTestStore()
    store.status = sends.status()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: sends, recovery: WalletRecoveryTestStore(), generation: 4, clipboard: WalletClipboard())
    await model.reload()?.value
    model.openSend()
    let send = try #require(model.send)
    model.selectWallet("b")
    model.openReceive()
    #expect(send.accountID == "a1" && model.selectedWalletID == "a" && model.accountRoute == nil)
    model.closeSend()
    #expect(model.send == nil && send.state == .revoked)
    model.openHistory()
    model.selectWallet("b")
    #expect(model.selectedWalletID == "a")
    model.closeHistory()
    model.openSend()
    let current = try #require(model.send)
    model.revoke()
    #expect(current.state == .revoked && model.send == nil && !model.historyPresented)
  }

  @Test func historyAuthorizationIsCoveredAndNavigationWaitsForRebroadcast() async throws {
    let store = WalletCatalogStore()
    let sends = WalletSendTestStore()
    let journal = WalletHistoryTestStore()
    store.status = sends.status()
    sends.rebroadcastResult = sends.rebroadcastResult.with(network: "bitcoin")
    journal.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          WalletTransactionEntry(
            accountID: "a1", amount: "1000", amountUnit: "satoshi", broadcastArtifactRef: "tx",
            counterparty: "recipient", createdAt: 1, direction: .outgoing, fee: "10",
            messageRef: nil,
            network: "bitcoin", status: "broadcast_unknown", txHash: nil, txRef: "tx", updatedAt: 1,
            validUntil: nil, walletID: "a")
        ])
    ]
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: journal, send: sends,
      recovery: WalletRecoveryTestStore(),
      generation: 4, clipboard: WalletClipboard())
    await model.reload()?.value
    model.openHistory()
    let history = try #require(model.history)
    await history.loadIfNeeded()?.value
    history.open("tx")
    history.beginRebroadcast()
    history.changeRebroadcastPassword("covered")
    model.coverSensitiveValues()
    #expect(history.rebroadcastPassword.isEmpty && history.reviewingRebroadcast)
    history.changeRebroadcastPassword("master")
    sends.rebroadcastGate.enabled = true
    let publishing = try #require(history.confirmRebroadcast())
    await sends.rebroadcastGate.wait()
    model.closeHistory()
    #expect(model.historyPresented && history.selectedID == "tx")
    sends.rebroadcastGate.release()
    await publishing.value
    model.closeHistory()
    #expect(!model.historyPresented && history.selectedID == nil)
    #expect(history.entries[0].status == "pending" && sends.generations == [4])
  }

  @Test func recoveryCapturesTheWalletAndCoverRequiresFreshAuthorization() async throws {
    let store = WalletCatalogStore()
    let sends = WalletSendTestStore()
    let recoveryStore = WalletRecoveryTestStore()
    recoveryStore.result = recoveryStore.result.with(walletID: "a")
    store.status = sends.status()
    let model = WalletModel(
      store: store, contacts: WalletContactsTestStore(), history: WalletHistoryTestStore(),
      send: sends, recovery: recoveryStore, generation: 4, clipboard: WalletClipboard())
    await model.reload()?.value
    model.openRecovery()
    let recovery = try #require(model.recovery)
    model.selectWallet("b")
    model.openSend()
    #expect(model.selectedWalletID == "a" && recovery.walletID == "a" && model.send == nil)
    recovery.changePassword("master")
    await recovery.reveal()?.value
    #expect(recovery.recovery != nil)
    model.coverSensitiveValues()
    #expect(recovery.recovery == nil && recovery.state == .editing)
    #expect(recovery.reveal() == nil && recovery.issue == .passwordRequired)
    model.closeRecovery()
    #expect(model.recovery == nil && recovery.state == .revoked)
    model.openRecovery()
    let removed = try #require(model.recovery)
    store.wallets[0] = store.wallets[0].with(kind: "imported")
    await model.reload()?.value
    #expect(!model.canRecover && model.recovery == nil && removed.state == .revoked)
    model.openRecovery()
    #expect(model.recovery == nil)
  }

  private func ready(_ model: WalletModel) async {
    while model.state == .loading { try? await Task.sleep(for: .milliseconds(20)) }
  }

  @Test func dismissRequiresExplicitDiscardOfAnEnteredSecret() {
    let store = WalletCatalogStore()
    let model = WalletSetupModel(
      intent: .restore, status: store.status, store: store, generation: 1
    ) { _, _ in }
    #expect(model.requestDismiss())
    model.change(.mnemonic, to: "entered secret")
    #expect(!model.requestDismiss() && model.confirmingDiscard)
    model.cancelDiscard()
    #expect(!model.confirmingDiscard && model.value(.mnemonic) == "entered secret")
    model.revoke()
    #expect(!model.confirmingDiscard && model.value(.mnemonic).isEmpty)
  }
}

private enum WalletCatalogError: Error { case uncertain }

@MainActor
private final class WalletCatalogStore: WalletStore {
  var status = WalletStatusResponse(
    disabledReason: nil, enabled: true, initialized: true,
    networks: [
      WalletNetworkStatus(
        broadcastEnabled: false, capabilities: [], disabledReason: nil,
        enabled: true, network: "bitcoin", providerStatus: .unavailable)
    ], walletCount: 2)
  var wallets = [WalletCatalogStore.wallet("a"), WalletCatalogStore.wallet("b")]
  var accounts = [
    WalletCatalogStore.account("a1", wallet: "a"), WalletCatalogStore.account("a2", wallet: "a"),
    WalletCatalogStore.account("b1", wallet: "b"),
  ]
  var generations: [UInt64] = []
  var writes = 0
  var uncertainSave = false
  var delayList = false
  private var pending: CheckedContinuation<Void, Never>?
  private var waiter: CheckedContinuation<Void, Never>?
  var accountWrites = 0
  var addressRequests: [WalletAddressesDeriveRequest] = []
  var delayMutation = false
  var uncertainAccountWrite = false
  var uncertainAddressWrite = false
  private var pendingMutation: CheckedContinuation<Void, Never>?
  private var mutationWaiter: CheckedContinuation<Void, Never>?
  private func pauseMutation() async {
    if delayMutation {
      await withCheckedContinuation {
        pendingMutation = $0
        mutationWaiter?.resume()
        mutationWaiter = nil
      }
    }
  }
  func waitForMutation() async {
    if pendingMutation == nil { await withCheckedContinuation { mutationWaiter = $0 } }
  }
  func releaseMutation() {
    delayMutation = false
    pendingMutation?.resume()
    pendingMutation = nil
  }
  func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
    async throws -> WalletAccountsDeriveResponse
  {
    accountWrites += 1
    await pauseMutation()
    accounts.append(
      Self.account("added-account", wallet: request.walletID).with(network: request.network))
    if uncertainAccountWrite { throw WalletCatalogError.uncertain }
    return WalletAccountsDeriveResponse(accountID: "added-account")
  }
  func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
    async throws -> WalletAddressesDeriveResponse
  {
    addressRequests.append(request)
    await pauseMutation()
    let index = try #require(accounts.firstIndex { $0.accountID == request.accountID })
    let address = "next-" + request.accountID
    accounts[index] = accounts[index].with(currentReceiveAddress: .some(address))
    if uncertainAddressWrite { throw WalletCatalogError.uncertain }
    return WalletAddressesDeriveResponse(
      accountID: request.accountID, address: address,
      derivationPath: "synthetic", index: 1, publicKey: "synthetic", purpose: request.purpose)
  }
  func walletStatus(generation: UInt64) async throws -> WalletStatusResponse {
    generations.append(generation)
    return status
  }
  func walletList(generation: UInt64) async throws -> WalletListResponse {
    let result = WalletListResponse(wallets: wallets)
    if delayList {
      await withCheckedContinuation { continuation in
        pending = continuation
        waiter?.resume()
        waiter = nil
      }
    }
    return result
  }
  func walletAccounts(walletID: String?, generation: UInt64) async throws
    -> WalletAccountsListResponse
  {
    WalletAccountsListResponse(accounts: accounts, cachedBalances: [])
  }
  var balanceRequests: [String] = []
  var balanceFailure: (any Error)?
  var discoveryRequests: [String] = []
  var discoveryFailure: (any Error)?
  func discoverWalletAddresses(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  {
    discoveryRequests.append(accountID)
    if let discoveryFailure { throw discoveryFailure }
    // Core clears the wallet's pending flags once the scan completes.
    wallets = wallets.map { wallet in
      guard
        accounts.contains(where: { $0.accountID == accountID && $0.walletID == wallet.walletID })
      else { return wallet }
      return Self.wallet(wallet.walletID, pending: [])
    }
    return try await walletBalance(accountID: accountID, generation: generation)
  }
  func walletBalance(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  {
    balanceRequests.append(accountID)
    generations.append(generation)
    await pauseMutation()
    if let balanceFailure { throw balanceFailure }
    return WalletBalanceGetResponse(
      accountID: accountID,
      balance: WalletBalance(
        amountUnit: "satoshi", pendingIn: "0", pendingOut: "0", spendable: "150000000",
        total: "150000000"),
      fetchedAt: 42_000, network: "bitcoin")
  }
  func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
    -> WalletHDCreateResponse
  {
    writes += 1
    let id = uncertainSave ? "unconfirmed" : "created"
    let account = Self.account(id + "-account", wallet: id)
    wallets.append(Self.wallet(id))
    accounts.append(account)
    if uncertainSave { throw WalletCatalogError.uncertain }
    return WalletHDCreateResponse(accounts: [account], walletID: id)
  }
  func generateWalletMnemonic(_ request: WalletHDGenerateMnemonicRequest, generation: UInt64)
    async throws -> WalletHDGenerateMnemonicResponse
  { throw BridgeError.CapabilityUnavailable }
  func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
    -> WalletImportCreateResponse
  { throw BridgeError.CapabilityUnavailable }
  func waitForList() async { if pending == nil { await withCheckedContinuation { waiter = $0 } } }
  func releaseList() {
    pending?.resume()
    pending = nil
    delayList = false
  }
  static func wallet(_ id: String, pending: [String]? = nil) -> WalletSummary {
    WalletSummary(
      accountDiscoveryPending: pending, bitcoinDiscoveryPending: nil, createdAt: 1, kind: "hd",
      label: id, mnemonicStandard: "bip39", supportedNetworks: ["bitcoin"], updatedAt: 1,
      walletID: id, walletMode: "multichain")
  }
  private static func account(_ id: String, wallet: String) -> WalletAccountMeta {
    WalletAccountMeta(
      accountID: id, address: id + "-address", createdAt: 1, curve: nil, kind: .derived,
      label: id, network: "bitcoin", publicKey: nil, rawAccount: nil, updatedAt: 1,
      walletContract: nil,
      walletID: wallet, workchain: nil, accountIndex: 0, accountModel: "utxo",
      currentReceiveAddress: nil,
      currentReceiveDerivationPath: nil, derivationPath: nil, derivationProfile: "bip84",
      mnemonicStandard: "bip39",
      nextChangeIndex: 0, nextReceiveIndex: 0, walletMode: "multichain")
  }
}

@MainActor
private final class WalletClipboard: CredentialClipboard {
  var values: [String] = []
  func copy(_ value: String) { values.append(value) }
  func clearOwned() { values = [] }
}
