import AirProviderTransport
import Foundation

/// Credential-provider transport: the Mach port for the AutoFill extension and passkeys.
extension RuntimeClient {
  public var providerIdentityState: ProviderIdentityState {
    providerIdentities?.state ?? .unavailable
  }

  func settleProviderIdentities() async { await providerIdentities?.settled() }

  public func autoFillStatus(generation: UInt64) async throws -> AutoFillStatus {
    let request = try JSONEncoder().encode(
      CommandRequest(v: 1, command: "credential_provider:status", data: [String: String]()))
    let response = try await performProviderRequest(request, generation: generation)
    let status = try JSONDecoder().decode(
      RPCResult<CredentialProviderStatusResponse>.self, from: response
    ).value
    refreshProviderIdentities()
    await providerIdentities?.settled()
    let enabled = await providerIdentities?.systemEnabled()
    try Task.checkCancellation()
    let current = try runtime.snapshot()
    guard current.generation == generation, !current.cleanupPending,
      current.phase == .locked || current.phase == .unlocked
    else { throw BridgeError.SessionRevoked }
    return AutoFillStatus(
      systemEnabled: enabled, core: status, identities: providerIdentityState,
      access: providerIdentities?.access ?? .unknown)
  }

  func stopProviderServer() {
    providerIdentities?.clear()
    providerServer?.stop()
    providerServer = nil
  }

  func startProviderServer() {
    guard let snapshot = try? runtime.snapshot(),
      snapshot.phase == .locked || snapshot.phase == .unlocked,
      !snapshot.cleanupPending
    else {
      stopProviderServer()
      return
    }
    guard providerServer == nil, let name = ProviderHostConfiguration.serviceName() else { return }
    providerServer = try? ProviderMessagePortServer(serviceName: name) { [weak self] payload in
      guard let self else { throw ProviderTransportError.unavailable }
      return try await self.handleProviderMessage(payload)
    }
  }

  func refreshProviderIdentities() {
    guard let snapshot = try? runtime.snapshot(), snapshot.phase == .unlocked,
      !snapshot.cleanupPending
    else {
      providerIdentities?.clear()
      return
    }
    providerIdentities?.refresh { [weak self] in
      guard let self else { throw CancellationError() }
      let request = try JSONEncoder().encode(
        CommandRequest(v: 1, command: "credential_provider:search", data: ["query": ""]))
      let response = try await performProviderRequest(request, generation: snapshot.generation)
      // Preserve Core denial codes before the Rust metadata projection discards the envelope.
      _ = try JSONDecoder().decode(RPCResult<EmptyResult>.self, from: response)
      return try applePasswordIdentities(response: response)
    }
  }

  func handleProviderMessage(_ payload: Data) async throws -> Data {
    let message = try decodeAppleProviderRequest(payload: payload)
    let generation = try runtime.snapshot().generation
    let reply = try await performProviderRequest(message.request, generation: generation)
    return try encodeAppleProviderResponse(identifier: message.identifier, response: reply)
  }

  /// Host-side provider transport only. The reply may contain a secret or a session
  /// identifier and must remain transient until delivered through the secure carrier.
  public func performProviderRequest(_ request: Data, generation: UInt64) async throws -> Data {
    let phase = try runtime.snapshot().phase
    guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
    return try await execute(phase: phase, generation: generation) { requestID, generation in
      try self.runtime.beginProviderExecute(
        requestId: requestID, generation: generation, request: request)
    }
  }

  public func listPasskeys(generation: UInt64) async throws -> VaultPasskeysListResponse {
    try await perform(
      "passkeys:list", data: [String: String](), phase: .unlocked, generation: generation)
  }

  public func deletePasskey(_ request: VaultPasskeyDeleteRequest, generation: UInt64) async throws
    -> VaultPasskeyDeleteResponse
  {
    try await perform("passkeys:delete", data: request, phase: .unlocked, generation: generation)
  }
}
