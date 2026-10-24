import ChromVoidBridge
import Foundation
import Observation

/// Transient setup form. Core owns phrase/key validation, derivation and atomic creation.
@MainActor
@Observable
public final class WalletSetupModel: Identifiable {
  public enum Intent: Equatable { case create, restore, importKey }
  public enum State: Equatable { case editing, generating, saving, saved, uncertain, revoked }
  public enum Field: String, Hashable { case label, mnemonic, passphrase, privateKey }
  public enum Issue: Equatable {
    case unavailable, chooseNetwork, expiredPhrase
    case invalidInput, denied, generationFailed, uncertainSave
  }
  public enum RecoveryProfile: String, CaseIterable {
    case multichain
    /// Universal wallet: the Telegram Wallet phrase (12 words, 24 after a key rotation) is the
    /// root for every network. The 12 anchor words alone restore it anywhere; a BIP39
    /// passphrase is an optional extra for the non-TON accounts.
    case telegramMultichain = "telegram_multichain"
    /// Telegram Wallet: TEP-0003 rotation phrase (12 words, 24 after a key rotation).
    case tonOnly = "ton_only"
    /// Legacy 24-word TON mnemonic (wallet.ton.org / Tonkeeper style).
    case tonLegacy = "ton_legacy"
    var walletMode: String { isTonOnly ? "ton_only" : "multichain" }
    var standard: String {
      switch self {
      case .multichain: "bip39"
      case .telegramMultichain, .tonOnly: "rotation"
      case .tonLegacy: "ton_native"
      }
    }
    var isTonOnly: Bool { self == .tonOnly || self == .tonLegacy }
    /// New wallets have exactly one shape: the universal rotation root. Everything else is restore.
    var allowsCreate: Bool { self == .telegramMultichain }
    static func available(for intent: Intent) -> [RecoveryProfile] {
      allCases.filter { intent != .create || $0.allowsCreate }
    }
    var allowsPassphrase: Bool { !isTonOnly }
    /// Fixed phrase length for profiles without a user-selectable word count.
    var fixedWordCount: Int? {
      switch self {
      case .multichain: nil
      case .telegramMultichain, .tonOnly: 12
      case .tonLegacy: 24
      }
    }
  }
  // These are the existing UI choices. Core validates all submitted keys and encodings.
  public enum ImportNetwork: String, CaseIterable {
    case bitcoin, ethereum, solana, ton
    public var encodings: [String] {
      switch self {
      case .bitcoin: ["wif"]
      case .ethereum: ["hex"]
      case .solana: ["base58_keypair"]
      case .ton: ["hex", "base64"]
      }
    }
    var curve: String {
      switch self {
      case .bitcoin, .ethereum: "secp256k1"
      case .solana, .ton: "ed25519"
      }
    }
  }

  public let id = UUID()
  public let intent: Intent
  public let networks: [WalletNetworkStatus]
  public private(set) var state: State = .editing
  public private(set) var profile: RecoveryProfile
  public private(set) var wordCount = 12
  public private(set) var selectedNetworks: Set<String>
  public private(set) var importNetwork: ImportNetwork?
  public private(set) var encoding = ""
  public private(set) var usePassphrase = false
  public private(set) var phrase: WalletHDGenerateMnemonicResponse?
  public private(set) var issue: Issue?
  public private(set) var missingFields: Set<Field> = []
  public private(set) var focus: Field?
  public private(set) var focusRevision = 0
  public private(set) var confirmingDiscard = false
  public private(set) var revealed: Set<Field> = []
  private var values: [Field: String] = [:]
  private let enabled: Bool
  private let store: any WalletStore
  private let generation: UInt64
  private let onSaved: (String, String?) -> Void
  private let now: () -> Date
  private let work = ModelWork()
  /// Waits for a phrase generated on the way to a save, then submits once more.
  private let resubmission = ModelWork()

  public init(
    intent: Intent, status: WalletStatusResponse, store: any WalletStore, generation: UInt64,
    now: @escaping () -> Date = Date.init, onSaved: @escaping (String, String?) -> Void
  ) {
    self.intent = intent
    profile = intent == .create ? .telegramMultichain : .multichain
    usePassphrase = false
    networks = status.networks
    enabled = status.enabled
    self.store = store
    self.generation = generation
    self.now = now
    self.onSaved = onSaved
    selectedNetworks = Set(status.networks.filter(\.enabled).map(\.network))
    importNetwork =
      status.networks.filter(\.enabled).compactMap { ImportNetwork(rawValue: $0.network) }.first
    encoding = importNetwork?.encodings.first ?? ""
  }

