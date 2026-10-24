import Foundation

/// Presentation admission and actor isolation; Rust owns trust, protocol and host lifetime.
@MainActor
public protocol HostStore: AnyObject {
  func hostSnapshot() throws -> AirHostSnapshot
  func hostEvents(after sequence: UInt64) async throws -> AirHostSnapshot
  func hostPreferences() async throws -> AirHostPreferences
  func trustedHostPeers() async throws -> [AirHostPeer]
  func startHost(generation: UInt64, relayURL: String, deviceLabel: String) throws
    -> AirHostSnapshot
  func pairHost(generation: UInt64, relayURL: String, deviceLabel: String) throws -> AirHostSnapshot
  func resumeHost(generation: UInt64, deviceLabel: String) async throws -> AirHostSnapshot
  func stopHost() throws -> AirHostSnapshot
  func revokeHostPeer(id: String) async throws
}

extension RuntimeClient: HostStore {
  public func hostSnapshot() throws -> AirHostSnapshot { try host().snapshot() }
  public func hostEvents(after sequence: UInt64) async throws -> AirHostSnapshot {
    try await host().events(afterSequence: sequence)
  }
  public func hostPreferences() async throws -> AirHostPreferences {
    try await host().preferences()
  }
  public func trustedHostPeers() async throws -> [AirHostPeer] { try await host().trustedPeers() }
  public func startHost(generation: UInt64, relayURL: String, deviceLabel: String) throws
    -> AirHostSnapshot
  {
    try host().startListening(generation: generation, relayUrl: relayURL, deviceLabel: deviceLabel)
  }
  public func pairHost(generation: UInt64, relayURL: String, deviceLabel: String) throws
    -> AirHostSnapshot
  {
    try host().startPairing(generation: generation, relayUrl: relayURL, deviceLabel: deviceLabel)
  }
  public func resumeHost(generation: UInt64, deviceLabel: String) async throws -> AirHostSnapshot {
    try await host().resumeIfEnabled(generation: generation, deviceLabel: deviceLabel)
  }
  public func stopHost() throws -> AirHostSnapshot { try host().stop() }
  public func revokeHostPeer(id: String) async throws { try await host().revokePeer(peerId: id) }
}
