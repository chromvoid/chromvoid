import ChromVoidBridge
import Foundation
import Observation

/// Transient, account-independent recovery material for one captured HD wallet.
@MainActor
@Observable
public final class WalletRecoveryModel: Identifiable {
  public enum State: Equatable { case editing, loading, revealed, revoked }
  public enum Issue: Equatable {
    case passwordRequired, reauthentication, denied, unsupported, failed
    case rotationPending, rotationUnavailable
  }
  /// `anchorWords` copies words 1–12 of a rotated phrase: the part every non-Telegram wallet uses.
  public enum CopyField: Equatable { case mnemonic, anchorWords, passphrase }
  public let walletID: String
  public let walletName: String
  /// The TON account whose signing key can be rotated (TEP-0003 rotation phrase), if any.
  public let tonAccountID: String?
  public private(set) var state: State = .editing
  public private(set) var password = ""
  public private(set) var recovery: WalletBackupExportResponse?
  public private(set) var rotation: WalletTonRotateKeyResponse?
  public private(set) var issue: Issue?
  public private(set) var passwordFocusRevision = 0
  public private(set) var copied: CopyField?
  private let store: any WalletRecoveryStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let work = ModelWork()

  public init(
    walletID: String, walletName: String, tonAccountID: String? = nil,
    store: any WalletRecoveryStore, generation: UInt64, clipboard: any CredentialClipboard
  ) {
    self.walletID = walletID
    self.walletName = walletName
    self.tonAccountID = tonAccountID
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
  }

  public func changePassword(_ value: String) {
    guard state == .editing else { return }
    password = value
    issue = nil
  }
  @discardableResult
  public func reveal() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    issue = nil
    guard !password.isEmpty else {
      issue = .passwordRequired
      passwordFocusRevision += 1
      return nil
    }
    let request = WalletBackupExportRequest(masterPassword: password, walletID: walletID)
    password = ""
    state = .loading
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.exportWalletRecovery(request, generation: generation)
        guard let self, run.isCurrent else { return }
        guard result.walletID == self.walletID, result.exportKind == "mnemonic",
          !result.mnemonic.isEmpty
        else {
          self.issue = .failed
          self.state = .editing
          return
        }
        self.recovery = result
        self.state = .revealed
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .revoked:
          self.revoke()
          return
        case .reauthRequired:
          self.issue = .reauthentication
          self.passwordFocusRevision += 1
        case .denied: self.issue = .denied
        // This screen has no "unavailable" issue: a disabled wallet reads as denied here.
        case .unavailable where error.coreFailure?.code == "WALLET_DISABLED": self.issue = .denied
        case .unknown where error.coreFailure?.code == "UNSUPPORTED_EXPORT_KIND":
          self.issue = .unsupported
        default: self.issue = .failed
        }
        self.state = .editing
      }
    }
  }
  public var canRotate: Bool { tonAccountID != nil }

  /// Rotates the TON signing key. Core persists the new signing half before broadcasting and
  /// keeps the previous phrase valid until the rotation lands, so the user can write the new
  /// 24 words down without a race.
  @discardableResult
  public func rotateKey() -> Task<Void, Never>? {
    guard state == .editing, let tonAccountID else { return nil }
    issue = nil
    guard !password.isEmpty else {
      issue = .passwordRequired
      passwordFocusRevision += 1
      return nil
    }
    let request = WalletTonRotateKeyRequest(accountID: tonAccountID, masterPassword: password)
    password = ""
    state = .loading
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.rotateTonSigningKey(request, generation: generation)
        guard let self, run.isCurrent else { return }
        guard result.walletID == self.walletID, result.mnemonic.count == 24 else {
          self.issue = .failed
          self.state = .editing
          return
        }
        self.rotation = result
        self.recovery = WalletBackupExportResponse(
          bip39Passphrase: nil, exportKind: "mnemonic", mnemonic: result.mnemonic,
          mnemonicStandard: result.mnemonicStandard, walletID: result.walletID,
          walletMode: "ton_only", wordlist: result.wordlist)
        self.state = .revealed
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .revoked:
          self.revoke()
          return
        case .reauthRequired:
          self.issue = .reauthentication
          self.passwordFocusRevision += 1
        case .denied: self.issue = .denied
        // A disabled wallet reads as denied here; other unavailable codes mean rotation itself
        // is not offered for this account.
        case .unavailable where error.coreFailure?.code == "WALLET_DISABLED": self.issue = .denied
        case .invalidInput: self.issue = .rotationPending
        case .unavailable: self.issue = .rotationUnavailable
        case .unknown where error.coreFailure?.code == "UNSUPPORTED_EXPORT_KIND":
          self.issue = .rotationUnavailable
        default: self.issue = .failed
        }
        self.state = .editing
      }
    }
  }
  public func copy(_ field: CopyField) {
    guard state == .revealed, let recovery else { return }
    let value: String?
    switch field {
    case .mnemonic: value = recovery.mnemonic.joined(separator: " ")
    case .anchorWords:
      guard recovery.mnemonicStandard == "rotation", recovery.mnemonic.count == 24 else { return }
      value = recovery.mnemonic.prefix(12).joined(separator: " ")
    case .passphrase: value = recovery.bip39Passphrase
    }
    guard let value, !value.isEmpty else { return }
    clipboard.copy(value)
    copied = field
  }
  /// A cover also invalidates an outstanding read; revealing again requires reauthentication.
  public func hideValues() {
    guard state != .revoked else { return }
    work.cancel()
    password = ""
    recovery = nil
    rotation = nil
    issue = nil
    copied = nil
    clipboard.clearOwned()
    state = .editing
  }
  public func revoke() {
    hideValues()
    state = .revoked
  }
}
