import AuthenticationServices
import Foundation

// MARK: - Credential Identity Store Sync

typealias CredentialIdentitySyncCompletion = (_ success: Bool, _ error: Error?) -> Void

protocol CredentialIdentityStoreSyncing {
    func saveCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion)
    func removeCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion)
    func replaceCredentialIdentities(with credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion)
    func removeAllCredentialIdentities(completion: @escaping CredentialIdentitySyncCompletion)
}

struct CredentialIdentityRecord: Equatable {
    let serviceIdentifier: String
    let user: String
    let recordIdentifier: String

    func asPasswordCredentialIdentity() -> ASPasswordCredentialIdentity {
        ASPasswordCredentialIdentity(
            serviceIdentifier: ASCredentialServiceIdentifier(identifier: serviceIdentifier, type: .domain),
            user: user,
            recordIdentifier: recordIdentifier
        )
    }
}

final class SystemCredentialIdentityStoreAdapter: CredentialIdentityStoreSyncing {
    private let store = ASCredentialIdentityStore.shared

    func saveCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        store.saveCredentialIdentities(credentialIdentities, completion: completion)
    }

    func removeCredentialIdentities(_ credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        store.removeCredentialIdentities(credentialIdentities, completion: completion)
    }

    func replaceCredentialIdentities(with credentialIdentities: [ASPasswordCredentialIdentity], completion: @escaping CredentialIdentitySyncCompletion) {
        store.replaceCredentialIdentities(with: credentialIdentities, completion: completion)
    }

    func removeAllCredentialIdentities(completion: @escaping CredentialIdentitySyncCompletion) {
        store.removeAllCredentialIdentities(completion)
    }
}

enum CredentialIdentitySyncMode: String {
    case incremental
    case replace
    case clear
}

final class CredentialIdentitySyncAdapter {
    private let store: CredentialIdentityStoreSyncing

    init(store: CredentialIdentityStoreSyncing = SystemCredentialIdentityStoreAdapter()) {
        self.store = store
    }

    func sync(
        mode: CredentialIdentitySyncMode,
        save: [CredentialIdentityRecord],
        remove: [CredentialIdentityRecord],
        completion: @escaping CredentialIdentitySyncCompletion
    ) {
        let saveIdentities = save.map { $0.asPasswordCredentialIdentity() }
        let removeIdentities = remove.map { $0.asPasswordCredentialIdentity() }

        switch mode {
        case .clear:
            store.removeAllCredentialIdentities(completion: completion)
        case .replace:
            store.replaceCredentialIdentities(with: saveIdentities, completion: completion)
        case .incremental:
            store.saveCredentialIdentities(saveIdentities) { success, error in
                if !success || error != nil {
                    completion(success, error)
                    return
                }

                if removeIdentities.isEmpty {
                    completion(true, nil)
                    return
                }

                self.store.removeCredentialIdentities(removeIdentities, completion: completion)
            }
        }
    }
}

// MARK: - IPC Protocol (Darwin Notifications + UserDefaults)

/// Bidirectional IPC protocol between Credential Provider Extension and Core app.
///
/// Flow:
/// 1. Extension writes request to UserDefaults under `requestKey` with a unique `request_id`
/// 2. Extension posts Darwin notification `com.chromvoid.credential.request`
/// 3. Core app receives notification, reads request, processes via credential_provider RPC
/// 4. Core app writes response to UserDefaults under `responseKey` with matching `request_id`
/// 5. Core app posts Darwin notification `com.chromvoid.credential.response`
/// 6. Extension receives notification, reads response, delivers credential to system
enum CredentialIPCBridge {
    static let appGroupID = "group.com.chromvoid.app.shared"
    static let requestKey = "credential_provider.request"
    static let responseKey = "credential_provider.response"
    static let schemaVersion = 2

    // Darwin notification names for cross-process signaling
    static let requestNotification = "com.chromvoid.credential.request" as CFString
    static let responseNotification = "com.chromvoid.credential.response" as CFString

