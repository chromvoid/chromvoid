import ChromVoidBridge
import Foundation
import XCTest

final class NativeProviderTests: XCTestCase {
  @MainActor
  func testProviderSharesTheHostSessionAndRevokesAfterLock() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    let initial = try client.snapshot()
    let locked = try await client.performProviderRequest(
      request("credential_provider:status"), generation: initial.generation)
    XCTAssertEqual(try result(locked)["vault_open"] as? Bool, false)
    let unavailable = try await client.performProviderRequest(
      request("credential_provider:session:open"), generation: initial.generation)
    XCTAssertEqual(try envelope(unavailable)["code"] as? String, "VAULT_REQUIRED")
    do {
      _ = try await client.performProviderRequest(
        request("vault:unlock"), generation: initial.generation)
      XCTFail("Provider must not unlock the host")
    } catch {
      guard case BridgeError.CapabilityUnavailable = error else {
        return XCTFail("Unexpected provider admission error: \(type(of: error))")
      }
    }
    if !initial.masterConfigured {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-provider-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let opened = try await client.performProviderRequest(
      request("credential_provider:session:open"), generation: generation)
    let token = try XCTUnwrap(try result(opened)["provider_session"] as? String)
    XCTAssertFalse(token.isEmpty)
    let page = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertTrue(page.entries.isEmpty)
    _ = try client.lock()
    do {
      _ = try await client.performProviderRequest(
        request("credential_provider:session:close", data: ["provider_session": token]),
        generation: generation)
      XCTFail("Old provider authority must be revoked with the host session")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Unexpected revocation error: \(type(of: error))")
      }
    }
  }

  private func request(_ command: String, data: [String: String] = [:]) throws -> Data {
    try JSONSerialization.data(withJSONObject: ["v": 1, "command": command, "data": data])
  }

  private func envelope(_ data: Data) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private func result(_ data: Data) throws -> [String: Any] {
    try XCTUnwrap(try envelope(data)["result"] as? [String: Any])
  }
}
