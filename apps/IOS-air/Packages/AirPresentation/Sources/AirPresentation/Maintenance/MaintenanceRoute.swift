import Foundation

@MainActor
public enum MaintenanceRoute: Identifiable {
  case backup(StorageBackupModel)
  case restore(StorageRestoreModel)
  case erase(StorageEraseModel)
  case password(PasswordMaintenanceModel)

  nonisolated public var id: ObjectIdentifier {
    switch self {
    case .backup(let model): ObjectIdentifier(model)
    case .restore(let model): ObjectIdentifier(model)
    case .erase(let model): ObjectIdentifier(model)
    case .password(let model): ObjectIdentifier(model)
    }
  }
  var generation: UInt64 {
    switch self {
    case .backup(let model): model.generation
    case .restore(let model): model.generation
    case .erase(let model): model.generation
    case .password(let model): model.generation
    }
  }
  var working: Bool {
    switch self {
    case .backup(let model): model.state == .working || model.state == .cancelling
    case .restore(let model):
      model.state == .reviewing || model.state == .cancelling || model.state == .committing
    case .password(let model): model.state == .working
    case .erase(let model): model.state == .committing
    }
  }
  func revoke() {
    switch self {
    case .backup(let model): model.revoke()
    case .restore(let model): model.revoke()
    case .erase(let model): model.revoke()
    case .password(let model): model.revoke()
    }
  }
}
