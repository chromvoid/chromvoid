import Foundation

@MainActor
public protocol PasswordGeneratorStore: AnyObject {
  func generatePassword(_ request: PassmanagerPasswordGenerateRequest, generation: UInt64)
    async throws -> String
}
