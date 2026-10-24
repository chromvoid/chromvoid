import Foundation

/// Core's response envelope is shared across generated payload types.
public struct RPCResult<Payload: Decodable>: Decodable {
  public let value: Payload

  private enum CodingKeys: String, CodingKey { case ok, result, code }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    guard try container.decode(Bool.self, forKey: .ok) else {
      throw RPCFailure(code: try container.decodeIfPresent(String.self, forKey: .code))
    }
    value = try container.decode(Payload.self, forKey: .result)
  }
}

public struct RPCFailure: Error, Sendable {
  public let code: String?
}