  public var availableImportNetworks: [ImportNetwork] {
    networks.filter(\.enabled).compactMap { ImportNetwork(rawValue: $0.network) }
  }
  public var isDirty: Bool { phrase != nil || values.values.contains { !$0.isEmpty } }
  public func value(_ field: Field) -> String { values[field] ?? "" }
  public func change(_ field: Field, to value: String) {
    guard state == .editing else { return }
    values[field] = value
    missingFields.remove(field)
    issue = nil
  }
  public func selectProfile(_ profile: RecoveryProfile) {
    guard intent != .importKey, state == .editing || state == .generating,
      self.profile != profile, intent != .create || profile.allowsCreate
    else { return }
    cancelWork()
    self.profile = profile
    revealed = []
    values[.mnemonic] = nil
    values[.passphrase] = nil
    usePassphrase = false
    phrase = nil
    state = .editing
    selectedNetworks = Set(
      networks.filter { $0.enabled && (!profile.isTonOnly || $0.network == "ton") }.map(\.network))
    issue = nil
    missingFields = []
  }
  public func selectNetwork(_ network: String, selected: Bool) {
    guard state == .editing, networks.contains(where: { $0.network == network && $0.enabled }),
      !profile.isTonOnly || network == "ton"
    else { return }
    if selected { selectedNetworks.insert(network) } else { selectedNetworks.remove(network) }
    issue = nil
  }
  public func selectImportNetwork(_ network: ImportNetwork) {
    guard state == .editing, availableImportNetworks.contains(network), importNetwork != network
    else { return }
    importNetwork = network
    encoding = network.encodings[0]
    values[.privateKey] = nil
    revealed.remove(.privateKey)
    issue = nil
  }
  public func selectEncoding(_ encoding: String) {
    guard state == .editing, importNetwork?.encodings.contains(encoding) == true else { return }
    self.encoding = encoding
    issue = nil
  }
  public func setPassphraseEnabled(_ enabled: Bool) {
    guard state == .editing, profile.allowsPassphrase else { return }
    usePassphrase = enabled
    if !enabled {
      values[.passphrase] = nil
      revealed.remove(.passphrase)
    }
  }
  public func selectWordCount(_ count: Int) {
    guard intent == .create, profile == .multichain, state == .editing || state == .generating,
      [12, 24].contains(count), count != wordCount
    else { return }
    cancelWork()
    wordCount = count
    phrase = nil
    state = .editing
    issue = nil
  }
  @discardableResult
  public func generate() -> Task<Void, Never>? {
    guard intent == .create, state == .editing else { return nil }
    guard enabled else {
      issue = .unavailable
      return nil
    }
    guard !selectedNetworks.isEmpty else {
      issue = .chooseNetwork
      return nil
    }
    phrase = nil
    issue = nil
    state = .generating
    let request = WalletHDGenerateMnemonicRequest(
      mnemonicStandard: profile.standard, walletMode: profile.walletMode,
      wordCount: profile.fixedWordCount ?? wordCount, wordlist: "english"
    )
    return work.start { [weak self, store, generation] run in
      do {
        let phrase = try await store.generateWalletMnemonic(request, generation: generation)
        guard let self, run.isCurrent else { return }
        self.phrase = phrase
        self.state = .editing
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.state = .editing
          self.issue = .generationFailed
        }
      }
    }
  }

  @discardableResult
  public func submit() -> Task<Void, Never>? { submit(regenerated: false) }

  @discardableResult
  private func submit(regenerated: Bool) -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    missingFields = []
    issue = nil
    guard enabled else {
      issue = .unavailable
      return nil
    }
    var required: [Field] =
      intent == .restore
      ? [.label, .mnemonic] : intent == .importKey ? [.label, .privateKey] : [.label]
    // An enabled but empty passphrase is a mistake the user must notice, not a silent default.
    if intent != .importKey, usePassphrase { required.append(.passphrase) }
    for field in required where value(field).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      missingFields.insert(field)
    }
    if let first = required.first(where: { missingFields.contains($0) }) {
      focus = first
      focusRevision += 1
      return nil
    }
    guard intent == .importKey ? importNetwork != nil : !selectedNetworks.isEmpty else {
      issue = .chooseNetwork
      return nil
    }
    if intent == .create {
      // The phrase is never shown here: the wallet lives in the encrypted vault, and the words
      // can be exported for another app from the wallet's recovery screen at any time. A
      // missing draft is generated on the way; a draft that expired is regenerated once.
      if let phrase, Double(phrase.expiresAt) <= now().timeIntervalSince1970 * 1_000 {
        self.phrase = nil
        if regenerated {
          issue = .expiredPhrase
          return nil
        }
      }
      if phrase == nil {
        guard let generation = generate() else { return nil }
        return resubmission.start { [weak self] run in
          await generation.value
          guard let self, run.isCurrent, self.state == .editing, self.phrase != nil else { return }
          await self.submit(regenerated: true)?.value
        }
      }
    }
    let requestID = UUID().uuidString
    let label = value(.label).trimmingCharacters(in: .whitespacesAndNewlines)
    let submission: Submission
    if intent == .importKey {
      guard let network = importNetwork else {
        issue = .chooseNetwork
        return nil
      }
      submission = .imported(
        WalletImportCreateRequest(
          clientRequestID: requestID, curve: network.curve, encoding: encoding,
          label: label, network: network.rawValue,
          privateKey: value(.privateKey).trimmingCharacters(in: .whitespacesAndNewlines)))
    } else {
      submission = .hd(
        WalletHDCreateRequest(
          bip39Passphrase: usePassphrase ? value(.passphrase) : nil, clientRequestID: requestID,
          label: label,
          mnemonic: intent == .restore
            ? value(.mnemonic).split(whereSeparator: \.isWhitespace).map(String.init) : nil,
          mnemonicDraftID: intent == .create ? phrase?.mnemonicDraftID : nil,
          mnemonicStandard: profile.standard,
          supportedNetworks: networks.map(\.network).filter { selectedNetworks.contains($0) },
          walletMode: profile.walletMode, wordlist: "english"))
    }
    state = .saving
    return work.start { [weak self, store, generation] run in
      do {
        let walletID: String
        let accountID: String?
        switch submission {
        case .imported(let request):
          let result = try await store.importWallet(request, generation: generation)
          walletID = result.walletID
          accountID = result.accountID
        case .hd(let request):
          let result = try await store.createHDWallet(request, generation: generation)
          walletID = result.walletID
          accountID = result.accounts.first?.accountID
        }
        guard let self, run.isCurrent else { return }
        self.clearSecrets()
        self.values = [:]
        self.state = .saved
        self.onSaved(walletID, accountID)
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .invalidInput:
          self.state = .editing
          self.issue = .invalidInput
        case .unavailable:
          self.state = .editing
          self.issue = .unavailable
        case .denied:
          self.state = .editing
          self.issue = .denied
        default:
          self.clearSecrets()
          self.state = .uncertain
          self.issue = .uncertainSave
        }
      }
    }
  }

  public func revoke() {
    cancelWork()
    clearSecrets()
    values = [:]
    missingFields = []
    selectedNetworks = []
    issue = nil
    focus = nil
    confirmingDiscard = false
    state = .revoked
  }
  public func requestDismiss() -> Bool {
    guard state != .saving else { return false }
    guard isDirty, state != .uncertain else { return true }
    confirmingDiscard = true
    return false
  }
  public func cancelDiscard() { confirmingDiscard = false }
  public func toggleVisibility(_ field: Field) {
    guard state == .editing, field != .label else { return }
    if revealed.contains(field) { revealed.remove(field) } else { revealed.insert(field) }
    focus = field
    focusRevision += 1
  }
  public func hideValues() { revealed = [] }
  private enum Submission {
    case hd(WalletHDCreateRequest)
    case imported(WalletImportCreateRequest)
  }
  private func cancelWork() {
    work.cancel()
    resubmission.cancel()
  }
  private func clearSecrets() {
    phrase = nil
    revealed = []
    values[.mnemonic] = nil
    values[.passphrase] = nil
    values[.privateKey] = nil
    usePassphrase = false
  }
}
