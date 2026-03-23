import AuthenticationServices
import XCTest
@testable import chromvoid_iOS

final class MockCredentialIdentityStore: CredentialIdentityStoreSyncing {
    private(set) var saveCalls: [[ASPasswordCredentialIdentity]] = []
    private(set) var removeCalls: [[ASPasswordCredentialIdentity]] = []
    private(set) var replaceCalls: [[ASPasswordCredentialIdentity]] = []

    func saveCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        saveCalls.append(credentialIdentities)
        completion(true, nil)
    }

    func removeCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        removeCalls.append(credentialIdentities)
        completion(true, nil)
    }

    func replaceCredentialIdentities(with credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        replaceCalls.append(credentialIdentities)
        completion(true, nil)
    }
}

final class FailingSaveCredentialIdentityStore: CredentialIdentityStoreSyncing {
    private(set) var removeCallCount = 0

    func saveCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        let error = NSError(domain: "CredentialIdentitySync", code: 1, userInfo: [NSLocalizedDescriptionKey: "save_failed"])
        completion(false, error)
    }

    func removeCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        removeCallCount += 1
        completion(true, nil)
    }

    func replaceCredentialIdentities(with credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        completion(true, nil)
    }
}

final class ChromVoidIntegrationTests: XCTestCase {
    private func requireRelayUrl() throws -> String {
        guard let relay = ProcessInfo.processInfo.environment["CHROMVOID_TEST_RELAY_URL"], !relay.isEmpty else {
            throw XCTSkip("CHROMVOID_TEST_RELAY_URL is not set")
        }
        return relay
    }

    func testTransportModeEnvIsSupported() {
        let mode = ProcessInfo.processInfo.environment["CHROMVOID_TEST_TRANSPORT_MODE"] ?? ""
        XCTAssertTrue(
            ["webrtc", "wss-fallback"].contains(mode),
            "Expected CHROMVOID_TEST_TRANSPORT_MODE to be 'webrtc' or 'wss-fallback', got '\(mode)'"
        )
    }

    func testRelayHealthEndpointIsReachable() async throws {
        let relayWsUrl = try requireRelayUrl()
        let healthUrlString = relayWsUrl
            .replacingOccurrences(of: "wss://", with: "https://")
            .replacingOccurrences(of: "ws://", with: "http://") + "/health"

        guard let healthUrl = URL(string: healthUrlString) else {
            XCTFail("Invalid relay URL: \(healthUrlString)")
            return
        }

        let (data, response) = try await URLSession.shared.data(from: healthUrl)
        let http = response as? HTTPURLResponse
        XCTAssertEqual(http?.statusCode, 200)
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "ok")
    }

    func testIdentitySyncIncrementalSavePath() {
        let store = MockCredentialIdentityStore()
        let adapter = CredentialIdentitySyncAdapter(store: store)

        adapter.sync(
            mode: .incremental,
            save: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r1")],
            remove: [],
            completion: { _, _ in }
        )

        XCTAssertEqual(store.saveCalls.count, 1)
        XCTAssertEqual(store.removeCalls.count, 0)
        XCTAssertEqual(store.replaceCalls.count, 0)
    }

    func testIdentitySyncIncrementalRemovePath() {
        let store = MockCredentialIdentityStore()
        let adapter = CredentialIdentitySyncAdapter(store: store)

        adapter.sync(
            mode: .incremental,
            save: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r1")],
            remove: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r2")],
            completion: { _, _ in }
        )

        XCTAssertEqual(store.saveCalls.count, 1)
        XCTAssertEqual(store.removeCalls.count, 1)
        XCTAssertEqual(store.replaceCalls.count, 0)
    }

    func testIdentitySyncReplacePath() {
        let store = MockCredentialIdentityStore()
        let adapter = CredentialIdentitySyncAdapter(store: store)

        adapter.sync(
            mode: .replace,
            save: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r1")],
            remove: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r2")],
            completion: { _, _ in }
        )

        XCTAssertEqual(store.saveCalls.count, 0)
        XCTAssertEqual(store.removeCalls.count, 0)
        XCTAssertEqual(store.replaceCalls.count, 1)
    }

    func testIdentitySyncIncrementalSaveFailureSkipsRemove() {
        let store = FailingSaveCredentialIdentityStore()
        let adapter = CredentialIdentitySyncAdapter(store: store)

        adapter.sync(
            mode: .incremental,
            save: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r1")],
            remove: [CredentialIdentityRecord(serviceIdentifier: "example.com", user: "alice", recordIdentifier: "r2")],
            completion: { success, error in
                XCTAssertFalse(success)
                XCTAssertNotNil(error)
            }
        )

        XCTAssertEqual(store.removeCallCount, 0)
    }

    func testCredentialRpcEnvelopeContainsOnlyBridgeFields() {
        let envelope = CredentialIPCBridge.buildRPCRequestEnvelopeForTesting(
            requestID: "req-42",
            command: "credential_provider:list",
            data: ["context": ["kind": "web", "domain": "example.com", "origin": "https://example.com"]]
        )

        XCTAssertEqual(envelope["request_id"] as? String, "req-42")
        XCTAssertEqual(envelope["command"] as? String, "credential_provider:list")
        XCTAssertNotNil(envelope["data"] as? [String: Any])
        XCTAssertNil(envelope["platform"])
        XCTAssertNil(envelope["platform_version_major"])
        XCTAssertNil(envelope["payload"])
    }

    func testAdapterMetadataSanitizationRemovesSecretFields() {
        let sanitized = CredentialIPCBridge.sanitizeAdapterMetadataForTesting([
            "rp_id": "example.com",
            "password": "secret",
            "nested": [
                "token": "sensitive",
                "allowed": "value",
            ],
        ]) as? [String: Any]

        XCTAssertEqual(sanitized?["rp_id"] as? String, "example.com")
        XCTAssertNil(sanitized?["password"])
        let nested = sanitized?["nested"] as? [String: Any]
        XCTAssertEqual(nested?["allowed"] as? String, "value")
        XCTAssertNil(nested?["token"])
    }
}
