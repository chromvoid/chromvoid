import Foundation

public struct FixtureReport: Sendable {
  public let protocolVersion: UInt8
  public let initiallyLocked: Bool
  public let entryCount: Int
  public let folderCount: Int
  public let lockedAfterProbe: Bool
}

/// A development probe. The Rust constructor rejects this in ordinary builds.
/// It never accepts a storage path, real credentials or a Keychain configuration.
public actor FixtureProbe {
  public init() {}

  public func run() throws -> FixtureReport {
    let info = try checkBridge(expectedFingerprint: BuildFingerprint.expected)
    let harness = try FixtureHarness(expectedFingerprint: BuildFingerprint.expected)
    defer { _ = try? harness.execute(request: request("vault:lock")) }
    let initial: VaultStatusResponse = try decode(harness, command: "vault:status")
    _ = try harness.execute(
      request: request("vault:unlock", data: ["password": "air-synthetic-fixture"]))
    let list: PassmanagerEntryListResponse = try decode(harness, command: "passmanager:entry:list")
    _ = try harness.execute(request: request("vault:lock"))
    let final: VaultStatusResponse = try decode(harness, command: "vault:status")
    return FixtureReport(
      protocolVersion: info.protocolVersion,
      initiallyLocked: !initial.isUnlocked,
      entryCount: list.entries.count,
      folderCount: list.folders.count,
      lockedAfterProbe: !final.isUnlocked)
  }

  private func request(_ command: String, data: [String: String] = [:]) throws -> Data {
    try JSONSerialization.data(withJSONObject: ["v": 1, "command": command, "data": data])
  }

  private func decode<T: Decodable>(_ harness: FixtureHarness, command: String) throws -> T {
    let reply = try harness.execute(request: request(command))
    return try JSONDecoder().decode(RPCResult<T>.self, from: reply).value
  }
}
