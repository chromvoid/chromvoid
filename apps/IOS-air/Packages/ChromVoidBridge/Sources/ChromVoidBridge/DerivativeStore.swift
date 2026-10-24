import Foundation

public enum DerivativeTier: String, Sendable {
  /// Up to 1920 px on the long edge, for viewing.
  case preview
  /// Up to 256 px, for lists.
  case thumbnail
}

/// Core's stream metadata for one derivative body.
public struct DerivativeStreamMeta: Decodable, Sendable {
  public let name: String
  public let mimeType: String
  public let size: UInt64
  enum CodingKeys: String, CodingKey {
    case name
    case mimeType = "type"
    case size
  }
}

public struct DerivativeBytes {
  public let name: String
  public let mimeType: String
  public var bytes: Data
  public init(name: String, mimeType: String, bytes: Data) {
    self.name = name
    self.mimeType = mimeType
    self.bytes = bytes
  }
}

/// Vault-encrypted image derivatives. `ensure` converts and stores a missing one on the Core
/// worker; a plain read of a missing derivative fails with Core's `NODE_NOT_FOUND` reply.
@MainActor
public protocol DerivativeStore: AnyObject {
  var derivativeLimitBytes: UInt64 { get }
  func derivative(
    nodeID: UInt64, sourceRevision: UInt64, tier: DerivativeTier, ensure: Bool,
    generation: UInt64
  ) async throws -> DerivativeBytes
}

extension RuntimeClient: DerivativeStore {
  public var derivativeLimitBytes: UInt64 { runtime.derivativeLimitBytes() }

  public func derivative(
    nodeID: UInt64, sourceRevision: UInt64, tier: DerivativeTier, ensure: Bool,
    generation: UInt64
  ) async throws -> DerivativeBytes {
    var handle: AirDerivative?
    let meta: DerivativeStreamMeta = try await performExecution(
      phase: .unlocked, generation: generation
    ) { id, generation in
      let derivative = try runtime.beginDerivative(
        requestId: id, generation: generation, nodeId: nodeID, sourceVersion: sourceRevision,
        tier: tier.rawValue, ensure: ensure)
      handle = derivative
      return derivative
    }
    guard let handle else { throw BridgeError.InvalidDerivativeState }
    try Task.checkCancellation()
    // takeBytes checks Rust authority again; no suspension between consume and return.
    return DerivativeBytes(name: meta.name, mimeType: meta.mimeType, bytes: try handle.takeBytes())
  }
}
