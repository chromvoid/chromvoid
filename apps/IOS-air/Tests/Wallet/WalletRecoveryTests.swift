import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct WalletRecoveryTests {
  @Test func recoveryRequiresExplicitPasswordAndUsesTheCapturedWallet() async throws {
    let store = WalletRecoveryTestStore()
    let model = model(store)
    #expect(model.reveal() == nil && model.issue == .passwordRequired)
    #expect(store.requests.isEmpty)
    model.changePassword("master")
    store.gate.enabled = true
    let revealing = try #require(model.reveal())
    await store.gate.wait()
    #expect(model.password.isEmpty && model.state == .loading && model.reveal() == nil)
    store.gate.release()
    await revealing.value
    #expect(model.state == .revealed && model.recovery?.mnemonic == ["synthetic", "words"])
    #expect(model.recovery?.bip39Passphrase == "synthetic extra phrase")
    #expect(store.requests.count == 1 && store.requests[0].walletID == "wallet")
    #expect(store.requests[0].masterPassword == "master" && store.generations == [7])
  }

  @Test func copyIsExplicitAndCoverClearsMaterialBeforeAnotherAuthorization() async throws {
    let store = WalletRecoveryTestStore()
    let clipboard = RecoveryClipboard()
    let model = model(store, clipboard: clipboard)
    model.copy(.mnemonic)
    #expect(clipboard.value == nil)
    model.changePassword("master")
    await model.reveal()?.value
    #expect(clipboard.value == nil)
    model.copy(.mnemonic)
    #expect(clipboard.value == "synthetic words" && model.copied == .mnemonic)
    model.copy(.passphrase)
    #expect(clipboard.value == "synthetic extra phrase")
    // Only a rotated Telegram Wallet phrase has a separate anchor half to copy.
    model.copy(.anchorWords)
    #expect(clipboard.value == "synthetic extra phrase" && model.copied == .passphrase)
    model.hideValues()
    #expect(model.state == .editing && model.recovery == nil && model.password.isEmpty)
    #expect(model.copied == nil && clipboard.value == nil)
    #expect(model.reveal() == nil && model.issue == .passwordRequired)
    #expect(store.requests.count == 1)
  }

  @Test func rotatedPhraseCopiesItsAnchorHalfSeparately() async throws {
    let store = WalletRecoveryTestStore()
    let clipboard = RecoveryClipboard()
    let model = model(store, clipboard: clipboard)
    let words = (1...24).map { "w\($0)" }
    store.result = store.result.with(
      bip39Passphrase: .some(nil), mnemonic: words, mnemonicStandard: "rotation",
      walletMode: "multichain")
    model.changePassword("master")
    await model.reveal()?.value
    model.copy(.anchorWords)
    #expect(clipboard.value == words.prefix(12).joined(separator: " "))
    #expect(model.copied == .anchorWords)
    model.copy(.mnemonic)
    #expect(clipboard.value == words.joined(separator: " "))
  }

  @Test func wrongPasswordCanBeCorrectedAndUnsupportedExportDoesNotInventMaterial() async throws {
    let store = WalletRecoveryTestStore()
    let model = model(store)
    store.failure = "EXPORT_REAUTH_FAILED"
    model.changePassword("wrong")
    await model.reveal()?.value
    #expect(model.issue == .reauthentication && model.password.isEmpty && model.recovery == nil)
    store.failure = nil
    store.result = store.result.with(
      bip39Passphrase: .some(nil), mnemonicStandard: "ton_native", walletMode: "ton_only")
    model.changePassword("corrected")
    await model.reveal()?.value
    #expect(
      model.recovery?.mnemonicStandard == "ton_native" && model.recovery?.bip39Passphrase == nil)
    model.hideValues()
    store.failure = "UNSUPPORTED_EXPORT_KIND"
    model.changePassword("master")
    await model.reveal()?.value
    #expect(model.state == .editing && model.issue == .unsupported && model.recovery == nil)
  }

  @Test func coverAndRevocationPreventLateSecretPublication() async throws {
    let store = WalletRecoveryTestStore()
    let model = model(store)
    model.changePassword("master")
    store.gate.enabled = true
    let loading = try #require(model.reveal())
    await store.gate.wait()
    model.hideValues()
    store.gate.release()
    await loading.value
    #expect(model.state == .editing && model.recovery == nil)
    model.changePassword("master")
    store.gate.enabled = true
    let revoked = try #require(model.reveal())
    await store.gate.wait()
    model.revoke()
    store.gate.release()
    await revoked.value
    #expect(model.state == .revoked && model.recovery == nil && model.password.isEmpty)
    #expect(model.reveal() == nil)
  }

  @Test func mismatchedWalletAndCoreRevocationCannotRevealSecrets() async throws {
    let store = WalletRecoveryTestStore()
    let model = model(store)
    store.result = store.result.with(walletID: "other")
    model.changePassword("master")
    await model.reveal()?.value
    #expect(model.recovery == nil && model.issue == .failed && model.state == .editing)
    store.failure = "VAULT_REQUIRED"
    model.changePassword("master")
    await model.reveal()?.value
    #expect(model.state == .revoked && model.recovery == nil)
  }

  private func model(
    _ store: WalletRecoveryTestStore, clipboard: RecoveryClipboard = RecoveryClipboard()
  ) -> WalletRecoveryModel {
    WalletRecoveryModel(
      walletID: "wallet", walletName: "Synthetic", store: store, generation: 7, clipboard: clipboard
    )
  }
}

@MainActor
final class WalletRecoveryTestStore: WalletRecoveryStore {
  var requests: [WalletBackupExportRequest] = []
  var generations: [UInt64] = []
  var failure: String?
  var result = WalletBackupExportResponse(
    bip39Passphrase: "synthetic extra phrase", exportKind: "mnemonic",
    mnemonic: ["synthetic", "words"],
    mnemonicStandard: "bip39", walletID: "wallet", walletMode: "multichain", wordlist: "english")
  let gate = ContactsGate()
  func exportWalletRecovery(_ request: WalletBackupExportRequest, generation: UInt64) async throws
    -> WalletBackupExportResponse
  {
    requests.append(request)
    generations.append(generation)
    await gate.pause()
    if let failure { throw RPCFailure(code: failure) }
    return result
  }
}

@MainActor
private final class RecoveryClipboard: CredentialClipboard {
  var value: String?
  func copy(_ value: String) { self.value = value }
  func clearOwned() { value = nil }
}
