import AirProviderTransport
import ChromVoidBridge
import Foundation
import XCTest

@testable import AirCredentialProvider

final class ProviderClientTests: XCTestCase {
  @MainActor
  func testRealCorePasswordSelectionAndPasskeyVerification() async throws {
    #if AIR_FIXTURE
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir"
      ).path
      let runtime = try await Task.detached {
        try openProviderTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
      }.value
      let host = RuntimeClient(runtime: runtime)
      defer { _ = try? host.close() }
      _ = try host.activate()
      if !(try host.snapshot().masterConfigured) {
        try await host.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await host.unlock(password: "air-extension-" + UUID().uuidString)
      let generation = try host.snapshot().generation
      let urls = try JSONDecoder().decode(
        ChromVoidBridge.JSONAny.self,
        from: Data(#"[{"value":"https://example.test","match":"host"}]"#.utf8))
      _ = try await host.createCredential(
        PassmanagerEntryCreateRequest(
          createdTs: nil, entryID: "extension-login", entryType: "login", groupPath: nil,
          iconRef: nil,
          otps: nil, paymentCard: nil,
          secrets: PassmanagerEntryCreateSecrets(
            cardCvv: nil, cardPan: nil, note: nil, password: "synthetic-password"),
          tagKeys: nil, tags: nil, title: "Synthetic account", updatedTs: nil, urls: urls,
          username: "alice"), generation: generation)
      let name = try XCTUnwrap(ProviderHostConfiguration.serviceName())
      let transport = ProviderMessagePortClient(serviceName: name)
      var verifications = 0
      let client = ProviderClient(
        send: { try await transport.request($0) }, verifyUser: { verifications += 1 })
      let context = try ProviderServiceContext(identifier: "https://example.test/login")
      let matches = try await client.matches(services: [
        "example.test", "https://example.test/login",
      ])
      XCTAssertEqual(matches.map(\.candidate.credentialID), ["extension-login"])
      let browsing = try await client.matches(services: [])
      XCTAssertEqual(browsing.map(\.candidate.credentialID), ["extension-login"])
      let secret = try await client.password(id: "extension-login", context: context)
      XCTAssertEqual(secret.username, "alice")
      XCTAssertEqual(secret.password, "synthetic-password")
      do {
        _ = try await client.password(
          id: "extension-login", context: ProviderServiceContext(identifier: "unrelated.test"))
        XCTFail("A different service must not receive the password")
      } catch let error as ProviderFailure { XCTAssertEqual(error.code, "NO_MATCH") }
      do {
        _ = try await client.oneTimeCode(id: "extension-login", otpID: "missing", context: context)
        XCTFail("Core's unavailable iOS code capability must be preserved")
      } catch let error as ProviderFailure {
        XCTAssertEqual(error.code, "FEATURE_UNSUPPORTED_ON_PLATFORM")
      }

      let input = ProviderPasskeyInput(
        relyingParty: "example.test", clientDataHash: Data(repeating: 7, count: 32),
        allowedCredentialIDs: [])
      let denied = ProviderClient(
        send: { try await transport.request($0) }, verifyUser: { throw CancellationError() })
      do {
        _ = try await denied.registerPasskey(
          input, userName: "alice", userHandle: Data([1, 2, 3]), algorithms: [-7])
        XCTFail("Denied user verification must not create a passkey")
      } catch is CancellationError {}
      let before = try await host.listPasskeys(generation: generation)
      XCTAssertTrue(before.passkeys.isEmpty)
      let created = try await client.registerPasskey(
        input, userName: "alice", userHandle: Data([1, 2, 3]), algorithms: [-7])
      XCTAssertFalse(try Data(providerBase64: created.response.attestationObject).isEmpty)
      let keys = try await client.passkeys(input)
      XCTAssertEqual(keys.map(\.credentialIDB64URL), [created.credentialIdB64Url])
      let assertion = try await client.assertPasskey(
        input, credentialID: Data(providerBase64: created.credentialIdB64Url))
      XCTAssertFalse(try Data(providerBase64: assertion.response.signature).isEmpty)
      XCTAssertEqual(verifications, 2)
      _ = try host.deactivate()
      do {
        _ = try await client.password(id: "extension-login", context: context)
        XCTFail("The extension adapter must not bypass background revocation")
      } catch ProviderTransportError.unavailable {}
    #else
      throw XCTSkip("The provider test runtime is restricted to the fixture test host")
    #endif
  }

  @MainActor
  func testCorrelationAndCoreErrorsAreNotAcceptedAsSuccess() async throws {
    struct Result: Decodable { let value: Int }
    let mismatch = ProviderClient { _ in
      Data(#"{"request_id":"wrong","success":true,"result":{"value":1}}"#.utf8)
    }
    do {
      let _: Result = try await mismatch.call("credential_provider:status")
      XCTFail("Reply correlation is mandatory")
    } catch ProviderTransportError.invalidMessage {}
    let denied = ProviderClient { data in
      let request = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
      return try JSONSerialization.data(withJSONObject: [
        "request_id": try XCTUnwrap(request["request_id"]), "success": false,
        "error_code": "VAULT_REQUIRED",
      ])
    }
    do {
      let _: Result = try await denied.call("credential_provider:status")
      XCTFail("Core error must be retained")
    } catch let error as ProviderFailure { XCTAssertEqual(error.code, "VAULT_REQUIRED") }
  }

  func testServiceMappingRetainsTheActualOrigin() throws {
    let context = try ProviderServiceContext(identifier: "http://example.test:8080/login?from=app")
    XCTAssertEqual(context.domain, "example.test")
    XCTAssertEqual(context.origin, "http://example.test:8080")
    XCTAssertThrowsError(try ProviderServiceContext(identifier: "file:///private/example"))
    XCTAssertThrowsError(
      try ProviderServiceContext(identifier: "https://user:password@example.test"))
  }
}
