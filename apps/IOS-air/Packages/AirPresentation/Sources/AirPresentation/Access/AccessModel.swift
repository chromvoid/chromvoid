import ChromVoidBridge
import Foundation
import Observation
import UIKit

/// The sole application coordinator. Presentation never grants Rust authority.
@MainActor
@Observable
public final class AccessModel {
  public enum Phase: Equatable {
    case starting, welcome, setup, locked, unlocked, presenceRequired, unavailable
  }
  public enum Field: Hashable { case password, confirmation }
  public enum Issue: String {
    case passwordRequired = "Enter a password."
    case confirmationRequired = "Repeat the administrative password."
    case mismatch = "The administrative passwords don’t match."
    case storage =
      "Secure storage is unavailable. Unlock your device and try again."
    case missingPepper =
      "The device key for this storage is unavailable. Your stored data has been preserved."
    case operation = "The operation could not finish. Try again."
    case presence = "Device authentication did not finish. Try again when you’re ready."
  }

  public private(set) var maintenance: MaintenanceRoute?
  public private(set) var eraseOutcome: StorageEraseOutcome?
  public private(set) var autoFill: AutoFillModel?
  /// The open vault's models; nil while locked. Views reading them through the coordinator
  /// track the nested observable directly.
  public private(set) var vault: VaultModels?
  public var credentials: CredentialsModel? { vault?.credentials }
  public var files: FilesModel? { vault?.files }
  public var wallet: WalletModel? { vault?.wallet }
  public var passkeys: PasskeysModel? { vault?.passkeys }
  /// The wallet screen is pushed over the vault root; the model itself lives from unlock.
  public var walletPresented: Bool { vault?.walletPresented ?? false }
  public private(set) var connections: ConnectionsModel?
  public var connectionsPresented = false
  public private(set) var phase: Phase = .starting {
    didSet { updateScreenAwake() }
  }
  public private(set) var privacyCovered = true {
    didSet { updateScreenAwake() }
  }
  public private(set) var busy = false
  private(set) var brandUnlockMotion: BrandUnlockMotion?
  public private(set) var issue: Issue?
  public private(set) var invalidField: Field?
  public private(set) var validationRevision = 0
  public private(set) var presenceEnabled: Bool
  public private(set) var keepScreenAwakeEnabled: Bool
  /// Off by default: leaving the app only covers the screen; the vault stays open until the
  /// auto-lock timeout, an explicit lock, or the device locking (protected data unavailable).
  public private(set) var lockOnBackgroundEnabled: Bool
  public private(set) var autoLockTimeout: AutoLockTimeout
  public let filePreferences: FilePreferences
  public var password = ""
  public var confirmation = ""

  private let openRuntime: @MainActor () async throws -> any AccessRuntime
  private let presence: any PresenceChecking
  private let clipboard: any CredentialClipboard
  private let screenAwake: any ScreenAwakeControlling
  private let preferences: UserDefaults
  @ObservationIgnored private var runtime: (any AccessRuntime)?
  /// The one runtime operation in flight: the initial open, setup/unlock, or a presence check.
  private let work = ModelWork()
  private let events = ModelWork()
  /// A revocation that arrived while the runtime was still opening; the open is never cancelled,
  /// the runtime is deactivated when it lands instead.
  @ObservationIgnored private var revokeOnOpen = false
  private var active = false {
    didSet { updateScreenAwake() }
  }
  private var protectedDataAvailable = true
  @ObservationIgnored private var presenceSatisfied = false
  @ObservationIgnored private var welcomeDismissed = false
  private static let presencePreference = "air.presence.enabled"
  private static let screenAwakePreference = "air.screen-awake.enabled"
  private static let lockOnBackgroundPreference = "air.lock-on-background.enabled"
  private static let autoLockPreference = "air.auto-lock.seconds"

