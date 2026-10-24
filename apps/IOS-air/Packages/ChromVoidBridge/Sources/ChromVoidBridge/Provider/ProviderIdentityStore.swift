import AuthenticationServices
import Foundation

@MainActor
protocol ProviderIdentityStore {
  func isEnabled() async -> Bool
  func replace(_ identities: [AirPasswordIdentity]) async throws
  func removeAll() async throws
}

/// Apple metadata store only. Whole replacement avoids a competing local credential index.
@MainActor
final class SystemProviderIdentityStore: ProviderIdentityStore {
  private let store = ASCredentialIdentityStore.shared

  static func forEmbeddedProvider() -> SystemProviderIdentityStore? {
    guard let plugins = Bundle.main.builtInPlugInsURL,
      Bundle(url: plugins.appendingPathComponent("AirCredentialProviderExtension.appex")) != nil
    else { return nil }
    return SystemProviderIdentityStore()
  }

  func isEnabled() async -> Bool {
    await withCheckedContinuation { continuation in
      store.getState { state in continuation.resume(returning: state.isEnabled) }
    }
  }

  func replace(_ identities: [AirPasswordIdentity]) async throws {
    let entries = identities.map {
      ASPasswordCredentialIdentity(
        serviceIdentifier: ASCredentialServiceIdentifier(identifier: $0.domain, type: .domain),
        user: $0.username, recordIdentifier: $0.recordIdentifier)
    }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let completion: @Sendable (Bool, Error?) -> Void = { success, error in
        if success {
          continuation.resume()
        } else {
          continuation.resume(throwing: error ?? BridgeError.RuntimeUnavailable)
        }
      }
      if #available(iOS 17.0, *) {
        store.replaceCredentialIdentities(
          entries as [any ASCredentialIdentity], completion: completion)
      } else {
        store.replaceCredentialIdentities(with: entries, completion: completion)
      }
    }
  }

  func removeAll() async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      store.removeAllCredentialIdentities { success, error in
        if success {
          continuation.resume()
        } else {
          continuation.resume(throwing: error ?? BridgeError.RuntimeUnavailable)
        }
      }
    }
  }
}
