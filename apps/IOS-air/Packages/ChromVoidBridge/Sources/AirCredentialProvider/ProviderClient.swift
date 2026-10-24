import AirProviderTransport
import Foundation

public struct ProviderFailure: Error, Sendable {
  public let code: String
  public init(_ code: String) { self.code = code }
}

private struct ProviderEnvelope<Result: Decodable>: Decodable {
  let requestID: String
  let success: Bool
  let result: Result?
  let errorCode: String?
  enum CodingKeys: String, CodingKey {
    case requestID = "request_id"
    case success, result
    case errorCode = "error_code"
  }
}

private struct CandidateList: Decodable { let candidates: [CredentialCandidate] }
private struct EmptyResult: Decodable {}

/// Apple wire adapter only. Core owns matching, policy and one-shot session authority.
@MainActor
public final class ProviderClient {
  private let send: @Sendable (Data) async throws -> Data

  let verifyUser: @MainActor () async throws -> Void

  public init(send: @escaping @Sendable (Data) async throws -> Data) {
    self.send = send
    verifyUser = { try await ProviderUserVerification().verify() }
  }

  init(
    send: @escaping @Sendable (Data) async throws -> Data,
    verifyUser: @escaping @MainActor () async throws -> Void
  ) {
    self.send = send
    self.verifyUser = verifyUser
  }

  public convenience init(serviceName: String) {
    let transport = ProviderMessagePortClient(serviceName: serviceName)
    self.init { try await transport.request($0) }
  }

  public func call<Result: Decodable>(_ command: String, data: [String: Any] = [:]) async throws
    -> Result
  {
    try Task.checkCancellation()
    let identifier = UUID().uuidString
    let request = try JSONSerialization.data(withJSONObject: [
      "request_id": identifier, "command": command, "data": data,
    ])
    let response = try await send(request)
    try Task.checkCancellation()
    let envelope = try JSONDecoder().decode(ProviderEnvelope<Result>.self, from: response)
    guard envelope.requestID == identifier else { throw ProviderTransportError.invalidMessage }
    guard envelope.success else {
      throw ProviderFailure(envelope.errorCode ?? "PROVIDER_UNAVAILABLE")
    }
    guard let result = envelope.result else { throw ProviderTransportError.invalidMessage }
    return result
  }

  public func readiness() async throws -> CredentialProviderStatusResponse {
    let status: CredentialProviderStatusResponse = try await call("credential_provider:status")
    guard status.enabled else { throw ProviderFailure("PROVIDER_DISABLED") }
    guard status.vaultOpen else { throw ProviderFailure("VAULT_REQUIRED") }
    return status
  }

  public func candidates(context: ProviderServiceContext) async throws -> [CredentialCandidate] {
    let result: CandidateList = try await call(
      "credential_provider:list", data: ["context": context.payload])
    return result.candidates
  }

  func matches(services: [String]) async throws -> [ProviderMatch] {
    var matches: [ProviderMatch] = []
    var seen = Set<String>()
    if services.isEmpty {
      let result: CandidateList = try await call("credential_provider:search", data: ["query": ""])
      for candidate in result.candidates {
        guard let domain = candidate.domain,
          let context = try? ProviderServiceContext(identifier: domain)
        else { continue }
        matches.append(ProviderMatch(candidate: candidate, context: context))
      }
    } else {
      for service in services {
        let context = try ProviderServiceContext(identifier: service)
        for candidate in try await candidates(context: context)
        where seen.insert(candidate.credentialID).inserted {
          matches.append(ProviderMatch(candidate: candidate, context: context))
        }
      }
    }
    return matches
  }

  public func password(id: String, context: ProviderServiceContext) async throws -> CredentialSecret
  {
    _ = try await readiness()
    let matches = try await candidates(context: context)
    guard matches.contains(where: { $0.credentialID == id }) else {
      throw ProviderFailure("NO_MATCH")
    }
    return try await withSession { token in
      try await self.call(
        "credential_provider:getSecret",
        data: [
          "provider_session": token, "credential_id": id, "context": context.payload,
        ])
    }
  }

  public func oneTimeCode(id: String, otpID: String, context: ProviderServiceContext) async throws
    -> CredentialOneTimeCode
  {
    let status = try await readiness()
    guard status.capabilityMatrix.ios.oneTimeCodes else {
      throw ProviderFailure("FEATURE_UNSUPPORTED_ON_PLATFORM")
    }
    let matches = try await candidates(context: context)
    guard matches.contains(where: { $0.credentialID == id }) else {
      throw ProviderFailure("NO_MATCH")
    }
    return try await withSession { token in
      try await self.call(
        "credential_provider:getOneTimeCode",
        data: [
          "provider_session": token, "credential_id": id, "otp_id": otpID,
          "context": context.payload,
        ])
    }
  }

  private func withSession<Result>(_ operation: (String) async throws -> Result) async throws
    -> Result
  {
    let session: CredentialProviderSessionResponse = try await call(
      "credential_provider:session:open")
    defer {
      // Independent, bounded cleanup can run after caller cancellation. Never retries a secret/write.
      Task { @MainActor in
        let _: EmptyResult? = try? await call(
          "credential_provider:session:close",
          data: [
            "provider_session": session.providerSession
          ])
      }
    }
    try Task.checkCancellation()
    return try await operation(session.providerSession)
  }
}

/// Maps an Apple service hint to the existing Core web context. It grants no authority.
public struct ProviderServiceContext: Hashable, Sendable {
  public let domain: String
  public let origin: String

  public init(identifier: String) throws {
    let value = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
    let source = value.contains("://") ? value : "https://" + value
    guard let parts = URLComponents(string: source),
      let host = parts.host, !host.isEmpty,
      let scheme = parts.scheme?.lowercased(), ["https", "http"].contains(scheme),
      parts.user == nil, parts.password == nil
    else { throw ProviderFailure("INVALID_CONTEXT") }
    var origin = URLComponents()
    origin.scheme = scheme
    origin.host = host
    origin.port = parts.port
    guard let serialized = origin.string else { throw ProviderFailure("INVALID_CONTEXT") }
    domain = host
    self.origin = serialized
  }

  var payload: [String: Any] { ["kind": "web", "domain": domain, "origin": origin] }
}

struct ProviderMatch {
  let candidate: CredentialCandidate
  let context: ProviderServiceContext
}
