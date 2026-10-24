import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class PasswordMaintenanceModel: Identifiable {
  public enum Kind: Sendable { case vault, administrator }
  public enum State: Equatable { case editing, working, completed, uncertain, revoked }
  public enum Field { case current, newPassword, confirmation }
  public enum Issue: Equatable {
    case currentRequired, newRequired, mismatch, samePassword, reauthentication, policy, cancelled
  }
  public let kind: Kind
  public private(set) var state: State = .editing
  public private(set) var currentPassword = ""
  public private(set) var newPassword = ""
  public private(set) var confirmation = ""
  public private(set) var issue: Issue?
  public private(set) var focus: Field = .current
  public private(set) var focusRevision = 0
  public private(set) var backupRecommended = false
  private let store: any MaintenanceStore
  public let generation: UInt64
  private let work = ModelWork()

  public init(kind: Kind, store: any MaintenanceStore, generation: UInt64) {
    self.kind = kind
    self.store = store
    self.generation = generation
  }

  public func change(_ field: Field, value: String) {
    guard state == .editing else { return }
    switch field {
    case .current: currentPassword = value
    case .newPassword: newPassword = value
    case .confirmation: confirmation = value
    }
    issue = nil
  }

  @discardableResult
  public func submit() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    guard !currentPassword.isEmpty else {
      fail(.currentRequired, field: .current)
      return nil
    }
    guard !newPassword.isEmpty else {
      fail(.newRequired, field: .newPassword)
      return nil
    }
    guard newPassword != currentPassword else {
      fail(.samePassword, field: .newPassword)
      return nil
    }
    guard newPassword == confirmation else {
      fail(.mismatch, field: .confirmation)
      return nil
    }
    let current = currentPassword
    let replacement = newPassword
    currentPassword = ""
    issue = nil
    state = .working
    return work.start { [weak self, store, generation, kind] run in
      do {
        let backupRecommended: Bool
        switch kind {
        case .vault:
          backupRecommended = try await store.rekeyVault(
            VaultRekeyRequest(currentPassword: current, newPassword: replacement),
            generation: generation
          ).backupRecommended
        case .administrator:
          backupRecommended = try await store.rekeyMaster(
            MasterRekeyRequest(currentPassword: current, newMasterPassword: replacement),
            generation: generation
          ).backupRecommended
        }
        guard let self, run.isCurrent else { return }
        self.hideValues()
        self.backupRecommended = backupRecommended
        self.state = .completed
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        // Rekey codes are specific to this screen; `isSessionRevoked` above already covers
        // `VAULT_REQUIRED` and `SESSION_REVOKED`.
        switch error.coreFailure?.code {
        case "REKEY_INVALID_CURRENT_PASSWORD", "MASTER_REKEY_INVALID_CURRENT_PASSWORD":
          self.fail(.reauthentication, field: .current)
        case "REKEY_PASSWORD_POLICY", "MASTER_REKEY_PASSWORD_POLICY":
          self.fail(.policy, field: .newPassword)
        case "REKEY_CANCELLED":
          self.fail(.cancelled, field: .current)
        default:
          // A transport failure or interrupted commit is not permission to repeat a write.
          self.hideValues()
          self.state = .uncertain
        }
      }
    }
  }

  private func fail(_ issue: Issue, field: Field) {
    self.issue = issue
    focus = field
    focusRevision += 1
    state = .editing
  }

  public func hideValues() {
    currentPassword = ""
    newPassword = ""
    confirmation = ""
  }

  public func revoke() {
    work.cancel()
    hideValues()
    issue = nil
    backupRecommended = false
    state = .revoked
  }
}