  public init(
    preferences: UserDefaults = .standard,
    presence: any PresenceChecking = SystemPresenceCheck(),
    clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    screenAwake: any ScreenAwakeControlling = SystemScreenAwakeControl(),
    openRuntime: @escaping @MainActor () async throws -> any AccessRuntime = {
      try await RuntimeClient.open()
    }
  ) {
    self.preferences = preferences
    filePreferences = FilePreferences(defaults: preferences)
    self.presence = presence
    self.clipboard = clipboard
    self.screenAwake = screenAwake
    self.openRuntime = openRuntime
    presenceEnabled = preferences.bool(forKey: Self.presencePreference)
    keepScreenAwakeEnabled = preferences.bool(forKey: Self.screenAwakePreference)
    lockOnBackgroundEnabled = preferences.bool(forKey: Self.lockOnBackgroundPreference)
    autoLockTimeout =
      AutoLockTimeout(rawValue: preferences.integer(forKey: Self.autoLockPreference))
      ?? .never
  }

  public func setAutoLockTimeout(_ timeout: AutoLockTimeout) {
    guard active, !privacyCovered, phase == .unlocked, let runtime, let credentials else { return }
    do {
      try runtime.setAutoLockTimeout(
        seconds: UInt64(timeout.rawValue), generation: credentials.generation)
      autoLockTimeout = timeout
      preferences.set(timeout.rawValue, forKey: Self.autoLockPreference)
      issue = nil
    } catch BridgeError.SessionRevoked {
      refresh()
    } catch {
      issue = .operation
    }
  }

  /// Called by the Apple input adapter only. Domain updates and lifecycle events never refresh idle time.
  public func recordUserActivity() {
    guard active, protectedDataAvailable, !privacyCovered, phase == .unlocked,
      autoLockTimeout != .never, let runtime, let credentials
    else { return }
    do {
      try runtime.recordUserActivity(generation: credentials.generation)
    } catch BridgeError.SessionRevoked {
      refresh()
    } catch {
      unavailable(.storage)
    }
  }

  public func setLockOnBackgroundEnabled(_ enabled: Bool) {
    lockOnBackgroundEnabled = enabled
    preferences.set(enabled, forKey: Self.lockOnBackgroundPreference)
  }

  public func setKeepScreenAwakeEnabled(_ enabled: Bool) {
    guard active, !privacyCovered, phase == .unlocked else { return }
    keepScreenAwakeEnabled = enabled
    preferences.set(enabled, forKey: Self.screenAwakePreference)
    updateScreenAwake()
  }

  private func updateScreenAwake() {
    screenAwake.setAwake(
      keepScreenAwakeEnabled && active && protectedDataAvailable && !privacyCovered
        && phase == .unlocked)
  }

  public func shutdown() {
    revokeMaintenance()
    connections?.suspend()
    connectionsPresented = false
    closeAutoFill()
    clipboard.clearOwned()
    work.cancel()
    events.cancel()
    presence.cancel()
    brandUnlockMotion = nil
    clearFields()
    purgeVault()
    privacyCovered = true
    active = false
    _ = try? runtime?.close()
  }

  public func start() {
    guard runtime == nil, !work.isRunning, active, protectedDataAvailable else { return }
    phase = .starting
    revokeOnOpen = false
    work.start { [weak self, openRuntime] run in
      do {
        let runtime = try await openRuntime()
        guard let self else {
          _ = try? runtime.close()
          return
        }
        do {
          try runtime.setAutoLockTimeout(
            seconds: UInt64(self.autoLockTimeout.rawValue),
            generation: runtime.snapshot().generation)
        } catch {
          _ = try? runtime.close()
          throw error
        }
        // Keep the one runtime even if bootstrap completed while backgrounded.
        self.runtime = runtime
        self.connections = ConnectionsModel(
          store: runtime.connections, deviceLabel: UIDevice.current.name, clipboard: self.clipboard)
        if !self.active || !self.protectedDataAvailable || !run.isCurrent || self.revokeOnOpen {
          _ = try runtime.deactivate()
        }
        self.observe(runtime)
        if self.active && self.protectedDataAvailable {
          self.receive(try runtime.activate())
        }
      } catch {
        guard let self else { return }
        self.issue = .operation
        self.phase = .unavailable
      }
    }
  }

  public func sceneActive(protectedDataAvailable: Bool) {
    active = true
    self.protectedDataAvailable = protectedDataAvailable
    privacyCovered = !protectedDataAvailable
    guard protectedDataAvailable else {
      clipboard.clearOwned()
      revoke()
      return
    }
    if let runtime {
      do { receive(try runtime.activate()) } catch { unavailable(.storage) }
    } else {
      start()
    }
  }

