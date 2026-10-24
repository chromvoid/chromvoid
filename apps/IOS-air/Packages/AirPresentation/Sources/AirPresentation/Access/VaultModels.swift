import ChromVoidBridge
import Foundation
import Observation

/// The models of an open vault. They are created together when the vault unlocks, follow every
/// snapshot together, hide their revealed values together when the app leaves the foreground,
/// and are revoked together when the vault closes or its generation changes. `AccessModel`
/// decides *when* those things happen; this type knows *what* they mean for each model.
@MainActor
@Observable
public final class VaultModels {
  /// The Core generation these models belong to; a different generation means a new vault.
  public let generation: UInt64
  public let credentials: CredentialsModel
  public let files: FilesModel
  public let wallet: WalletModel
  /// Passkeys open fresh each time they are shown: the list is small and Core-authoritative.
  public private(set) var passkeys: PasskeysModel?
  /// The wallet screen is pushed over the vault root; the model itself lives from unlock.
  public private(set) var walletPresented = false
  private let runtime: any AccessRuntime

  init(
    runtime: any AccessRuntime, snapshot: AirSnapshot, clipboard: any CredentialClipboard,
    filePreferences: FilePreferences
  ) {
    self.runtime = runtime
    generation = snapshot.generation
    credentials = CredentialsModel(
      store: runtime.credentials, generation: snapshot.generation, clipboard: clipboard,
      passkeys: runtime.passkeys)
    files = FilesModel(
      store: runtime.files, imports: runtime.fileImports, generation: snapshot.generation,
      preferences: filePreferences)
    wallet = WalletModel(
      store: runtime.wallet, contacts: runtime.walletContacts, history: runtime.walletHistory,
      send: runtime.walletSend, recovery: runtime.walletRecovery,
      generation: snapshot.generation, clipboard: clipboard)
    wallet.reload()
  }

  /// A new catalog sequence reached the app: every model decides for itself whether to reload.
  func synchronize(sequence: UInt64) {
    files.synchronize(sequence: sequence)
    credentials.synchronize(sequence: sequence)
    passkeys?.synchronize(sequence: sequence)
    wallet.synchronize(sequence: sequence)
  }

  /// The app is leaving the foreground or another screen takes over: no revealed secret stays
  /// on screen.
  func coverSensitiveValues() {
    credentials.coverSensitiveValues()
    wallet.coverSensitiveValues()
  }

  func openPasskeys() {
    credentials.coverSensitiveValues()
    closePasskeys()
    let model = PasskeysModel(store: runtime.passkeys, generation: credentials.generation)
    passkeys = model
    model.reload()
  }

  func closePasskeys() {
    passkeys?.revoke()
    passkeys = nil
  }

  /// Pushes the wallet screen: revealed vault values are covered and the wallet catalog is
  /// brought up to date with Core. Throws when the runtime snapshot cannot be read.
  func openWallet() throws {
    credentials.coverSensitiveValues()
    wallet.synchronize(sequence: try runtime.snapshot().sequence)
    if wallet.state == .failed { wallet.reload() }
    walletPresented = true
  }

  /// Popping back to the vault keeps the wallet model; only its transient routes close.
  func closeWallet() {
    wallet.closeAddressBook()
    wallet.closeAccountRoute()
    wallet.closeSetup()
    wallet.closeNetwork()
    walletPresented = false
  }

  func revoke() {
    wallet.revoke()
    walletPresented = false
    closePasskeys()
    credentials.revoke()
    files.revoke()
  }
}
