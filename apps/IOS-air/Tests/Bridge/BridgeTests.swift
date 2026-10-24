import Foundation
import XCTest

@testable import ChromVoidBridge

final class BridgeTests: XCTestCase {
  #if AIR_FIXTURE
    func testPasskeyFixtureRejectsNonUITestHostBeforeOpeningStorage() async {
      do {
        try await preparePasskeyUiFixture(
          expectedFingerprint: BuildFingerprint.expected,
          storageRoot: "/not-a-test-root", password: "synthetic")
        XCTFail("Only the dedicated UI test host may prepare this fixture")
      } catch {
        guard case BridgeError.InvalidApplicationIdentity = error else {
          return XCTFail("Expected identity rejection, received \(type(of: error))")
        }
      }
    }

    func testRustFixtureDecodesWithGeneratedSwiftContracts() async throws {
      let report = try await FixtureProbe().run()
      XCTAssertEqual(report.protocolVersion, 1)
      XCTAssertTrue(report.initiallyLocked)
      XCTAssertEqual(report.entryCount, 1)
      XCTAssertEqual(report.folderCount, 1)
      XCTAssertTrue(report.lockedAfterProbe)
    }

    func testRustProducedFixturesDecodeInSwift() throws {
      let url = try XCTUnwrap(
        Bundle(for: Self.self).url(forResource: "wire-fixtures", withExtension: "json"))
      let fixtures = try XCTUnwrap(
        JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
      let decoder = JSONDecoder()
      for name in ["locked_status", "active_status", "unknown_optional_field"] {
        let data = try JSONSerialization.data(withJSONObject: XCTUnwrap(fixtures[name]))
        let response = try decoder.decode(RPCResult<VaultStatusResponse>.self, from: data)
        XCTAssertEqual(response.value.isUnlocked, name == "active_status")
      }
      let list = try decoder.decode(
        RPCResult<PassmanagerEntryListResponse>.self,
        from: JSONSerialization.data(withJSONObject: XCTUnwrap(fixtures["list"])))
      XCTAssertEqual(list.value.entries.count, 1)
      let page = try decoder.decode(
        RPCResult<PassmanagerEntryPageResponse>.self,
        from: JSONSerialization.data(withJSONObject: XCTUnwrap(fixtures["entry_page"]))
      ).value
      XCTAssertEqual(page.entries.first?.title, "Почта")
      XCTAssertEqual(page.nextOffset, 50)
      XCTAssertThrowsError(
        try decoder.decode(
          RPCResult<VaultStatusResponse>.self,
          from: JSONSerialization.data(withJSONObject: XCTUnwrap(fixtures["validation_failure"]))))
    }

    func testRustWalletAccountsPreserveKindAddressesAndExactAmounts() throws {
      let url = try XCTUnwrap(
        Bundle(for: Self.self).url(forResource: "wire-fixtures", withExtension: "json"))
      let fixtures = try XCTUnwrap(
        JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
      let data = try JSONSerialization.data(withJSONObject: XCTUnwrap(fixtures["wallet_accounts"]))
      let response = try JSONDecoder().decode(
        RPCResult<WalletAccountsListResponse>.self, from: data
      )
      .value
      XCTAssertEqual(response.accounts.map(\.kind), [.imported, .derived])
      XCTAssertEqual(response.accounts[0].address, "synthetic-imported")
      XCTAssertNil(response.accounts[1].address)
      XCTAssertEqual(response.accounts[1].currentReceiveAddress, "synthetic-receive")
      XCTAssertEqual(response.accounts[1].network, "fixture-chain")
      XCTAssertEqual(response.cachedBalances?.first?.balance.total, "900719925474099312345")
    }

    @MainActor
    func testNativeWalletMetadataRequiresAnUnlockedCurrentSession() async throws {
      let client = try await RuntimeClient.open()
      addTeardownBlock { @MainActor in
        var snapshot = try client.close()
        while snapshot.cleanupPending {
          snapshot = try await client.events(after: snapshot.sequence).snapshot
        }
      }
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-wallet-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let status = try await client.walletStatus(generation: generation)
      let wallets = try await client.walletList(generation: generation)
      let accounts = try await client.walletAccounts(walletID: nil, generation: generation)
      XCTAssertFalse(status.initialized)
      XCTAssertEqual(status.walletCount, 0)
      XCTAssertTrue(wallets.wallets.isEmpty)
      XCTAssertTrue(accounts.accounts.isEmpty)
      _ = try client.deactivate()
      do {
        _ = try await client.walletList(generation: generation)
        XCTFail("Background must revoke wallet reads")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativeWalletSetupCreatesRestoresAndImportsThroughCore() async throws {
      let client = try await openWalletFixture(password: "air-wallet-setup-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let status = try await client.walletStatus(generation: generation)
      XCTAssertTrue(status.enabled)
      XCTAssertFalse(status.networks.isEmpty)
      XCTAssertTrue(
        status.networks.allSatisfy { !$0.broadcastEnabled && $0.providerStatus == .unavailable })
      let draft = try await client.generateWalletMnemonic(
        WalletHDGenerateMnemonicRequest(
          mnemonicStandard: "rotation", walletMode: "multichain", wordCount: 12,
          wordlist: "english"),
        generation: generation)
      XCTAssertEqual(draft.mnemonic.count, 12)
      let empty = try await client.walletList(generation: generation)
      XCTAssertTrue(empty.wallets.isEmpty)
      let request = WalletHDCreateRequest(
        bip39Passphrase: nil, clientRequestID: UUID().uuidString, label: "Synthetic generated",
        mnemonic: nil, mnemonicDraftID: draft.mnemonicDraftID, mnemonicStandard: "rotation",
        supportedNetworks: ["bitcoin"], walletMode: "multichain", wordlist: "english")
      let created = try await client.createHDWallet(request, generation: generation)
      XCTAssertEqual(created.accounts.first?.kind, .derived)
      let replay = try await client.createHDWallet(request, generation: generation)
      XCTAssertEqual(replay.walletID, created.walletID)
      do {
        _ = try await client.createHDWallet(
          request.with(mnemonic: .some(["invalid"]), mnemonicDraftID: .some(nil)),
          generation: generation)
        XCTFail("Core must reject a changed payload under the same request ID")
      } catch let failure as RPCFailure {
        XCTAssertEqual(failure.code, "INVALID_INPUT")
      }
      let restored = try await client.createHDWallet(
        WalletHDCreateRequest(
          bip39Passphrase: nil, clientRequestID: UUID().uuidString, label: "Synthetic restored",
          mnemonic: draft.mnemonic, mnemonicDraftID: nil, mnemonicStandard: "bip39",
          supportedNetworks: ["bitcoin"], walletMode: "multichain", wordlist: "english"),
        generation: generation)
      XCTAssertNotEqual(restored.walletID, created.walletID)
      let imported = try await client.importWallet(
        WalletImportCreateRequest(
          clientRequestID: UUID().uuidString, curve: "ed25519", encoding: "hex",
          label: "Synthetic imported", network: "ton",
          privateKey: String(repeating: "01", count: 32)),
        generation: generation)
      let accounts = try await client.walletAccounts(
        walletID: imported.walletID, generation: generation)
      XCTAssertEqual(accounts.accounts.first?.accountID, imported.accountID)
      XCTAssertEqual(accounts.accounts.first?.kind, .imported)
      let wallets = try await client.walletList(generation: generation)
      XCTAssertEqual(wallets.wallets.count, 3)
      let derived = try await client.deriveWalletAccount(
        WalletAccountsDeriveRequest(network: "bitcoin", walletID: created.walletID),
        generation: generation)
      let derivedAccounts = try await client.walletAccounts(
        walletID: created.walletID, generation: generation)
      XCTAssertEqual(derivedAccounts.accounts.count, 2)
      let derivedAccount = try XCTUnwrap(
        derivedAccounts.accounts.first { $0.accountID == derived.accountID })
      XCTAssertEqual(derivedAccount.accountIndex, 1)
      XCTAssertEqual(derivedAccount.network, "bitcoin")
      XCTAssertEqual(derivedAccount.walletID, created.walletID)
      let receive = try await client.deriveWalletAddress(
        WalletAddressesDeriveRequest(accountID: derived.accountID, purpose: "receive"),
        generation: generation)
      XCTAssertEqual(receive.accountID, derived.accountID)
      XCTAssertEqual(receive.index, derivedAccount.nextReceiveIndex)
      XCTAssertNotEqual(receive.address, derivedAccount.currentReceiveAddress)
      let refreshedAccounts = try await client.walletAccounts(
        walletID: created.walletID, generation: generation)
      XCTAssertEqual(
        refreshedAccounts.accounts.first { $0.accountID == derived.accountID }?
          .currentReceiveAddress,
        receive.address)
      do {
        _ = try await client.deriveWalletAccount(
          WalletAccountsDeriveRequest(network: "ton", walletID: imported.walletID),
          generation: generation)
        XCTFail("Imported keys must not derive another account")
      } catch let failure as RPCFailure {
        XCTAssertEqual(failure.code, "UNSUPPORTED_ACCOUNT_MODEL")
      }
      _ = try client.deactivate()
      do {
        _ = try await client.createHDWallet(request, generation: generation)
        XCTFail("Background must revoke wallet mutations")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
      do {
        _ = try await client.deriveWalletAddress(
          WalletAddressesDeriveRequest(accountID: derived.accountID, purpose: "receive"),
          generation: generation)
        XCTFail("Background must revoke address derivation")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativeWalletAddressBookUsesCoreAndRevokesStaleMutations() async throws {
      let password = "air-wallet-contacts-" + UUID().uuidString
      let client = try await openWalletFixture(password: password)
      let generation = try client.snapshot().generation
      let empty = try await client.listWalletContacts(generation: generation)
      XCTAssertTrue(empty.entries.isEmpty)
      let wallet = try await client.importWallet(
        WalletImportCreateRequest(
          clientRequestID: UUID().uuidString, curve: "ed25519", encoding: "hex",
          label: "Synthetic contact source", network: "ton",
          privateKey: String(repeating: "01", count: 32)),
        generation: generation)
      let accounts = try await client.walletAccounts(
        walletID: wallet.walletID, generation: generation)
      let address = try XCTUnwrap(accounts.accounts.first?.address)
      let request = WalletAddressBookCreateRequest(
        address: address, label: "  Savings  ", network: "ton")
      let created = try await client.createWalletContact(request, generation: generation)
      XCTAssertEqual(created.entry.label, "Savings")
      XCTAssertEqual(created.entry.network, "ton")
      XCTAssertFalse(created.entry.address.isEmpty)
      do {
        _ = try await client.createWalletContact(
          request.with(address: created.entry.address, label: "Duplicate"), generation: generation)
        XCTFail("Core must reject a duplicate canonical address without adding a record")
      } catch let failure as RPCFailure {
        XCTAssertEqual(failure.code, "INVALID_INPUT")
      }
      let updated = try await client.updateWalletContact(
        WalletAddressBookUpdateRequest(
          address: created.entry.address, entryID: created.entry.entryID,
          label: "Long-term savings", network: "ton"),
        generation: generation)
      XCTAssertEqual(updated.entry.entryID, created.entry.entryID)
      XCTAssertEqual(updated.entry.createdAt, created.entry.createdAt)
      XCTAssertEqual(updated.entry.label, "Long-term savings")
      var snapshot = try client.lock()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
      try await client.unlock(password: password)
      let nextGeneration = try client.snapshot().generation
      XCTAssertNotEqual(nextGeneration, generation)
      let deletion = WalletAddressBookDeleteRequest(entryID: created.entry.entryID)
      do {
        _ = try await client.deleteWalletContact(deletion, generation: generation)
        XCTFail("An old form must not delete a contact after a new unlock")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
      let persisted = try await client.listWalletContacts(generation: nextGeneration)
      XCTAssertEqual(persisted.entries.count, 1)
      XCTAssertEqual(persisted.entries.first?.entryID, updated.entry.entryID)
      XCTAssertEqual(persisted.entries.first?.address, updated.entry.address)
      XCTAssertEqual(persisted.entries.first?.label, updated.entry.label)
      let deleted = try await client.deleteWalletContact(deletion, generation: nextGeneration)
      XCTAssertEqual(deleted.entryID, created.entry.entryID)
      let remaining = try await client.listWalletContacts(generation: nextGeneration)
      XCTAssertTrue(remaining.entries.isEmpty)
      _ = try client.deactivate()
      do {
        _ = try await client.createWalletContact(request, generation: nextGeneration)
        XCTFail("Background must revoke contact mutations")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativeWalletHistoryUsesCorePaginationAndStatusReconciliation() async throws {
      let client = try await openWalletFixture(
        password: "air-history-" + UUID().uuidString, fixture: .history)
      let generation = try client.snapshot().generation
      let wallet = try await client.importWallet(
        WalletImportCreateRequest(
          clientRequestID: UUID().uuidString, curve: "ed25519", encoding: "hex",
          label: "Synthetic history", network: "ton", privateKey: String(repeating: "01", count: 32)
        ),
        generation: generation)
      let request = WalletTransactionsListRequest(
        accountID: wallet.accountID, cursor: nil,
        limit: 1, status: nil, walletID: wallet.walletID)
      let empty = try await client.walletTransactions(request, generation: generation)
      XCTAssertTrue(empty.transactions.isEmpty)
      let syncRequest = WalletTransactionsSyncRequest(accountID: wallet.accountID, limit: 50)
      for _ in 0..<2 {
        let synced = try await client.syncWalletTransactions(syncRequest, generation: generation)
        XCTAssertEqual(synced.accountID, wallet.accountID)
        XCTAssertEqual(synced.syncedCount, 2)
      }
      let first = try await client.walletTransactions(request, generation: generation)
      XCTAssertEqual(first.transactions.count, 1)
      let outgoing = try XCTUnwrap(first.transactions.first)
      XCTAssertEqual(outgoing.walletID, wallet.walletID)
      XCTAssertEqual(outgoing.accountID, wallet.accountID)
      XCTAssertEqual(outgoing.status, "pending")
      XCTAssertEqual(outgoing.direction, .outgoing)
      XCTAssertEqual(outgoing.amount, "42")
      XCTAssertEqual(outgoing.fee, "3")
      let cursor = try XCTUnwrap(first.nextCursor)
      let second = try await client.walletTransactions(
        request.with(cursor: .some(cursor)), generation: generation)
      XCTAssertEqual(second.transactions.count, 1)
      let incoming = try XCTUnwrap(second.transactions.first)
      XCTAssertEqual(incoming.amount, "900719925474099312345")
      XCTAssertEqual(incoming.direction, .incoming)
      XCTAssertEqual(incoming.counterparty, "synthetic-sender")
      XCTAssertNil(second.nextCursor)
      let refreshed = try await client.refreshWalletTransaction(
        WalletTransactionsRefreshRequest(txRef: outgoing.txRef), generation: generation)
      XCTAssertEqual(refreshed.txRef, outgoing.txRef)
      XCTAssertEqual(refreshed.status, "confirmed")
      let confirmed = try await client.walletTransactions(
        WalletTransactionsListRequest(
          accountID: wallet.accountID, cursor: nil,
          limit: 50, status: "confirmed", walletID: wallet.walletID), generation: generation)
      XCTAssertEqual(
        Set(confirmed.transactions.map(\.txRef)), Set([incoming.txRef, outgoing.txRef]))
      _ = try client.deactivate()
      do {
        _ = try await client.syncWalletTransactions(syncRequest, generation: generation)
        XCTFail("Background must revoke history synchronization")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
      do {
        _ = try await client.walletTransactions(request, generation: generation)
        XCTFail("Background must revoke transaction details")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativeWalletSendUsesCoreReviewCancelAndUnknownReconciliation() async throws {
      let client = try await openWalletFixture(
        password: "air-send-" + UUID().uuidString, fixture: .send)
      let generation = try client.snapshot().generation
      let imported = try await client.importWallet(
        WalletImportCreateRequest(
          clientRequestID: UUID().uuidString, curve: "ed25519", encoding: "hex",
          label: "Synthetic sender", network: "ton", privateKey: String(repeating: "01", count: 32)),
        generation: generation)
      let accounts = try await client.walletAccounts(
        walletID: imported.walletID, generation: generation)
      let account = try XCTUnwrap(accounts.accounts.first)
      let address = try XCTUnwrap(account.address)
      let policy = WalletFeePolicy(tier: .standard)
      let output = WalletTransactionOutput(
        address: address, amount: "1000000000", comment: "synthetic memo")
      let request = WalletTransactionPrepareRequest(
        accountID: imported.accountID, feePolicy: policy, maximizeOutputIndex: nil, network: "ton",
        outputs: [output])
      let quote = try await client.quoteWalletTransaction(
        WalletTransactionQuoteRequest(
          accountID: imported.accountID, feePolicy: policy, maxOutputIndex: 0, network: "ton",
          outputs: [
            WalletTransactionQuoteOutput(
              address: address, amount: "1000000000", comment: "synthetic memo")
          ]),
        generation: generation)
      XCTAssertEqual(quote.spendable, "2000000000")
      XCTAssertEqual(quote.maxAmount, "1995000000")
      XCTAssertEqual(quote.currentPreview?.totalDebit, "1005000000")
      let cancelledPreparation = try await client.prepareWalletTransaction(
        request, generation: generation)
      XCTAssertEqual(cancelledPreparation.walletID, imported.walletID)
      XCTAssertEqual(cancelledPreparation.accountID, imported.accountID)
      XCTAssertEqual(cancelledPreparation.network, "ton")
      XCTAssertEqual(cancelledPreparation.preview.estimatedFee, "5000000")
      XCTAssertEqual(cancelledPreparation.preview.amountUnit, "nanoton")
      XCTAssertEqual(cancelledPreparation.preview.outputs.first?.address, address)
      XCTAssertEqual(cancelledPreparation.preview.outputs.first?.amount, "1000000000")
      XCTAssertEqual(cancelledPreparation.preview.outputs.first?.comment, "synthetic memo")
      let cancelled = try await client.cancelWalletTransaction(
        WalletTransactionCancelRequest(preparationID: cancelledPreparation.preparationID),
        generation: generation)
      XCTAssertTrue(cancelled.cancelled)
      do {
        _ = try await client.confirmWalletTransaction(
          WalletTransactionConfirmRequest(
            acceptedWarnings: [], masterPassword: "air-synthetic-administrator",
            preparationID: cancelledPreparation.preparationID, spendAuthorizationID: nil),
          generation: generation)
        XCTFail("A cancelled preparation cannot be confirmed")
      } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "PREPARATION_NOT_FOUND") }
      let prepared = try await client.prepareWalletTransaction(request, generation: generation)
      let confirmation = WalletTransactionConfirmRequest(
        acceptedWarnings: prepared.preview.warnings.map(\.code),
        masterPassword: "air-synthetic-administrator",
        preparationID: prepared.preparationID, spendAuthorizationID: nil)
      let unknown = try await client.confirmWalletTransaction(confirmation, generation: generation)
      XCTAssertEqual(unknown.status, .broadcastUnknown)
      let repeated = try await client.confirmWalletTransaction(confirmation, generation: generation)
      XCTAssertEqual(repeated.txRef, unknown.txRef)
      XCTAssertEqual(repeated.status, .broadcastUnknown)
      do {
        _ = try await client.prepareWalletTransaction(request, generation: generation)
        XCTFail("An unresolved broadcast must block a new preparation")
      } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "BROADCAST_UNKNOWN") }
      let replay = try await client.rebroadcastWalletTransaction(
        WalletTransactionRebroadcastRequest(
          masterPassword: "air-synthetic-administrator", txRef: unknown.txRef),
        generation: generation)
      XCTAssertEqual(replay.txRef, unknown.txRef)
      XCTAssertEqual(replay.status, "pending")
      let journal = try await client.walletTransactions(
        WalletTransactionsListRequest(
          accountID: imported.accountID, cursor: nil, limit: 50, status: nil,
          walletID: imported.walletID),
        generation: generation)
      XCTAssertEqual(journal.transactions.count, 1)
      XCTAssertEqual(journal.transactions.first?.txRef, unknown.txRef)
      XCTAssertEqual(journal.transactions.first?.amount, "1000000000")
      XCTAssertEqual(journal.transactions.first?.fee, "5000000")
      _ = try client.deactivate()
      do {
        _ = try await client.confirmWalletTransaction(confirmation, generation: generation)
        XCTFail("Background must revoke confirmation authority")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativeWalletRecoveryRequiresReauthenticationAndPreservesTheRecoveryMaterial()
      async throws
    {
      let client = try await openWalletFixture(password: "air-recovery-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let draft = try await client.generateWalletMnemonic(
        WalletHDGenerateMnemonicRequest(
          mnemonicStandard: "rotation", walletMode: "multichain", wordCount: 12,
          wordlist: "english"),
        generation: generation)
      let created = try await client.createHDWallet(
        WalletHDCreateRequest(
          bip39Passphrase: "synthetic extra phrase", clientRequestID: UUID().uuidString,
          label: "Synthetic recovery", mnemonic: draft.mnemonic, mnemonicDraftID: nil,
          mnemonicStandard: "rotation", supportedNetworks: ["bitcoin"], walletMode: "multichain",
          wordlist: "english"), generation: generation)
      do {
        _ = try await client.exportWalletRecovery(
          WalletBackupExportRequest(
            masterPassword: "wrong synthetic password", walletID: created.walletID),
          generation: generation)
        XCTFail("Recovery requires the actual administrative password")
      } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "EXPORT_REAUTH_FAILED") }
      let recovered = try await client.exportWalletRecovery(
        WalletBackupExportRequest(
          masterPassword: "air-synthetic-administrator", walletID: created.walletID),
        generation: generation)
      XCTAssertEqual(recovered.walletID, created.walletID)
      XCTAssertEqual(recovered.exportKind, "mnemonic")
      XCTAssertEqual(recovered.mnemonic, draft.mnemonic)
      XCTAssertEqual(recovered.mnemonicStandard, "rotation")
      XCTAssertEqual(recovered.wordlist, "english")
      XCTAssertEqual(recovered.walletMode, "multichain")
      XCTAssertEqual(recovered.bip39Passphrase, "synthetic extra phrase")
      let restored = try await client.createHDWallet(
        WalletHDCreateRequest(
          bip39Passphrase: recovered.bip39Passphrase, clientRequestID: UUID().uuidString,
          label: "Synthetic recovery round trip", mnemonic: recovered.mnemonic,
          mnemonicDraftID: nil,
          mnemonicStandard: recovered.mnemonicStandard, supportedNetworks: ["bitcoin"],
          walletMode: recovered.walletMode, wordlist: recovered.wordlist), generation: generation)
      XCTAssertNotEqual(restored.walletID, created.walletID)
      let originalAccount = try XCTUnwrap(created.accounts.first)
      let restoredAccount = try XCTUnwrap(restored.accounts.first)
      let originalAddress = try await client.deriveWalletAddress(
        WalletAddressesDeriveRequest(accountID: originalAccount.accountID, purpose: "receive"),
        generation: generation)
      let restoredAddress = try await client.deriveWalletAddress(
        WalletAddressesDeriveRequest(accountID: restoredAccount.accountID, purpose: "receive"),
        generation: generation)
      XCTAssertEqual(originalAddress.index, 0)
      XCTAssertEqual(restoredAddress.index, 0)
      XCTAssertFalse(originalAddress.address.isEmpty)
      XCTAssertEqual(restoredAddress.address, originalAddress.address)
      _ = try client.deactivate()
      do {
        _ = try await client.exportWalletRecovery(
          WalletBackupExportRequest(
            masterPassword: "air-synthetic-administrator", walletID: created.walletID),
          generation: generation)
        XCTFail("Deactivation must revoke recovery access")
      } catch {
        guard case BridgeError.SessionRevoked = error else { throw error }
      }
    }

    @MainActor
    func testNativePasswordMaintenancePreservesSecretsAcrossLockAndReopen() async throws {
      let oldPassword = "air-maintenance-old-" + UUID().uuidString
      let newPassword = "air-maintenance-new-" + UUID().uuidString
      let client = try await openWalletFixture(password: oldPassword)
      let generation = try client.snapshot().generation
      let request = PassmanagerEntryCreateRequest(
        createdTs: nil, entryID: UUID().uuidString, entryType: "login", groupPath: nil,
        iconRef: nil, otps: nil, paymentCard: nil,
        secrets: PassmanagerEntryCreateSecrets(
          cardCvv: nil, cardPan: nil, note: nil, password: "synthetic maintenance secret"),
        tagKeys: nil, tags: nil, title: "Synthetic maintenance", updatedTs: nil, urls: nil,
        username: "synthetic")
      _ = try await client.createCredential(request, generation: generation)
      do {
        _ = try await client.rekeyVault(
          VaultRekeyRequest(currentPassword: "wrong synthetic password", newPassword: newPassword),
          generation: generation)
        XCTFail("Incorrect reauthentication must not change the vault password")
      } catch let failure as RPCFailure {
        XCTAssertEqual(failure.code, "REKEY_INVALID_CURRENT_PASSWORD")
      }
      let result = try await client.rekeyVault(
        VaultRekeyRequest(currentPassword: oldPassword, newPassword: newPassword),
        generation: generation)
      XCTAssertTrue(result.backupRecommended)
      XCTAssertGreaterThan(result.migratedChunks, 0)
      var locked = try client.lock()
      while locked.cleanupPending {
        locked = try await client.events(after: locked.sequence).snapshot
      }
      let newMaster = "air-administrator-" + UUID().uuidString
      let master = try await client.rekeyMaster(
        MasterRekeyRequest(
          currentPassword: "air-synthetic-administrator", newMasterPassword: newMaster),
        generation: locked.generation)
      XCTAssertEqual(master.rewrappedArtifacts, ["master.verify"])
      XCTAssertTrue(master.backupRecommended)
      XCTAssertEqual(try client.snapshot().phase, .locked)
      _ = try await client.rekeyMaster(
        MasterRekeyRequest(
          currentPassword: newMaster, newMasterPassword: "air-synthetic-administrator"),
        generation: locked.generation)
      try await client.unlock(password: newPassword)
      let secret = try await client.readCredentialSecret(
        id: request.entryID, type: "password", generation: try client.snapshot().generation)
      XCTAssertEqual(secret, "synthetic maintenance secret")
    }

    @MainActor
    func testNativeStorageBackupStreamsArtifactsAndRevokesOnLock() async throws {
      let client = try await openWalletFixture(password: "air-backup-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      // Incompressible test content forces the encrypted pack across several bridge reads.
      let contents = Data((0..<(192 * 1024)).map { _ in UInt8.random(in: 0...255) })
      let writer = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "backup-stream.bin", mimeType: "application/octet-stream",
          byteCount: UInt64(contents.count)), generation: generation)
      for offset in stride(from: 0, to: contents.count, by: 64 * 1024) {
        _ = try await writer.append(contents.subdata(in: offset..<(offset + 64 * 1024)))
      }
      _ = try await writer.finish()
      try await writer.close()
      let backup = try await client.prepareStorageBackup(
        masterPassword: "air-synthetic-administrator", generation: generation)
      defer { try? backup.cancel() }
      let artifacts = try backup.artifacts()
      XCTAssertEqual(
        artifacts.map(\.name),
        ["metadata.enc", "master.salt", "master.verify", "chunks.manifest.json", "chunks.pack"])
      XCTAssertGreaterThan(try XCTUnwrap(artifacts.last).byteCount, 2 * 64 * 1024)
      for (index, artifact) in artifacts.enumerated() {
        var total: UInt64 = 0
        while true {
          let chunk = try await backup.read(artifact: UInt32(index))
          XCTAssertLessThanOrEqual(chunk.count, 64 * 1024)
          total += UInt64(chunk.count)
          if chunk.isEmpty { break }
        }
        XCTAssertEqual(total, artifact.byteCount)
      }
      _ = try client.lock()
      do {
        _ = try await backup.read(artifact: 0)
        XCTFail("A locked session must revoke its previous backup")
      } catch {
        guard case BridgeError.SessionRevoked = error else {
          return XCTFail("Expected revocation, received \(error)")
        }
      }
    }

    func testBackupDestinationPublishesExactFilesAndPreservesNeighbors() async throws {
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      let neighbor = parent.appendingPathComponent("existing")
      try Data("keep".utf8).write(to: neighbor)
      let destination = CoordinatedBackupDestination(directory: parent)
      try await destination.open()
      let bytes = Data((0..<150_000).map { UInt8(truncatingIfNeeded: $0) })
      try await destination.openArtifact(name: "encrypted.pack", size: UInt64(bytes.count))
      for offset in stride(from: 0, to: bytes.count, by: 64 * 1024) {
        try await destination.append(
          bytes.subdata(in: offset..<min(offset + 64 * 1024, bytes.count)))
      }
      try await destination.finishArtifact()
      try await destination.openArtifact(name: "empty", size: 0)
      try await destination.finishArtifact()
      let published = try await destination.publish()
      try await destination.close(remove: false)
      XCTAssertEqual(
        try Data(contentsOf: published.appendingPathComponent("encrypted.pack")), bytes)
      XCTAssertEqual(try Data(contentsOf: published.appendingPathComponent("empty")), Data())
      XCTAssertEqual(try Data(contentsOf: neighbor), Data("keep".utf8))
      XCTAssertEqual(
        Set(try FileManager.default.contentsOfDirectory(atPath: parent.path)),
        Set(["existing", published.lastPathComponent]))
      XCTAssertFalse(published.lastPathComponent.hasSuffix(".partial"))
    }

    func testBackupDestinationFailureAndCancellationRemoveOnlyTheirAttempt() async throws {
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      let neighbor = parent.appendingPathComponent("existing")
      try Data("keep".utf8).write(to: neighbor)
      for cancel in [false, true] {
        let destination = CoordinatedBackupDestination(directory: parent)
        try await destination.open()
        try await destination.openArtifact(name: "partial.pack", size: 4)
        try await destination.append(Data([1, 2]))
        if cancel { destination.cancel() }
        do {
          try await destination.finishArtifact()
          XCTFail("Incomplete or canceled files must not finish")
        } catch {}
        do {
          _ = try await destination.publish()
          XCTFail("Incomplete or canceled backups must not publish")
        } catch {}
        try await destination.close(remove: true)
        XCTAssertEqual(
          try FileManager.default.contentsOfDirectory(atPath: parent.path), ["existing"])
        XCTAssertEqual(try Data(contentsOf: neighbor), Data("keep".utf8))
      }
    }

    @MainActor
    func testNativeStorageBackupSavesRetriesAndRemovesRevokedAttempt() async throws {
      let client = try await openWalletFixture(password: "air-backup-save-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      do {
        _ = try await client.saveStorageBackup(
          to: parent, masterPassword: "incorrect", generation: generation, progress: { _ in })
        XCTFail("Wrong administrator password must not save a backup")
      } catch let failure as RPCFailure {
        XCTAssertEqual(failure.code, "INVALID_MASTER_PASSWORD")
      }
      XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: parent.path).isEmpty)
      var progress: [StorageBackupProgress] = []
      let saved = try await client.saveStorageBackup(
        to: parent, masterPassword: "air-synthetic-administrator", generation: generation,
        progress: { progress.append($0) })
      let names = [
        "metadata.enc", "master.salt", "master.verify", "chunks.manifest.json", "chunks.pack",
      ]
      XCTAssertEqual(
        Set(try FileManager.default.contentsOfDirectory(atPath: saved.path)), Set(names))
      let size = try names.reduce(UInt64(0)) { sum, name in
        sum + UInt64(try Data(contentsOf: saved.appendingPathComponent(name)).count)
      }
      XCTAssertGreaterThan(size, 0)
      XCTAssertEqual(progress.first?.completedBytes, 0)
      XCTAssertEqual(progress.last?.completedBytes, size)
      XCTAssertTrue(progress.allSatisfy { $0.totalBytes == size })
      XCTAssertTrue(
        zip(progress, progress.dropFirst()).allSatisfy { $0.completedBytes <= $1.completedBytes })
      let canceled = Task { @MainActor in
        try await client.saveStorageBackup(
          to: parent, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { update in
            if update.completedBytes > 0 { withUnsafeCurrentTask { $0?.cancel() } }
          })
      }
      do {
        _ = try await canceled.value
        XCTFail("Cancel must remove the unfinished backup")
      } catch {
        XCTAssertTrue(error is CancellationError)
      }
      XCTAssertEqual(
        try FileManager.default.contentsOfDirectory(atPath: parent.path), [saved.lastPathComponent])
      let second = try await client.saveStorageBackup(
        to: parent, masterPassword: "air-synthetic-administrator", generation: generation,
        progress: { _ in })
      XCTAssertNotEqual(saved, second)
      var revoked = false
      var lockError: Error?
      do {
        _ = try await client.saveStorageBackup(
          to: parent, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { update in
            if update.completedBytes > 0, !revoked {
              revoked = true
              do { _ = try client.lock() } catch { lockError = error }
            }
          })
        XCTFail("Lock must stop a partially written backup")
      } catch {}
      XCTAssertTrue(revoked)
      XCTAssertNil(lockError)
      XCTAssertEqual(
        Set(try FileManager.default.contentsOfDirectory(atPath: parent.path)),
        Set([saved.lastPathComponent, second.lastPathComponent]))
      XCTAssertEqual(
        Set(try FileManager.default.contentsOfDirectory(atPath: saved.path)), Set(names))
    }

    func testCoordinatedRestoreSourcePinsBytesAndReleasesCanceledReads() async throws {
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      let original = Data((0..<(70 * 1024)).map { UInt8($0 % 251) })
      let file = parent.appendingPathComponent("chunks.pack")
      try original.write(to: file)
      let source = CoordinatedRestoreSource(directory: parent)
      let spec = AirRestoreArtifactSpec(
        artifact: .pack, name: "chunks.pack", maximumBytes: 128 * 1024, required: true)
      let total = try await source.open([spec])
      XCTAssertEqual(total, UInt64(original.count))
      try Data([9, 8, 7]).write(to: file)
      var actual = Data()
      while true {
        let bytes = try await source.read(.pack, maximum: 64 * 1024)
        let chunk = try XCTUnwrap(bytes)
        if chunk.isEmpty { break }
        XCTAssertLessThanOrEqual(chunk.count, 64 * 1024)
        actual.append(chunk)
      }
      XCTAssertEqual(actual, original)
      source.cancel()
      do {
        _ = try await source.read(.pack, maximum: 64 * 1024)
        XCTFail("Canceled source must not remain readable")
      } catch { XCTAssertTrue(error is CancellationError) }
      try await source.close()
      try await source.close()
      XCTAssertEqual(try Data(contentsOf: file), Data([9, 8, 7]))
    }

    func testCoordinatedRestoreSourceRejectsMissingOversizedAndNonFileArtifacts() async throws {
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      let file = parent.appendingPathComponent("chunks.pack")
      let spec = AirRestoreArtifactSpec(
        artifact: .pack, name: "chunks.pack", maximumBytes: 4, required: true)
      for scenario in ["missing", "oversized", "directory"] {
        if scenario == "oversized" { try Data(repeating: 1, count: 5).write(to: file) }
        if scenario == "directory" {
          try FileManager.default.removeItem(at: file)
          try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        }
        let source = CoordinatedRestoreSource(directory: parent)
        do {
          _ = try await source.open([spec])
          XCTFail("Invalid artifact must fail: \(scenario)")
        } catch {
          if scenario == "oversized" {
            guard case BridgeError.RestoreInputTooLarge = error else {
              return XCTFail("Expected Core limit admission error")
            }
          }
        }
        try await source.close()
      }
    }

    func testCoordinatedRestoreSourceDistinguishesAbsentAndEmptyOptionalArtifacts() async throws {
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
        UUID().uuidString)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: directory) }
      let spec = AirRestoreArtifactSpec(
        artifact: .masterSalt, name: "master.salt", maximumBytes: 16, required: false)
      let missing = CoordinatedRestoreSource(directory: directory)
      let missingSize = try await missing.open([spec])
      let absent = try await missing.read(.masterSalt, maximum: 16)
      XCTAssertEqual(missingSize, 0)
      XCTAssertNil(absent)
      try await missing.close()
      try Data().write(to: directory.appendingPathComponent(spec.name))
      let empty = CoordinatedRestoreSource(directory: directory)
      let emptySize = try await empty.open([spec])
      let present = try await empty.read(.masterSalt, maximum: 16)
      XCTAssertEqual(emptySize, 0)
      XCTAssertEqual(present, Data())
      try await empty.close()
    }

    @MainActor
    func testNativeStorageEraseKeepsConfirmationInRustAndReportsActualCompletion() async throws {
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir")
      let testID = UUID().uuidString
      let target = root.appendingPathComponent(".restore-test-targets").appendingPathComponent(
        testID)
      let runtime = try await Task.detached {
        try openStorageRestoreTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root.path, testId: testID)
      }.value
      let client = RuntimeClient(runtime: runtime)
      addTeardownBlock { @MainActor in
        var snapshot = try client.close()
        while snapshot.cleanupPending {
          snapshot = try await client.events(after: snapshot.sequence).snapshot
        }
        try FileManager.default.removeItem(at: target)
      }
      _ = try client.activate()
      try await client.setupAdministrator(password: "air-synthetic-erase-administrator")
      try await client.unlock(password: "air-synthetic-erase-vault")
      let generation = try client.snapshot().generation
      try await client.createFolder(name: "Erase fixture", parent: "/", generation: generation)
      let erase = try await client.reviewStorageErase(generation: generation)
      do {
        _ = try await erase.commit(masterPassword: "wrong")
        XCTFail("Wrong administrator password cannot authorize erasure")
      } catch { XCTAssertEqual((error as? RPCFailure)?.code, "INVALID_MASTER_PASSWORD") }
      XCTAssertTrue(
        FileManager.default.fileExists(atPath: target.appendingPathComponent("master.verify").path))
      guard
        case .completed(let bytes, let chunks, _) = try await erase.commit(
          masterPassword: "air-synthetic-erase-administrator")
      else {
        return XCTFail("Only the actual Rust receipt establishes completed erasure")
      }
      XCTAssertGreaterThan(bytes, 0)
      XCTAssertGreaterThan(chunks, 0)
      XCTAssertFalse(try client.snapshot().masterConfigured)
      XCTAssertGreaterThan(try client.snapshot().generation, generation)
      XCTAssertFalse(
        FileManager.default.fileExists(atPath: target.appendingPathComponent("master.verify").path))
    }

    @MainActor
    func testNativeStorageRestoreReviewsCancelsRetriesAndRestoresSavedBytes() async throws {
      let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: parent) }
      let contents = Data((0..<(193 * 1024)).map { _ in UInt8.random(in: 0...255) })
      let password = "air-restore-source-" + UUID().uuidString
      let saved = try await makeRestoreSourceBackup(
        to: parent, password: password, contents: contents)
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir")
      let testID = UUID().uuidString
      let target = root.appendingPathComponent(".restore-test-targets").appendingPathComponent(
        testID)
      let runtime = try await Task.detached {
        try openStorageRestoreTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root.path, testId: testID)
      }.value
      let client = RuntimeClient(runtime: runtime)
      addTeardownBlock { @MainActor in
        var snapshot = try client.close()
        while snapshot.cleanupPending {
          snapshot = try await client.events(after: snapshot.sequence).snapshot
        }
        try FileManager.default.removeItem(at: target)
      }
      _ = try client.activate()
      var generation = try client.snapshot().generation
      XCTAssertFalse(try client.snapshot().masterConfigured)
      do {
        _ = try await client.reviewStorageBackup(
          at: saved, masterPassword: "wrong", generation: generation, progress: { _ in })
        XCTFail("Incorrect source password cannot produce a review")
      } catch { XCTAssertEqual((error as? RPCFailure)?.code, "INVALID_BACKUP") }
      let saltURL = saved.appendingPathComponent("master.salt")
      let salt = try Data(contentsOf: saltURL)
      let verifyURL = saved.appendingPathComponent("master.verify")
      let verify = try Data(contentsOf: verifyURL)
      try FileManager.default.removeItem(at: saltURL)
      try FileManager.default.removeItem(at: verifyURL)
      do {
        _ = try await client.reviewStorageBackup(
          at: saved, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { _ in })
        XCTFail("Legacy copy requires the original installation's master material")
      } catch { XCTAssertEqual((error as? RPCFailure)?.code, "INVALID_BACKUP") }
      XCTAssertFalse(try client.snapshot().masterConfigured)
      try verify.write(to: verifyURL)
      try Data().write(to: saltURL)
      do {
        _ = try await client.reviewStorageBackup(
          at: saved, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { _ in })
        XCTFail("Empty source material must not become a legacy fallback")
      } catch { XCTAssertEqual((error as? RPCFailure)?.code, "INVALID_BACKUP") }
      try salt.write(to: saltURL)
      let canceled = Task { @MainActor in
        _ = try await client.reviewStorageBackup(
          at: saved, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { update in
            if update.completedBytes > 0 { withUnsafeCurrentTask { $0?.cancel() } }
          })
      }
      do {
        _ = try await canceled.value
        XCTFail("Canceled read cannot produce a review")
      } catch { XCTAssertTrue(error is CancellationError) }
      var locked = false
      var lockError: Error?
      do {
        _ = try await client.reviewStorageBackup(
          at: saved, masterPassword: "air-synthetic-administrator", generation: generation,
          progress: { update in
            if update.completedBytes > 0, !locked {
              locked = true
              do { _ = try client.lock() } catch { lockError = error }
            }
          })
        XCTFail("Lock must revoke receiving source")
      } catch {
        guard case BridgeError.SessionRevoked = error else {
          return XCTFail("Expected revoked source")
        }
      }
      XCTAssertTrue(locked)
      XCTAssertNil(lockError)
      var snapshot = try client.snapshot()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
      generation = snapshot.generation
      var progress: [StorageRestoreProgress] = []
      let review = try await client.reviewStorageBackup(
        at: saved, masterPassword: "air-synthetic-administrator", generation: generation,
        progress: { progress.append($0) })
      XCTAssertGreaterThan(review.preview.chunkCount, 0)
      XCTAssertEqual(progress.first?.completedBytes, 0)
      XCTAssertEqual(progress.last?.completedBytes, progress.last?.totalBytes)
      XCTAssertFalse(try client.snapshot().masterConfigured)
      // Review owns the received copy; no later source reads or password entry are required.
      try FileManager.default.removeItem(at: saved)
      try await review.commit()
      do {
        try await review.commit()
        XCTFail("Consuming confirmation cannot replay")
      } catch {
        guard case BridgeError.InvalidRestoreState = error else {
          return XCTFail("Expected consumed review")
        }
      }
      try await review.close()
      XCTAssertTrue(try client.snapshot().masterConfigured)
      try await client.unlock(password: password)
      let page = try await client.filePage(
        CatalogFolderPageRequest(
          expectedVersion: nil, filter: nil, limit: 50, offset: 0, path: "/", sort: nil),
        generation: generation)
      let file = try XCTUnwrap(page.items.first { $0.name == "restored-native.bin" })
      let reader = try client.beginFileRead(nodeID: UInt64(file.nodeID), generation: generation)
      var restored = Data()
      while restored.count < contents.count {
        let chunk = try await reader.read(
          offset: UInt64(restored.count),
          length: min(reader.maximumChunkBytes, UInt64(contents.count - restored.count)))
        XCTAssertFalse(chunk.bytes.isEmpty)
        restored.append(chunk.bytes)
      }
      try reader.cancel()
      XCTAssertEqual(restored, contents)
    }

