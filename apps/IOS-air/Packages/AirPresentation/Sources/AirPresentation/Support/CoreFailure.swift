import ChromVoidBridge
import Foundation

/// A Core error as the UI reasons about it. Core answers with string codes (`INVALID_INPUT`,
/// `ACCESS_DENIED`, `WALLET_DISABLED`, …); models care about a handful of kinds. The mapping
/// lives here once, so a new Core code lands in every screen at the same time.
public struct CoreFailure: Equatable, Sendable {
  public enum Kind: Equatable, Sendable {
    /// The request itself was malformed or empty; the user can fix the input.
    case invalidInput
    /// The vault does not allow this operation.
    case denied
    /// The feature, network or provider is switched off or unreachable in this build.
    case unavailable
    /// The target no longer exists.
    case missing
    /// The name or key is already taken.
    case conflict
    /// A prepared operation expired or was superseded; prepare again.
    case stale
    /// The administrative password (or a fresh spend authorization) is required.
    case reauthRequired
    /// The session behind the call is gone; the model must drop everything.
    case revoked
    /// A code this table does not classify; the model may match `code` itself.
    case unknown
  }

  public let code: String?
  public let kind: Kind

  public init(code: String?) {
    self.code = code
    kind = Self.kind(of: code)
  }

  static func kind(of code: String?) -> Kind {
    switch code {
    case "INVALID_INPUT", "EMPTY_PAYLOAD", "INVALID_PATH": .invalidInput
    case "ACCESS_DENIED": .denied
    case "WALLET_DISABLED", "UNSUPPORTED_CHAIN", "UNSUPPORTED_ACCOUNT_MODEL",
      "PROVIDER_UNAVAILABLE", "UNSUPPORTED_ASSET", "UNSUPPORTED_PROVIDER_SURFACE":
      .unavailable
    case "NODE_NOT_FOUND": .missing
    case "NAME_EXIST": .conflict
    case "PREPARATION_STALE", "PREPARATION_EXPIRED", "PREPARATION_NOT_FOUND": .stale
    case "EXPORT_REAUTH_FAILED", "CONFIRM_REQUIRED": .reauthRequired
    case "VAULT_REQUIRED", "SESSION_REVOKED": .revoked
    default: .unknown
    }
  }
}

extension Error {
  /// The Core failure behind this error, or nil for transport, cancellation and Swift errors.
  public var coreFailure: CoreFailure? {
    guard let failure = self as? RPCFailure else { return nil }
    return CoreFailure(code: failure.code)
  }

  /// Convenience for the common `switch` on the kind; nil when the error is not from Core.
  public var coreFailureKind: CoreFailure.Kind? { coreFailure?.kind }

  /// The value did not fit one bridge reply: too large to read or write on this device, not a
  /// failure the user can retry away.
  public var isPayloadTooLarge: Bool {
    guard let bridge = self as? BridgeError else { return false }
    if case .PayloadTooLarge = bridge { return true }
    return false
  }
}
