import AuthenticationServices
import ChromVoidBridge
import Foundation
import Observation

@MainActor
public protocol AutoFillSettingsOpening {
  var canOpen: Bool { get }
  func open() async throws
}

@MainActor
public struct SystemAutoFillSettings: AutoFillSettingsOpening {
  public init() {}
  public var canOpen: Bool {
    if #available(iOS 17.0, *) { return true }
    return false
  }
  public func open() async throws {
    if #available(iOS 17.0, *) {
      try await ASSettingsHelper.openCredentialProviderAppSettings()
    } else {
      throw BridgeError.CapabilityUnavailable
    }
  }
}

/// Setup navigation survives a trip to Settings; the vault snapshot never does.
@MainActor
@Observable
public final class AutoFillModel: Identifiable {
  public enum State { case loading, ready, failed, suspended }
  public let id = UUID()
  public private(set) var state = State.loading
  public private(set) var status: AutoFillStatus?
  public private(set) var openingSettings = false
  public private(set) var settingsFailed = false
  public var canOpenSettings: Bool { settings.canOpen }

  private let store: any AutoFillStore
  private let settings: any AutoFillSettingsOpening
  @ObservationIgnored private var generation: UInt64?
  @ObservationIgnored private var sequence: UInt64?
  private let work = ModelWork()
  private let settingsWork = ModelWork()

  public init(
    store: any AutoFillStore, settings: any AutoFillSettingsOpening = SystemAutoFillSettings()
  ) {
    self.store = store
    self.settings = settings
  }

  @discardableResult
  public func synchronize(generation: UInt64, sequence: UInt64) -> Task<Void, Never>? {
    guard self.generation != generation || self.sequence != sequence else { return nil }
    self.generation = generation
    self.sequence = sequence
    return reload()
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard let generation else { return nil }
    status = nil
    state = .loading
    return work.start { [weak self, store] run in
      do {
        let status = try await store.autoFillStatus(generation: generation)
        guard let self, run.isCurrent else { return }
        self.status = status
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .failed
      }
    }
  }

  @discardableResult
  public func openSettings() -> Task<Void, Never>? {
    guard generation != nil, canOpenSettings, !openingSettings else { return nil }
    settingsFailed = false
    openingSettings = true
    return settingsWork.start { [weak self, settings] run in
      do {
        try await settings.open()
      } catch {
        guard let self, run.isCurrent else { return }
        self.settingsFailed = true
      }
      guard let self, run.isCurrent else { return }
      self.openingSettings = false
    }
  }

  public func suspend() {
    work.cancel()
    settingsWork.cancel()
    generation = nil
    sequence = nil
    status = nil
    openingSettings = false
    settingsFailed = false
    state = .suspended
  }
}

extension AutoFillModel {
  var systemSummary: String {
    switch status?.systemEnabled {
    case true: "Enabled in iOS"
    case false: "Not enabled in iOS"
    case nil: "Provider extension is unavailable"
    }
  }

  var accessSummary: String {
    guard let status else { return "Not checked" }
    guard status.core.vaultOpen else { return "Vault is closed" }
    guard status.core.enabled, status.core.capabilityMatrix.ios.passwordProvider else {
      return "Provider access is unavailable"
    }
    switch status.access {
    case .authorized: return "Local vault authorized"
    case .unavailable: return "Provider access is unavailable"
    case .unknown: return "Not checked"
    }
  }
}
