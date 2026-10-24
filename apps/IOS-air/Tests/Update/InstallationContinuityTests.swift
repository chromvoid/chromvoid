import ChromVoidBridge
import Foundation
import Security
import XCTest

// This target is run only by verify-install-update.sh, across three app installations.
final class InstallationContinuityTests: XCTestCase {
  private enum FixtureError: Error { case invalidHost }
  private struct KeychainStamp: Codable, Equatable {
    let accessGroup: String
    let createdAt: Date
  }
  private struct Receipt: Codable {
    let initialBuild: Int
    let initialHome: String
    let entryID: String
    let key: KeychainStamp
    var updated: Bool
  }
  private let vaultPassword = "public synthetic installation continuity vault"
  private let title = "Installation continuity fixture"
  private var receiptURL: URL {
    URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
      .appendingPathComponent("Library/AirUpdateVerification.json")
  }

  @MainActor
  func testPrepareForUpdate() async throws {
    XCTAssertFalse(FileManager.default.fileExists(atPath: receiptURL.path))
    // Do not replace an unfinished previous run's receipt or records.
    guard !FileManager.default.fileExists(atPath: receiptURL.path) else { return }
    let client = try await open()
    let generation = try client.snapshot().generation
    let entryID = UUID().uuidString
    let request = PassmanagerEntryCreateRequest(
      createdTs: nil, entryID: entryID, entryType: "login", groupPath: nil,
      iconRef: nil, otps: nil, paymentCard: nil,
      secrets: PassmanagerEntryCreateSecrets(
        cardCvv: nil, cardPan: nil, note: nil, password: "synthetic before update"),
      tagKeys: nil, tags: nil, title: title, updatedTs: nil, urls: nil, username: nil)
    _ = try await client.createCredential(request, generation: generation)
    try await verify(client, entryID: entryID, secret: "synthetic before update")
    let receipt = Receipt(
      initialBuild: try buildNumber(), initialHome: NSHomeDirectory(), entryID: entryID,
      key: try keychainStamp(), updated: false)
    try await close(client)
    try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
    try report("prepare", receipt: receipt)
  }

  @MainActor
  func testReadAndWriteAfterUpdate() async throws {
    var receipt = try JSONDecoder().decode(Receipt.self, from: Data(contentsOf: receiptURL))
    XCTAssertEqual(try buildNumber(), receipt.initialBuild + 1)
    XCTAssertFalse(receipt.updated)
    let client = try await open()
    XCTAssertEqual(try keychainStamp(), receipt.key)
    try await verify(client, entryID: receipt.entryID, secret: "synthetic before update")
    try await client.saveCredentialSecret(
      id: receipt.entryID, type: "password", value: "synthetic after update",
      generation: try client.snapshot().generation)
    try await close(client)
    receipt.updated = true
    try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
    try report("update", receipt: receipt)
  }

  @MainActor
  func testReadAfterRollbackAndRemoveFixture() async throws {
    let receipt = try JSONDecoder().decode(Receipt.self, from: Data(contentsOf: receiptURL))
    XCTAssertEqual(try buildNumber(), receipt.initialBuild)
    XCTAssertTrue(receipt.updated)
    let client = try await open()
    XCTAssertEqual(try keychainStamp(), receipt.key)
    try await verify(client, entryID: receipt.entryID, secret: "synthetic after update")
    try await client.deleteCredential(
      id: receipt.entryID, generation: try client.snapshot().generation)
    try await close(client)
    try report("rollback", receipt: receipt)
    try FileManager.default.removeItem(at: receiptURL)
  }

  @MainActor
  private func open() async throws -> RuntimeClient {
    guard Bundle.main.bundleIdentifier == "com.chromvoid.iosair.dev.bridge-host.fixture",
      ProcessInfo.processInfo.environment["CHROMVOID_TEST_INMEMORY_KEYSTORE"] == nil
    else { throw FixtureError.invalidHost }
    let client = try await RuntimeClient.open()
    addTeardownBlock { @MainActor in try await self.close(client) }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: vaultPassword)
    return client
  }

  @MainActor
  private func verify(_ client: RuntimeClient, entryID: String, secret: String) async throws {
    let generation = try client.snapshot().generation
    let detail = try await client.credentialDetail(id: entryID, generation: generation)
    XCTAssertEqual(detail.id, entryID)
    XCTAssertEqual(detail.title, title)
    let stored = try await client.readCredentialSecret(
      id: entryID, type: "password", generation: generation)
    XCTAssertEqual(stored, secret)
  }

  @MainActor
  private func close(_ client: RuntimeClient) async throws {
    var snapshot = try client.close()
    while snapshot.cleanupPending {
      snapshot = try await client.events(after: snapshot.sequence).snapshot
    }
  }

  private func buildNumber() throws -> Int {
    let value = try XCTUnwrap(
      Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
    return try XCTUnwrap(Int(value))
  }

  private func keychainStamp() throws -> KeychainStamp {
    var attributes: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: "com.chromvoid.storage-pepper",
        kSecAttrAccount: "primary:v1",
        kSecReturnAttributes: true,
        kSecMatchLimit: kSecMatchLimitOne,
      ] as CFDictionary, &attributes)
    XCTAssertEqual(status, errSecSuccess)
    let values = try XCTUnwrap(attributes as? [String: Any])
    let group = try XCTUnwrap(values[kSecAttrAccessGroup as String] as? String)
    let bundle = try XCTUnwrap(Bundle.main.bundleIdentifier)
    XCTAssertTrue(group.hasSuffix("." + bundle))
    return KeychainStamp(
      accessGroup: group,
      createdAt: try XCTUnwrap(values[kSecAttrCreationDate as String] as? Date))
  }

  private func report(_ phase: String, receipt: Receipt) throws {
    let data = try JSONSerialization.data(
      withJSONObject: [
        "phase": phase, "build": try buildNumber(),
        "containerChanged": NSHomeDirectory() != receipt.initialHome,
        "privateKeychainGroup": receipt.key.accessGroup,
        "entryID": receipt.entryID,
      ], options: .sortedKeys)
    print("AIR_INSTALL_EVIDENCE " + String(decoding: data, as: UTF8.self))
  }
}
