import LocalAuthentication

/// One Apple authentication context per operation; all access stays on MainActor.
@MainActor
final class ProviderUserVerification {
  private let context = LAContext()

  func verify() async throws {
    defer { context.invalidate() }
    try await withTaskCancellationHandler {
      let verified: Bool
      do {
        verified = try await context.evaluatePolicy(
          .deviceOwnerAuthentication,
          localizedReason: ProviderCopy.text("Confirm your identity to use this passkey."))
      } catch {
        try Task.checkCancellation()
        throw ProviderFailure("USER_VERIFICATION_FAILED")
      }
      try Task.checkCancellation()
      guard verified else { throw CancellationError() }
    } onCancel: {
      Task { @MainActor in self.context.invalidate() }
    }
  }
}