    @MainActor
    private func makeRestoreSourceBackup(to parent: URL, password: String, contents: Data)
      async throws -> URL
    {
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir")
      let testID = UUID().uuidString
      let target = root.appendingPathComponent(".restore-test-targets").appendingPathComponent(
        testID)
      let runtime = try await Task.detached {
        try openStorageRestoreTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root.path, testId: testID)
      }.value
      let client = RuntimeClient(runtime: runtime)
      let result: Result<URL, Error>
      do {
        _ = try client.activate()
        try await client.setupAdministrator(password: "air-synthetic-administrator")
        try await client.unlock(password: password)
        let generation = try client.snapshot().generation
        let writer = try client.beginFileWrite(
          AirFileWriteTarget(
            parentPath: "/", name: "restored-native.bin", mimeType: "application/octet-stream",
            byteCount: UInt64(contents.count)), generation: generation)
        for offset in stride(from: 0, to: contents.count, by: 64 * 1024) {
          _ = try await writer.append(
            contents.subdata(in: offset..<min(contents.count, offset + 64 * 1024)))
        }
        _ = try await writer.finish()
        try await writer.close()
        result = .success(
          try await client.saveStorageBackup(
            to: parent, masterPassword: "air-synthetic-administrator", generation: generation,
            progress: { _ in }))
      } catch { result = .failure(error) }
      var snapshot = try client.close()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
      try FileManager.default.removeItem(at: target)
      return try result.get()
    }

    private enum WalletFixture: Sendable { case setup, history, send }

    @MainActor
    private func openWalletFixture(password: String, fixture: WalletFixture = .setup) async throws
      -> RuntimeClient
    {
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir"
      ).path
      let runtime = try await Task.detached {
        switch fixture {
        case .setup:
          try openWalletTestRuntime(
            expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
        case .history:
          try openWalletHistoryTestRuntime(
            expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
        case .send:
          try openWalletSendTestRuntime(
            expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
        }
      }.value
      let client = RuntimeClient(runtime: runtime)
      addTeardownBlock { @MainActor in
        var snapshot = try client.close()
        while snapshot.cleanupPending {
          snapshot = try await client.events(after: snapshot.sequence).snapshot
        }
      }
      _ = try client.activate()
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: password)
      return client
    }

    func testStaleBindingsFailBeforeCreatingHarness() {
      XCTAssertThrowsError(try FixtureHarness(expectedFingerprint: "stale-bindings")) { error in
        guard case BridgeError.IncompatibleBuild = error else {
          return XCTFail("Expected incompatible build, received \(type(of: error))")
        }
      }
    }

    func testGeneratedStatusAcceptsUnknownFieldsButRejectsMissingRequiredFields() throws {
      let decoder = JSONDecoder()
      let value = try decoder.decode(
        RPCResult<VaultStatusResponse>.self,
        from: Data(#"{"ok":true,"result":{"is_unlocked":false,"future":42}}"#.utf8))
      XCTAssertFalse(value.value.isUnlocked)
      XCTAssertThrowsError(
        try decoder.decode(
          RPCResult<VaultStatusResponse>.self,
          from: Data(#"{"ok":true,"result":{}}"#.utf8)))
      XCTAssertThrowsError(
        try decoder.decode(
          RPCResult<VaultStatusResponse>.self,
          from: Data(#"{"ok":false,"error":"safe fixture","code":"VAULT_REQUIRED"}"#.utf8))
      ) { error in
        XCTAssertEqual((error as? RPCFailure)?.code, "VAULT_REQUIRED")
      }
    }

    func testMalformedVersionAndLockedAccessAcrossFFI() throws {
      let harness = try FixtureHarness(expectedFingerprint: BuildFingerprint.expected)
      XCTAssertThrowsError(try harness.execute(request: Data("{".utf8)))
      XCTAssertThrowsError(
        try harness.execute(
          request:
            Data(#"{"v":2,"command":"vault:unlock","data":{"password":"synthetic"}}"#.utf8)))
      let reply = try harness.execute(
        request:
          Data(#"{"v":1,"command":"passmanager:entry:list","data":{}}"#.utf8))
      XCTAssertThrowsError(
        try JSONDecoder().decode(RPCResult<PassmanagerEntryListResponse>.self, from: reply)
      ) { error in
        XCTAssertEqual((error as? RPCFailure)?.code, "VAULT_REQUIRED")
      }
    }
  #else
    func testReleaseLibraryRejectsSyntheticHarness() throws {
      let info = try checkBridge(expectedFingerprint: BuildFingerprint.expected)
      XCTAssertFalse(info.fixtureEnabled)
      XCTAssertThrowsError(try FixtureHarness(expectedFingerprint: BuildFingerprint.expected)) {
        error in
        guard case BridgeError.FixtureUnavailable = error else {
          return XCTFail("Expected fixture unavailable")
        }
      }
    }
  #endif
}