    // Timeout for waiting on a response from Core
    static let responseTimeoutSeconds: TimeInterval = 10.0
    // Poll interval when waiting for response
    static let pollIntervalSeconds: TimeInterval = 0.05

    private static let forbiddenSecretFields: Set<String> = [
        "password",
        "secret",
        "otp",
        "token",
        "assertion",
        "privateKey",
        "private_key",
    ]

    private static var platform: String {
        #if os(iOS)
            return "ios"
        #elseif os(macOS)
            return "macos"
        #else
            return "unknown"
        #endif
    }

    private static var platformVersionMajor: Int {
        ProcessInfo.processInfo.operatingSystemVersion.majorVersion
    }

    private static func nowIso8601() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    static func passkeysLiteReady() -> Bool {
        if #available(iOS 17.0, macOS 14.0, *) {
            return true
        }
        return false
    }

    static func passkeysLiteUnsupportedReason() -> String? {
        if passkeysLiteReady() {
            return nil
        }

        if platform == "ios" {
            return "passkeys_lite requires iOS 17+"
        }
        if platform == "macos" {
            return "passkeys_lite requires macOS 14+"
        }
        return "apple adapter requires ios or macos"
    }

    static func sanitizedMetadata(_ value: Any) -> Any {
        if let map = value as? [String: Any] {
            var out: [String: Any] = [:]
            for (key, raw) in map {
                let lowered = key.lowercased()
                if forbiddenSecretFields.contains(lowered)
                    || lowered.contains("password")
                    || lowered.contains("secret")
                    || lowered.contains("token")
                    || lowered.contains("otp")
                {
                    continue
                }
                out[key] = sanitizedMetadata(raw)
            }
            return out
        }

        if let list = value as? [Any] {
            return list.map(sanitizedMetadata)
        }

        return value
    }

    private static func requestEnvelope(
        requestID: String,
        command: String,
        data: [String: Any]
    ) -> [String: Any] {
        [
            "schema_version": schemaVersion,
            "request_id": requestID,
            "command": command,
            "data": data,
            "timestamp": nowIso8601(),
        ]
    }

    static func buildRPCRequestEnvelopeForTesting(
        requestID: String = "test-request",
        command: String,
        data: [String: Any] = [:]
    ) -> [String: Any] {
        requestEnvelope(requestID: requestID, command: command, data: data)
    }

    static func sanitizeAdapterMetadataForTesting(_ value: Any) -> Any {
        sanitizedMetadata(value)
    }

    // MARK: - Request/Response IPC

    /// Generate a unique request ID
    private static func generateRequestID() -> String {
        UUID().uuidString
    }

    /// Send an RPC request to Core and wait for the response synchronously.
    /// Returns the response payload or nil on timeout.
    ///
    /// Both request and response are stored as JSON strings in UserDefaults
    /// for cross-process compatibility with the Rust Core.
    static func sendRPCRequest(command: String, data: [String: Any] = [:]) -> [String: Any]? {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return nil }

        let requestID = generateRequestID()

        // Clear any stale response
        defaults.removeObject(forKey: responseKey)
        defaults.synchronize()

        let request = requestEnvelope(requestID: requestID, command: command, data: data)
        guard let jsonData = try? JSONSerialization.data(withJSONObject: request),
              let jsonString = String(data: jsonData, encoding: .utf8)
        else { return nil }

        defaults.set(jsonString, forKey: requestKey)
        defaults.synchronize()

        // Post Darwin notification to wake up Core
        postDarwinNotification(requestNotification)

        // Poll for response with matching request_id (stored as JSON string by Rust)
        let deadline = Date().addingTimeInterval(responseTimeoutSeconds)
        while Date() < deadline {
            defaults.synchronize()
            if let jsonStr = defaults.string(forKey: responseKey),
               let respData = jsonStr.data(using: .utf8),
               let response = try? JSONSerialization.jsonObject(with: respData) as? [String: Any],
               let respID = response["request_id"] as? String,
               respID == requestID
            {
                // Clear consumed response
                defaults.removeObject(forKey: responseKey)
                defaults.synchronize()
                return response
            }
            Thread.sleep(forTimeInterval: pollIntervalSeconds)
        }

        return nil
    }

    /// Write a response to UserDefaults and notify the Extension.
    /// Called by the Core app side.
    static func writeResponse(_ response: [String: Any]) {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: response),
              let jsonString = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(jsonString, forKey: responseKey)
        defaults.synchronize()
        postDarwinNotification(responseNotification)
    }

    /// Read the pending request from UserDefaults.
    /// Called by the Core app side to process incoming requests.
    static func readPendingRequest() -> [String: Any]? {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return nil }
        defaults.synchronize()
        guard let jsonString = defaults.string(forKey: requestKey),
              let data = jsonString.data(using: .utf8)
        else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    /// Clear the consumed request.
    static func clearRequest() {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        defaults.removeObject(forKey: requestKey)
        defaults.synchronize()
    }

    static func readResponse() -> [String: Any]? {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return nil }
        defaults.synchronize()
        guard let jsonString = defaults.string(forKey: responseKey),
              let data = jsonString.data(using: .utf8)
        else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    static func isCredentialProviderReady() -> Bool {
        UserDefaults(suiteName: appGroupID) != nil
    }

    // MARK: - Darwin Notifications

    private static func postDarwinNotification(_ name: CFString) {
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterPostNotification(center, CFNotificationName(name), nil, nil, true)
    }

    /// Register an observer for incoming request notifications (Core app side).
    static func observeRequests(callback: @escaping () -> Void) -> DarwinNotificationObserver {
        DarwinNotificationObserver(name: requestNotification, callback: callback)
    }

    /// Register an observer for incoming response notifications (Extension side).
    static func observeResponses(callback: @escaping () -> Void) -> DarwinNotificationObserver {
        DarwinNotificationObserver(name: responseNotification, callback: callback)
    }

    // MARK: - Credential Identity Store Sync (vault events)

    private static let syncAdapter = CredentialIdentitySyncAdapter()

    /// Register all credentials in ASCredentialIdentityStore.
    /// Called when vault is unlocked.
    static func registerCredentials(_ records: [CredentialIdentityRecord], completion: @escaping CredentialIdentitySyncCompletion) {
        syncAdapter.sync(mode: .replace, save: records, remove: [], completion: completion)
    }

    /// Incrementally update credentials in ASCredentialIdentityStore.
    static func updateCredentials(
        save: [CredentialIdentityRecord],
        remove: [CredentialIdentityRecord],
        completion: @escaping CredentialIdentitySyncCompletion
    ) {
        syncAdapter.sync(mode: .incremental, save: save, remove: remove, completion: completion)
    }

    /// Clear all credentials from ASCredentialIdentityStore.
    /// Called when vault is locked.
    static func clearCredentials(completion: @escaping CredentialIdentitySyncCompletion) {
        syncAdapter.sync(mode: .clear, save: [], remove: [], completion: completion)
    }

}

// MARK: - Darwin Notification Observer (RAII wrapper)

final class DarwinNotificationObserver {
    private let name: CFString
    private let callback: () -> Void
    private var registered = false

    init(name: CFString, callback: @escaping () -> Void) {
        self.name = name
        self.callback = callback
        register()
    }

    deinit {
        unregister()
    }

    private func register() {
        guard !registered else { return }

        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()

        CFNotificationCenterAddObserver(
            center,
            observer,
            { _, observer, _, _, _ in
                guard let observer else { return }
                let this = Unmanaged<DarwinNotificationObserver>.fromOpaque(observer).takeUnretainedValue()
                this.callback()
            },
            name,
            nil,
            .deliverImmediately
        )
        registered = true
    }

    private func unregister() {
        guard registered else { return }
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterRemoveObserver(center, observer, CFNotificationName(name), nil)
        registered = false
    }
}