  public func sceneInactive() {
    autoFill?.suspend()
    active = false
    privacyCovered = true
    vault?.coverSensitiveValues()
  }

  public func sceneBackground() {
    active = false
    privacyCovered = true
    if lockOnBackgroundEnabled {
      revoke()
    } else {
      autoFill?.suspend()
      vault?.coverSensitiveValues()
    }
  }

  public func protectedDataLost() {
    clipboard.clearOwned()
    protectedDataAvailable = false
    privacyCovered = true
    revoke()
  }

  public func protectedDataRestored() {
    protectedDataAvailable = true
    if active { sceneActive(protectedDataAvailable: true) }
  }

  public func continueWelcome() {
    welcomeDismissed = true
    refresh()
  }

  public func submit() {
    guard !busy, maintenance == nil, active, !privacyCovered,
      phase == .setup || phase == .locked,
      let runtime
    else { return }
    issue = nil
    invalidField = nil
    // Whitespace may be intentional password content; never trim it.
    guard !password.isEmpty else {
      invalid(.passwordRequired, field: .password)
      return
    }
    let setup = phase == .setup
    if setup {
      guard !confirmation.isEmpty else {
        invalid(.confirmationRequired, field: .confirmation)
        return
      }
      guard password == confirmation else {
        invalid(.mismatch, field: .confirmation)
        return
      }
    }
    let input = password
    clearFields()
    busy = true
    brandUnlockMotion = BrandUnlockMotion(startedAt: Date())
    work.start { [weak self] run in
      do {
        if setup {
          try await runtime.setupAdministrator(password: input)
        } else {
          try await runtime.unlock(password: input)
        }
        guard let self, run.isCurrent else { return }
        self.busy = false
        self.receive(try runtime.snapshot())
      } catch {
        guard let self, run.isCurrent else { return }
        self.busy = false
        self.handle(error)
      }
    }
  }

  public func cancelOperation() {
    revokeMaintenance()
    connections?.suspend()
    autoFill?.suspend()
    clipboard.clearOwned()
    work.cancel()
    presence.cancel()
    busy = false
    brandUnlockMotion = nil
    clearFields()
    purgeVault()
    // Cancellation may race a committed unlock: revoke Core even if Swift has no result.
    if let runtime {
      do { receive(try runtime.lock()) } catch { unavailable(.storage) }
    }
  }

  public func lock() {
    cancelOperation()
    issue = nil
  }

  public func retry() {
    guard active, protectedDataAvailable, !privacyCovered else { return }
    issue = nil
    phase = .starting
    if let runtime {
      do { receive(try runtime.activate()) } catch { unavailable(.storage) }
    } else {
      start()
    }
  }

  public func setPresenceEnabled(_ enabled: Bool) {
    guard !busy, active, !privacyCovered, phase == .unlocked else { return }
    if enabled {
      authenticatePresence(enabling: true)
    } else {
      presenceEnabled = false
      presenceSatisfied = false
      preferences.set(false, forKey: Self.presencePreference)
    }
  }

  public func authenticatePresence() { authenticatePresence(enabling: false) }

