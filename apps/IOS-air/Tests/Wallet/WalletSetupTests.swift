import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct WalletSetupTests {
  @Test func creationGeneratesTheDraftSilentlyAndClearsSecrets() async throws {
    let store = SetupStore()
    var saved: [String] = []
    let model = WalletSetupModel(
      intent: .create, status: store.status, store: store, generation: 7,
      now: { Date(timeIntervalSince1970: 1) }, onSaved: { id, _ in saved.append(id) })
    #expect(model.submit() == nil && model.missingFields == [.label] && model.focus == .label)
    model.change(.label, to: "  My wallet  ")
    model.setPassphraseEnabled(true)
    model.change(.passphrase, to: "optional secret")
    // The phrase is never shown at creation: saving generates the draft and creates in one go.
    #expect(model.phrase == nil && store.created.isEmpty)
    await model.submit()?.value
    let request = try #require(store.created.first)
    #expect(
      request.label == "My wallet" && request.mnemonic == nil && request.mnemonicDraftID == "draft")
    #expect(
      request.supportedNetworks == ["bitcoin", "ton"]
        && request.bip39Passphrase == "optional secret")
    #expect(request.clientRequestID != nil && store.generations == [7, 7])
    #expect(saved == ["created"] && model.state == .saved && model.phrase == nil)
    #expect(model.value(.passphrase).isEmpty && !model.isDirty && model.submit() == nil)
  }

  @Test func creationDefaultsToNoPassphraseAndRejectsAnEnabledEmptyOne() async throws {
    let store = SetupStore()
    let model = WalletSetupModel(
      intent: .create, status: store.status, store: store, generation: 2,
      now: { Date(timeIntervalSince1970: 1) }, onSaved: { _, _ in })
    #expect(model.profile == .telegramMultichain && !model.usePassphrase)
    model.change(.label, to: "Plain")
    model.setPassphraseEnabled(true)
    #expect(
      model.submit() == nil && model.missingFields == [.passphrase] && model.focus == .passphrase)
    model.setPassphraseEnabled(false)
    await model.submit()?.value
    let request = try #require(store.created.first)
    #expect(request.bip39Passphrase == nil && request.mnemonicStandard == "rotation")
    #expect(request.walletMode == "multichain" && model.state == .saved)
  }

  @Test func restoreKeepsProfileNetworkAndOptionalPassphraseConsistent() async throws {
    let store = SetupStore()
    let model = WalletSetupModel(
      intent: .restore, status: store.status, store: store, generation: 3
    ) { _, _ in }
    model.change(.label, to: "Restored")
    model.change(.mnemonic, to: "old words")
    model.setPassphraseEnabled(true)
    model.change(.passphrase, to: "secret")
    model.selectProfile(.tonOnly)
    #expect(
      model.value(.mnemonic).isEmpty && model.value(.passphrase).isEmpty && !model.usePassphrase)
    #expect(model.selectedNetworks == ["ton"])
    model.selectNetwork("bitcoin", selected: true)
    model.setPassphraseEnabled(true)
    model.change(.mnemonic, to: "  word\n another\tlast  ")
    await model.submit()?.value
    let request = try #require(store.created.first)
    // Tokenization is presentation; checksum and supported word counts are validated by Core.
    #expect(request.mnemonic == ["word", "another", "last"] && request.mnemonicDraftID == nil)
    #expect(request.walletMode == "ton_only" && request.mnemonicStandard == "rotation")
    #expect(request.supportedNetworks == ["ton"] && request.bip39Passphrase == nil)
    #expect(model.value(.mnemonic).isEmpty)
  }

  @Test func importUsesExplicitNetworkEncodingAndNeverCallsHDCreate() async throws {
    let store = SetupStore()
    var selection: [String] = []
    let model = WalletSetupModel(
      intent: .importKey, status: store.status, store: store, generation: 4
    ) { wallet, account in
      selection = [wallet, account ?? ""]
    }
    model.change(.label, to: "Key")
    model.change(.privateKey, to: "old key")
    model.selectImportNetwork(.ton)
    #expect(model.value(.privateKey).isEmpty)
    model.selectEncoding("base64")
    model.change(.privateKey, to: " synthetic-key ")
    await model.submit()?.value
    let request = try #require(store.imported.first)
    #expect(request.network == "ton" && request.curve == "ed25519" && request.encoding == "base64")
    #expect(request.privateKey == "synthetic-key" && request.clientRequestID != nil)
    #expect(store.created.isEmpty && selection == ["imported", "account"])
    #expect(model.value(.privateKey).isEmpty && model.state == .saved)
  }

  @Test func lateGenerationCannotRestoreChangedOrRevokedSecrets() async {
    let store = SetupStore()
    store.delayGeneration = true
    let model = WalletSetupModel(intent: .create, status: store.status, store: store, generation: 1)
    { _, _ in }
    let first = model.generate()
    await store.waitForGeneration()
    #expect(model.generate() == nil)
    // The universal wallet has a fixed 12-word phrase: the word count cannot change mid-flight.
    model.selectWordCount(24)
    #expect(model.state == .generating && model.wordCount == 12)
    store.finishGeneration()
    await first?.value
    #expect(model.state == .editing && model.phrase != nil)
    let second = model.generate()
    await store.waitForGeneration()
    model.revoke()
    store.finishGeneration()
    await second?.value
    #expect(model.state == .revoked && model.phrase == nil && model.selectedNetworks.isEmpty)
  }

  @Test func uncertainSaveClearsSecretsAndCannotBeResubmitted() async {
    let store = SetupStore()
    store.saveError = SetupFailure.transport
    let model = WalletSetupModel(
      intent: .restore, status: store.status, store: store, generation: 1
    ) { _, _ in
      Issue.record("An unconfirmed save must not publish success")
    }
    model.change(.label, to: "Recovery")
    model.change(.mnemonic, to: "synthetic secret")
    let save = model.submit()
    #expect(model.submit() == nil)
    await save?.value
    #expect(model.state == .uncertain && model.issue == .uncertainSave)
    #expect(model.value(.mnemonic).isEmpty && model.submit() == nil && store.created.count == 1)
  }

  @Test(arguments: ["INVALID_INPUT", "ACCESS_DENIED"])
  func explicitCoreRejectionKeepsDraftEditable(_ code: String) async throws {
    let store = SetupStore()
    do {
      _ = try JSONDecoder().decode(
        RPCResult<[String: String]>.self,
        from: JSONSerialization.data(withJSONObject: ["ok": false, "code": code]))
      Issue.record("Expected a typed Core rejection")
      return
    } catch let failure as RPCFailure { store.saveError = failure }
    let model = WalletSetupModel(
      intent: .restore, status: store.status, store: store, generation: 1
    ) { _, _ in }
    model.change(.label, to: "Recovery")
    model.change(.mnemonic, to: "editable secret")
    await model.submit()?.value
    #expect(model.state == .editing && model.value(.mnemonic) == "editable secret")
    #expect(model.issue == (code == "INVALID_INPUT" ? .invalidInput : .denied))
    model.revoke()
    #expect(model.value(.mnemonic).isEmpty)
  }

  @Test func expirationAndDisabledCapabilityPreventSubmission() async {
    let store = SetupStore()
    let model = WalletSetupModel(
      intent: .create, status: store.status, store: store, generation: 1,
      now: { Date(timeIntervalSince1970: 200) }, onSaved: { _, _ in })
    model.change(.label, to: "Expired")
    // Every draft this clock sees is already expired: one silent regeneration, then a clear issue.
    await model.submit()?.value
    #expect(model.issue == .expiredPhrase && model.phrase == nil && model.state == .editing)
    #expect(store.created.isEmpty && store.generations == [1])
    let disabled = WalletSetupModel(
      intent: .create, status: store.status.with(enabled: false), store: store, generation: 1
    ) { _, _ in }
    #expect(
      disabled.generate() == nil && disabled.submit() == nil && disabled.issue == .unavailable)
  }
}

