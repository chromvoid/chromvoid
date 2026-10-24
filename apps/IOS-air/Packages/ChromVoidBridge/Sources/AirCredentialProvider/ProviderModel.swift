import Combine
import Foundation

struct ProviderChoice: Identifiable {
  let id: String
  let title: String
  let subtitle: String
  let symbol: String
  let perform: @MainActor () async throws -> Void
}

@MainActor
final class ProviderModel: ObservableObject {
  @Published private(set) var choices: [ProviderChoice] = []
  @Published private(set) var message: String?
  @Published private(set) var busy = false
  @Published private(set) var isConfiguration = false
  private var operation: Task<Void, Never>?
  private var generation = UUID()

  deinit { operation?.cancel() }

  @discardableResult
  func prepare(_ load: @escaping @MainActor () async throws -> [ProviderChoice]) -> Task<
    Void, Never
  > {
    reset()
    busy = true
    let generation = generation
    let task = Task { [weak self] in
      do {
        let choices = try await load()
        try Task.checkCancellation()
        guard let self, self.generation == generation else { return }
        self.choices = choices
        self.message = choices.isEmpty ? ProviderCopy.text("No matching credentials") : nil
        self.busy = false
      } catch {
        guard let self, self.generation == generation, !Task.isCancelled else { return }
        self.show(error)
      }
    }
    operation = task
    return task
  }

  @discardableResult
  func choose(_ choice: ProviderChoice) -> Task<Void, Never>? {
    guard !busy else { return nil }
    busy = true
    choices = []
    let generation = generation
    let task = Task { [weak self] in
      do {
        try await choice.perform()
      } catch {
        guard let self, self.generation == generation, !Task.isCancelled else { return }
        self.show(error)
      }
    }
    operation = task
    return task
  }

  func show(_ error: any Error) {
    busy = false
    choices = []
    switch (error as? ProviderFailure)?.code {
    case "USER_VERIFICATION_FAILED":
      message = ProviderCopy.text(
        "Identity verification was not completed. Close AutoFill and try again.")
    case "REGISTRATION_UNCERTAIN":
      message = ProviderCopy.text(
        "The passkey may have been created. Check Passkeys in ChromVoid Air before trying again.")
    case "VAULT_REQUIRED":
      message = ProviderCopy.text("Your vault is locked. Open ChromVoid Air to unlock it.")
    case "PROVIDER_DISABLED":
      message = ProviderCopy.text("Credential providers are disabled in ChromVoid Air.")
    case "NO_MATCH": message = ProviderCopy.text("No matching credentials")
    case "UNSUPPORTED", "FEATURE_UNSUPPORTED_ON_PLATFORM", "FEATURE_DISABLED_BY_ROLLOUT",
      "HOTP_AUTOFILL_UNSUPPORTED":
      message = ProviderCopy.text("This credential type is unavailable on this device.")
    case "INVALID_CONTEXT", "ACCESS_DENIED":
      message = ProviderCopy.text("This credential cannot be used for the requested service.")
    default:
      message = ProviderCopy.text(
        "AutoFill needs an active app session. ChromVoid Air is unavailable while the app is locked, in the background, or closed."
      )
    }
  }

  func configure() {
    reset()
    isConfiguration = true
    message = ProviderCopy.text(
      "AutoFill needs an active app session. ChromVoid Air is unavailable while the app is locked, in the background, or closed."
    )
  }

  func reset() {
    isConfiguration = false
    generation = UUID()
    operation?.cancel()
    operation = nil
    choices = []
    message = nil
    busy = false
  }
}
