import Foundation

struct ProviderPasskeyInput: Sendable {
  let relyingParty: String
  let clientDataHash: Data
  let allowedCredentialIDs: [Data]

  func payload(credentialID: Data? = nil, verified: Bool = false) -> [String: Any] {
    var data: [String: Any] = [
      "platform": "ios",
      "platform_version_major": ProcessInfo.processInfo.operatingSystemVersion.majorVersion,
      "origin": "https://" + relyingParty, "clientDataHash": clientDataHash.providerBase64,
      "userVerified": verified,
      "request": [
        "rpId": relyingParty, "challenge": clientDataHash.providerBase64,
        "allowCredentials": allowedCredentialIDs.map {
          ["type": "public-key", "id": $0.providerBase64]
        },
      ],
    ]
    if let credentialID { data["credentialIdB64Url"] = credentialID.providerBase64 }
    return data
  }
}

/// Only the Core response fields required to construct Apple's completion objects.
/// WebAuthn validation, generation and signatures remain in Core.
struct ProviderPasskeyResult: Decodable {
  struct Artifacts: Decodable {
    let attestationObject: String?
    let authenticatorData: String?
    let signature: String?
    let userHandle: String?
  }
  let credentialIdB64Url: String
  let response: Artifacts
}

extension ProviderClient {
  func passkeys(_ input: ProviderPasskeyInput) async throws -> [VaultPasskeySummary] {
    let status = try await readiness()
    guard status.capabilityMatrix.ios.passkeysLite else { throw ProviderFailure("UNSUPPORTED") }
    let result: VaultPasskeysListResponse = try await call(
      "credential_provider:passkey:query", data: input.payload())
    return result.passkeys
  }

  func assertPasskey(_ input: ProviderPasskeyInput, credentialID: Data) async throws
    -> ProviderPasskeyResult
  {
    _ = try await passkeys(input)
    try await verifyUser()
    try Task.checkCancellation()
    return try await call(
      "credential_provider:passkey:get",
      data: input.payload(credentialID: credentialID, verified: true))
  }

  func registerPasskey(
    _ input: ProviderPasskeyInput, userName: String, userHandle: Data, algorithms: [Int]
  ) async throws -> ProviderPasskeyResult {
    _ = try await passkeys(input)
    try await verifyUser()
    try Task.checkCancellation()
    var payload = input.payload(verified: true)
    payload["request"] = [
      "rp": ["id": input.relyingParty, "name": input.relyingParty],
      "user": ["id": userHandle.providerBase64, "name": userName, "displayName": userName],
      "challenge": input.clientDataHash.providerBase64,
      "pubKeyCredParams": algorithms.map { ["type": "public-key", "alg": $0] as [String: Any] },
      "attestation": "none",
    ]
    do { return try await call("credential_provider:passkey:create", data: payload) } catch let
      error as ProviderFailure
    { throw error } catch is CancellationError { throw CancellationError() } catch {
      throw ProviderFailure("REGISTRATION_UNCERTAIN")
    }
  }
}

extension Data {
  var providerBase64: String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  init(providerBase64 value: String?) throws {
    guard let value, !value.isEmpty,
      value.utf8.allSatisfy({
        (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45
          || $0 == 95
      })
    else { throw ProviderFailure("INVALID_RESPONSE") }
    var encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(
      of: "_", with: "/")
    encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    guard let data = Data(base64Encoded: encoded) else { throw ProviderFailure("INVALID_RESPONSE") }
    self = data
  }
}