  private func authenticatePresence(enabling: Bool) {
    guard !busy, active, !privacyCovered,
      enabling ? phase == .unlocked : phase == .presenceRequired
    else { return }
    busy = true
    issue = nil
    work.start { [weak self, presence] run in
      do {
        let accepted = try await presence.authenticate()
        guard let self, run.isCurrent else { return }
        self.busy = false
        if accepted {
          self.presenceSatisfied = true
          if enabling {
            self.presenceEnabled = true
            self.preferences.set(true, forKey: Self.presencePreference)
          }
          // Authentication only changes app admission. Never call vault:unlock here.
          self.refresh()
        } else {
          self.issue = .presence
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.busy = false
        self.issue = .presence
      }
    }
  }

  private func revoke() {
    revokeMaintenance()
    connections?.suspend()
    autoFill?.suspend()
    if runtime != nil {
      work.cancel()
    } else {
      // Do not cancel the initial open: retain its runtime and revoke when it arrives.
      revokeOnOpen = true
    }
    presence.cancel()
    presenceSatisfied = false
    busy = false
    brandUnlockMotion = nil
    clearFields()
    issue = nil
    phase = .locked
    purgeVault()
    do { _ = try runtime?.deactivate() } catch { unavailable(.storage) }
  }

  private func observe(_ runtime: any AccessRuntime) {
    events.start { [weak self] run in
      var sequence: UInt64 = 0
      do {
        while run.isCurrent {
          let batch = try await runtime.events(after: sequence)
          try Task.checkCancellation()
          sequence = batch.snapshot.sequence
          guard let self else { return }
          // A queued event may predate a background/foreground cycle. Re-read authority.
          let current = try runtime.snapshot()
          self.receive(current)
          if current.phase == .closed || current.phase == .failed { return }
        }
      } catch {
        guard run.isCurrent else { return }
        self?.unavailable(.storage)
      }
    }
  }

  private func refresh() {
    do { if let runtime { receive(try runtime.snapshot()) } } catch { unavailable(.storage) }
  }

  private func receive(_ snapshot: AirSnapshot) {
    if let maintenance,
      maintenance.generation != snapshot.generation || snapshot.cleanupPending
        || (snapshot.phase != .locked && snapshot.phase != .unlocked)
    {
      // A committing erase holds only progress and its Rust receipt handle. Keep that
      // screen through the intentional generation change; explicit lifecycle cover
      // still calls revokeMaintenance and the completion callback survives separately.
      switch maintenance {
      case .erase(let model) where model.state == .committing: break
      default: revokeMaintenance()
      }
    }
    if active && snapshot.phase != .unlocked { clipboard.clearOwned() }
    if snapshot.phase != .unlocked || vault?.generation != snapshot.generation {
      purgeVault()
    }
    guard active, protectedDataAvailable, phase != .unavailable else { return }
    if snapshot.phase == .failed || snapshot.phase == .closed {
      unavailable(.storage)
      return
    }
    if snapshot.cleanupPending {
      brandUnlockMotion = nil
      phase = .starting
      return
    }
    if presenceEnabled && !presenceSatisfied {
      brandUnlockMotion = nil
      phase = .presenceRequired
      return
    }
    if snapshot.masterConfigured && (snapshot.phase == .locked || snapshot.phase == .unlocked) {
      connections?.synchronize(
        generation: snapshot.generation, vaultOpen: snapshot.phase == .unlocked)
    }
    autoFill?.synchronize(generation: snapshot.generation, sequence: snapshot.sequence)
    switch snapshot.phase {
    case .unlocked:
      // The event stream can observe the committed unlock before submit returns.
      // Keep its first completion time so that an ordinary snapshot never restarts the ring.
      if brandUnlockMotion?.completedAt == nil { brandUnlockMotion?.completedAt = Date() }
      phase = .unlocked
      if vault == nil, let runtime {
        vault = VaultModels(
          runtime: runtime, snapshot: snapshot, clipboard: clipboard,
          filePreferences: filePreferences)
      }
      vault?.synchronize(sequence: snapshot.sequence)
    case .locked:
      if !busy { brandUnlockMotion = nil }
      phase = snapshot.masterConfigured ? .locked : (welcomeDismissed ? .setup : .welcome)
    case .inactive, .deactivating:
      brandUnlockMotion = nil
      phase = .starting
    case .closed, .failed: unavailable(.storage)
    }
  }

  public enum MaintenanceAction {
    case backup, restore, erase, vaultPassword, administratorPassword
  }

  public var eraseOutcomePresented: Bool {
    active && protectedDataAvailable && !privacyCovered && eraseOutcome != nil
  }

  public func dismissEraseOutcome() {
    guard eraseOutcomePresented else { return }
    eraseOutcome = nil
  }

  public func openMaintenance(_ action: MaintenanceAction) {
    guard active, protectedDataAvailable, !privacyCovered, !busy, maintenance == nil,
      eraseOutcome == nil,
      let runtime
    else { return }
    let allowed: Bool
    switch action {
    case .restore: allowed = [.welcome, .setup, .locked, .unlocked].contains(phase)
    // Backup, erase and the administrative password re-authenticate with the administrative
    // password inside Core, so they do not need an open vault. Vault password changes do.
    case .backup, .erase, .administratorPassword: allowed = phase == .locked || phase == .unlocked
    case .vaultPassword: allowed = phase == .unlocked
    }
    guard allowed else { return }
    do {
      let snapshot = try runtime.snapshot()
      guard !snapshot.cleanupPending, snapshot.phase == .locked || snapshot.phase == .unlocked
      else {
        return
      }
      clearFields()
      vault?.coverSensitiveValues()
      switch action {
      case .backup:
        maintenance = .backup(
          StorageBackupModel(
            store: runtime.storageBackups, generation: snapshot.generation))
      case .restore:
        maintenance = .restore(
          StorageRestoreModel(
            store: runtime.storageRestores, generation: snapshot.generation,
            onRestored: { [weak self] in self?.refresh() }))
      case .erase:
        guard snapshot.masterConfigured else { return }
        let model = StorageEraseModel(
          store: runtime.storageErasure, generation: snapshot.generation,
          onFinished: { [weak self] outcome in
            self?.finishStorageErase(outcome, generation: snapshot.generation)
          })
        maintenance = .erase(model)
        model.prepare()
      case .vaultPassword, .administratorPassword:
        maintenance = .password(
          PasswordMaintenanceModel(
            kind: action == .vaultPassword ? .vault : .administrator,
            store: runtime.maintenance, generation: snapshot.generation))
      }
    } catch { unavailable(.storage) }
  }

  public func closeMaintenance() {
    guard let route = maintenance, !route.working else { return }
    if case .restore(let model) = route, model.state == .review {
      let cleanup = model.cancel()
      Task { [weak self] in
        await cleanup?.value
        guard let self, self.maintenance?.id == route.id, model.issue != .cleanupFailed else {
          return
        }
        self.revokeMaintenance()
        self.refresh()
      }
    } else {
      revokeMaintenance()
      refresh()
    }
  }

  private func revokeMaintenance() {
    maintenance?.revoke()
    maintenance = nil
  }

  private func finishStorageErase(_ outcome: StorageEraseOutcome, generation: UInt64) {
    if case .erase(let model) = maintenance, model.generation == generation {
      revokeMaintenance()
    }
    // Non-secret outcome outlives the screen and waits behind the ordinary privacy cover.
    eraseOutcome = outcome
    refresh()
  }

  public func openAutoFill() {
    guard active, !privacyCovered, phase == .unlocked, let runtime else { return }
    vault?.coverSensitiveValues()
    closeAutoFill()
    autoFill = AutoFillModel(store: runtime.autoFill)
    refresh()
  }

  public func openConnections() {
    guard active, !privacyCovered, phase == .locked, connections != nil else { return }
    connectionsPresented = true
  }

  public func closeAutoFill() {
    autoFill?.suspend()
    autoFill = nil
  }

  public func openPasskeys() {
    guard active, !privacyCovered, phase == .unlocked, let vault else { return }
    vault.openPasskeys()
  }

  public func openWallet() {
    guard active, !privacyCovered, phase == .unlocked, let vault else { return }
    do { try vault.openWallet() } catch { unavailable(.storage) }
  }

  public func closeWallet() { vault?.closeWallet() }

  public func closePasskeys() { vault?.closePasskeys() }

  private func purgeVault() {
    vault?.revoke()
    vault = nil
  }

  private func invalid(_ issue: Issue, field: Field) {
    self.issue = issue
    invalidField = field
    validationRevision += 1
  }

  private func clearFields() {
    password = ""
    confirmation = ""
    invalidField = nil
  }

  private func handle(_ error: Error) {
    brandUnlockMotion = nil
    if let failure = error as? RPCFailure {
      switch failure.code {
      case "KEYSTORE_UNAVAILABLE": unavailable(.storage)
      case "STORAGE_PEPPER_REQUIRED": unavailable(.missingPepper)
      default: issue = .operation
      }
    } else {
      issue = .operation
    }
  }

  private func unavailable(_ issue: Issue) {
    revokeMaintenance()
    connections?.suspend()
    connectionsPresented = false
    autoFill?.suspend()
    clipboard.clearOwned()
    work.cancel()
    busy = false
    brandUnlockMotion = nil
    _ = try? runtime?.deactivate()
    purgeVault()
    clearFields()
    self.issue = issue
    phase = .unavailable
  }
}