private enum SetupFailure: Error { case transport }

@MainActor
private final class SetupStore: WalletStore {
  let status = WalletStatusResponse(
    disabledReason: nil, enabled: true, initialized: false,
    networks: ["bitcoin", "ton"].map {
      WalletNetworkStatus(
        broadcastEnabled: false, capabilities: nil, disabledReason: nil,
        enabled: true, network: $0, providerStatus: .unavailable)
    }, walletCount: 0)
  var created: [WalletHDCreateRequest] = []
  var imported: [WalletImportCreateRequest] = []
  var generations: [UInt64] = []
  var saveError: (any Error)?
  var delayGeneration = false
  private var pending: CheckedContinuation<WalletHDGenerateMnemonicResponse, any Error>?
  private var waiter: CheckedContinuation<Void, Never>?
  func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
    async throws -> WalletAccountsDeriveResponse
  { throw BridgeError.CapabilityUnavailable }
  func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
    async throws -> WalletAddressesDeriveResponse
  { throw BridgeError.CapabilityUnavailable }
  func walletStatus(generation: UInt64) async throws -> WalletStatusResponse { status }
  func walletList(generation: UInt64) async throws -> WalletListResponse {
    WalletListResponse(wallets: [])
  }
  func walletAccounts(walletID: String?, generation: UInt64) async throws
    -> WalletAccountsListResponse
  {
    WalletAccountsListResponse(accounts: [], cachedBalances: [])
  }
  func walletBalance(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  { throw BridgeError.CapabilityUnavailable }
  func generateWalletMnemonic(_ request: WalletHDGenerateMnemonicRequest, generation: UInt64)
    async throws -> WalletHDGenerateMnemonicResponse
  {
    generations.append(generation)
    if delayGeneration {
      return try await withCheckedThrowingContinuation { continuation in
        pending = continuation
        waiter?.resume()
        waiter = nil
      }
    }
    return Self.makePhrase()
  }
  func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
    -> WalletHDCreateResponse
  {
    created.append(request)
    generations.append(generation)
    if let saveError { throw saveError }
    return WalletHDCreateResponse(accounts: [], walletID: "created")
  }
  func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
    -> WalletImportCreateResponse
  {
    imported.append(request)
    if let saveError { throw saveError }
    return WalletImportCreateResponse(accountID: "account", walletID: "imported")
  }
  func waitForGeneration() async {
    if pending != nil { return }
    await withCheckedContinuation { waiter = $0 }
  }
  func finishGeneration() {
    pending?.resume(returning: Self.makePhrase())
    pending = nil
  }
  private nonisolated static func makePhrase() -> WalletHDGenerateMnemonicResponse {
    WalletHDGenerateMnemonicResponse(
      expiresAt: 100_000, mnemonic: ["synthetic", "phrase"],
      mnemonicDraftID: "draft", mnemonicStandard: "bip39", walletMode: "multichain",
      wordlist: "english")
  }
}
