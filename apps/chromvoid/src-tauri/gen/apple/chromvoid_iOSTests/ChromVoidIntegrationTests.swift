import AuthenticationServices
import XCTest

final class MockCredentialIdentityStore: CredentialIdentityStoreSyncing {
    private(set) var saveCalls: [[ASPasswordCredentialIdentity]] = []
    private(set) var removeCalls: [[ASPasswordCredentialIdentity]] = []
    private(set) var replaceCalls: [[ASPasswordCredentialIdentity]] = []
    private(set) var removeAllCallCount = 0

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

    func removeAllCredentialIdentities(completion: @escaping CredentialIdentitySyncCompletion) {
        removeAllCallCount += 1
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

    func removeAllCredentialIdentities(completion: @escaping CredentialIdentitySyncCompletion) {
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
            "code": "123456",
            "one_time_code": "654321",
            "nested": [
                "token": "sensitive",
                "allowed": "value",
            ],
        ]) as? [String: Any]

        XCTAssertEqual(sanitized?["rp_id"] as? String, "example.com")
        XCTAssertNil(sanitized?["password"])
        XCTAssertNil(sanitized?["code"])
        XCTAssertNil(sanitized?["one_time_code"])
        let nested = sanitized?["nested"] as? [String: Any]
        XCTAssertEqual(nested?["allowed"] as? String, "value")
        XCTAssertNil(nested?["token"])
    }

    func testGetSecretEnvelopeUsesSecretReferenceWithoutPlaintextFields() {
        let envelope = CredentialIPCBridge.secretReferenceResponseForTesting()
        let result = envelope["result"] as? [String: Any]

        XCTAssertEqual(envelope["success"] as? Bool, true)
        XCTAssertNotNil(result?["secret_ref"] as? String)
        XCTAssertFalse(CredentialIPCBridge.containsForbiddenSecretFieldsForTesting(envelope))

        let encoded = try? JSONSerialization.data(withJSONObject: envelope)
        let json = encoded.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        XCTAssertFalse(json.contains("password"))
        XCTAssertFalse(json.contains("otp"))
    }

    func testOneTimeCodeRecordIdentifierDecoderIsVersionedAndFailClosed() {
        let decoded = CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier(
            "cv:otp:v1:Y3JlZDox:dG90cC8x"
        )

        XCTAssertEqual(decoded?.credentialID, "cred:1")
        XCTAssertEqual(decoded?.otpID, "totp/1")
        XCTAssertNil(CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier("cv:otp:v2:YQ:Yg"))
        XCTAssertNil(CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier("cv:otp:v1::Yg"))
        XCTAssertNil(CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier("cv:otp:v1:not+url:Yg"))
        let oversized = CredentialIPCBridge.base64URLEncode(Data(repeating: 7, count: 513))
        XCTAssertNil(CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier("cv:otp:v1:\(oversized):Yg"))
    }

    func testOneTimeCodeFreshnessUsesCoreDeadline() {
        XCTAssertTrue(CredentialIPCBridge.oneTimeCodeResultIsFresh([
            "code": "123456",
            "valid_until_ms": NSNumber(value: 2_000),
        ], nowMilliseconds: 1_999))
        XCTAssertFalse(CredentialIPCBridge.oneTimeCodeResultIsFresh([
            "code": "123456",
            "valid_until_ms": NSNumber(value: 2_000),
        ], nowMilliseconds: 2_000))
        XCTAssertFalse(CredentialIPCBridge.oneTimeCodeResultIsFresh([
            "valid_until_ms": NSNumber(value: 2_000),
        ], nowMilliseconds: 1_999))
    }

    func testPasskeysLiteStatusPayloadMatchesRuntimeGate() {
        let status = CredentialIPCBridge.passkeysLiteStatusPayloadForTesting()

        XCTAssertEqual(status["passkeysLiteAvailable"] as? Bool, CredentialIPCBridge.passkeysLiteReady())
        if CredentialIPCBridge.passkeysLiteReady() {
            XCTAssertTrue(status["passkeysLiteReason"] is NSNull)
        } else {
            XCTAssertEqual(status["passkeysLiteReason"] as? String, CredentialIPCBridge.passkeysLiteUnsupportedReason())
        }
    }

    func testPasskeyRegistrationPayloadMapsToCoreCommandShape() {
        let userHandle = Data("user-1".utf8)
        let clientDataHash = Data(repeating: 7, count: 32)
        let payload = CredentialIPCBridge.passkeyRegistrationPayloadForTesting(
            relyingPartyIdentifier: "example.com",
            userName: "alice@example.com",
            userHandle: userHandle,
            clientDataHash: clientDataHash,
            supportedAlgorithms: [-7]
        )
        let request = payload["request"] as? [String: Any]
        let rp = request?["rp"] as? [String: Any]
        let user = request?["user"] as? [String: Any]
        let params = request?["pubKeyCredParams"] as? [[String: Any]]

        XCTAssertEqual(payload["platform"] as? String, "ios")
        XCTAssertNotNil(payload["platform_version_major"] as? Int)
        XCTAssertEqual(payload["origin"] as? String, "https://example.com")
        XCTAssertEqual(payload["clientDataHash"] as? String, CredentialIPCBridge.base64URLEncode(clientDataHash))
        XCTAssertEqual(payload["userVerified"] as? Bool, true)
        XCTAssertEqual(rp?["id"] as? String, "example.com")
        XCTAssertEqual(user?["name"] as? String, "alice@example.com")
        XCTAssertEqual(user?["id"] as? String, CredentialIPCBridge.base64URLEncode(userHandle))
        XCTAssertNil(request?["origin"])
        XCTAssertNil(request?["clientDataHash"])
        XCTAssertEqual(params?.first?["alg"] as? Int, -7)
    }

    func testPasskeyAssertionPayloadMapsSelectedCredentialAndAllowedList() {
        let credentialID = Data([1, 2, 3, 4])
        let clientDataHash = Data(repeating: 8, count: 32)
        let payload = CredentialIPCBridge.passkeyAssertionPayloadForTesting(
            relyingPartyIdentifier: "example.com",
            credentialID: credentialID,
            clientDataHash: clientDataHash,
            allowedCredentialIDs: [credentialID]
        )
        let request = payload["request"] as? [String: Any]
        let allowedCredentials = request?["allowCredentials"] as? [[String: Any]]

        XCTAssertEqual(payload["platform"] as? String, "ios")
        XCTAssertEqual(payload["credentialIdB64Url"] as? String, CredentialIPCBridge.base64URLEncode(credentialID))
        XCTAssertEqual(payload["origin"] as? String, "https://example.com")
        XCTAssertEqual(payload["clientDataHash"] as? String, CredentialIPCBridge.base64URLEncode(clientDataHash))
        XCTAssertEqual(payload["userVerified"] as? Bool, true)
        XCTAssertEqual(request?["rpId"] as? String, "example.com")
        XCTAssertNil(request?["origin"])
        XCTAssertNil(request?["clientDataHash"])
        XCTAssertEqual(allowedCredentials?.first?["id"] as? String, CredentialIPCBridge.base64URLEncode(credentialID))
    }
}
