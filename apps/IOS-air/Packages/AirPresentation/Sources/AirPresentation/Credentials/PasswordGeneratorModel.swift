import ChromVoidBridge
import Foundation
import Observation

/// Generates a transient candidate. Only the parent credential form owns saving.
@Observable
@MainActor
public final class PasswordGeneratorModel: Identifiable {
  public struct Settings: Equatable {
    public var length = 16
    public var lowercase = true
    public var uppercase = true
    public var digits = true
    public var symbols = false
  }
  public enum State: Equatable { case ready, generating, revoked }
  public let id = UUID()
  public private(set) var settings = Settings()
  public private(set) var state: State = .ready
  public private(set) var issue: String?
  public private(set) var password: String?
  public private(set) var revealed = false
  public var displayValue: String { revealed ? password ?? "" : "••••••••••••" }
  private let store: any PasswordGeneratorStore
  private let generation: UInt64
  private let onUse: (String) -> Void
  private let work = ModelWork()

  public init(
    store: any PasswordGeneratorStore, generation: UInt64, onUse: @escaping (String) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.onUse = onUse
  }
  public func change(_ update: (inout Settings) -> Void) {
    guard state != .revoked else { return }
    var value = settings
    update(&value)
    guard value != settings else { return }
    settings = value
    clearCandidate()
    issue = nil
  }
  @discardableResult
  public func generate() -> Task<Void, Never>? {
    guard state == .ready else { return nil }
    clearCandidate()
    issue = nil
    guard settings.lowercase || settings.uppercase || settings.digits || settings.symbols else {
      issue = "Choose at least one character type."
      return nil
    }
    let request = PassmanagerPasswordGenerateRequest(
      digits: settings.digits, length: settings.length, lowercase: settings.lowercase,
      symbols: settings.symbols, uppercase: settings.uppercase)
    state = .generating
    return work.start { [weak self, store, generation] run in
      do {
        let value = try await store.generatePassword(request, generation: generation)
        guard let self, run.isCurrent else { return }
        self.state = .ready
        guard !value.isEmpty else {
          self.issue = "Couldn’t generate a password. Try again."
          return
        }
        self.password = value
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .ready
        if error.isSessionRevoked {
          self.revoke()
          self.issue = "Vault locked"
        } else if error.coreFailureKind == .invalidInput {
          self.issue = "Use 4–128 characters and select at least one character type."
        } else {
          self.issue = "Couldn’t generate a password. Try again."
        }
      }
    }
  }
  public func toggleVisibility() {
    guard state == .ready, password != nil else { return }
    revealed.toggle()
  }
  public func use() {
    guard state == .ready else { return }
    guard let password else {
      issue = "Generate a password first."
      return
    }
    onUse(password)
    revoke()
  }
  private func clearCandidate() {
    work.cancel()
    password = nil
    revealed = false
    state = .ready
  }
  public func revoke() {
    clearCandidate()
    state = .revoked
    issue = nil
  }
}
