import AuthenticationServices
import Foundation
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

// MARK: - IPC Channel (Extension → Core)

/// Handles bidirectional IPC with the Core app via Darwin Notifications + UserDefaults.
/// Extension-side: sends RPC requests and receives responses.
private enum CredentialProviderIPCChannel {
    /// Send an RPC command to Core and wait for the response.
    static func callCore(command: String, data: [String: Any] = [:]) -> [String: Any]? {
        CredentialIPCBridge.sendRPCRequest(command: command, data: data)
    }
}

private struct ProviderBridgeError: Error {
    let code: String
    let message: String
}

private struct PasskeyCandidate {
    let credentialIdB64Url: String
    let rpId: String
    let userName: String
    let userDisplayName: String

    var accountLabel: String {
        let trimmedUserName = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedUserName.isEmpty {
            return trimmedUserName
        }
        let trimmedDisplayName = userDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedDisplayName.isEmpty {
            return trimmedDisplayName
        }
        return rpId
    }

    init?(payload: [String: Any]) {
        guard let credentialId = payload["credentialIdB64Url"] as? String,
              let rpId = payload["rpId"] as? String
        else {
            return nil
        }

        self.credentialIdB64Url = credentialId
        self.rpId = rpId
        self.userName = payload["userName"] as? String ?? ""
        self.userDisplayName = payload["userDisplayName"] as? String ?? ""
    }
}

private struct PasskeyAssertionContext {
    let relyingPartyIdentifier: String
    let clientDataHash: Data
    let allowedCredentialIDs: [Data]
}

private struct OneTimeCodeCandidate {
    let credentialID: String
    let otpID: String
    let label: String
    let domain: String
}

private enum CredentialListItem {
    case password(Int)
    case passkey(Int)
}

// MARK: - Credential Provider View Controller

final class CredentialProviderViewController: ASCredentialProviderViewController {
    private var candidateCredentials: [[String: Any]] = []
    private var candidatePasskeys: [PasskeyCandidate] = []
    private var candidateOneTimeCodes: [OneTimeCodeCandidate] = []
    private var candidateListItems: [CredentialListItem] = []
    private var candidateDomains: [String] = []
    private var activePasskeyAssertionContext: PasskeyAssertionContext?

    override func viewDidLoad() {
        super.viewDidLoad()
    }

    // MARK: - ASCredentialProviderViewController overrides

    /// macOS/iOS calls this when the user taps a credential from the AutoFill list.
    /// The credential was previously registered in ASCredentialIdentityStore.
    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        activePasskeyAssertionContext = nil
        guard let recordIdentifier = credentialIdentity.recordIdentifier else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        // Try to get the secret without user interaction
        let outcome = fetchCredential(
            recordIdentifier: recordIdentifier,
            serviceIdentifier: credentialIdentity.serviceIdentifier.identifier
        )

        if let credential = outcome.credential {
            extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
        } else {
            extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
        }
    }

    /// Called when user interaction is allowed (after provideCredentialWithoutUserInteraction fails).
    override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
        activePasskeyAssertionContext = nil
        guard let recordIdentifier = credentialIdentity.recordIdentifier else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let outcome = fetchCredential(
            recordIdentifier: recordIdentifier,
            serviceIdentifier: credentialIdentity.serviceIdentifier.identifier
        )

        if let credential = outcome.credential {
            extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
        } else if let error = outcome.error {
            presentBridgeError(error)
        } else {
            showProviderUnavailableUI(
                title: "ChromVoid is unavailable",
                message: "Bring ChromVoid to the foreground and try AutoFill again."
            )
        }
    }

    /// Called when the user selects our provider from the AutoFill bar for a service.
    /// We should show a list of matching credentials.
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        activePasskeyAssertionContext = nil
        preparePasswordCredentialList(domains: serviceIdentifiers.map(\.identifier))
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func provideCredentialWithoutUserInteraction(for credentialRequest: ASCredentialRequest) {
        if #available(iOS 18.0, macOS 15.0, *),
           let oneTimeCodeRequest = credentialRequest as? ASOneTimeCodeCredentialRequest
        {
            provideOneTimeCodeWithoutUserInteraction(for: oneTimeCodeRequest)
            return
        }

        switch credentialRequest.type {
        case .password:
            guard let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
                extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
                return
            }
            provideCredentialWithoutUserInteraction(for: identity)
        case .passkeyAssertion:
            extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
        default:
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func prepareInterfaceToProvideCredential(for credentialRequest: ASCredentialRequest) {
        if #available(iOS 18.0, macOS 15.0, *),
           let oneTimeCodeRequest = credentialRequest as? ASOneTimeCodeCredentialRequest
        {
            prepareInterfaceToProvideOneTimeCode(for: oneTimeCodeRequest)
            return
        }

        switch credentialRequest.type {
        case .password:
            guard let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
                extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
                return
            }
            prepareInterfaceToProvideCredential(for: identity)
        case .passkeyAssertion:
            completePasskeyAssertion(for: credentialRequest)
        default:
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func prepareCredentialList(
        for serviceIdentifiers: [ASCredentialServiceIdentifier],
        requestParameters: ASPasskeyCredentialRequestParameters
    ) {
        activePasskeyAssertionContext = PasskeyAssertionContext(
            relyingPartyIdentifier: requestParameters.relyingPartyIdentifier,
            clientDataHash: requestParameters.clientDataHash,
            allowedCredentialIDs: requestParameters.allowedCredentials
        )
        prepareCombinedCredentialList(domains: serviceIdentifiers.map(\.identifier))
    }

    @available(iOS 18.0, macOS 15.0, *)
    override func prepareOneTimeCodeCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        prepareOneTimeCodeCredentialList(domains: serviceIdentifiers.map(\.identifier))
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func prepareInterface(forPasskeyRegistration registrationRequest: ASCredentialRequest) {
        activePasskeyAssertionContext = nil

        completePasskeyRegistration(for: registrationRequest)
    }

    private func preparePasswordCredentialList(domains: [String]) {
        let deduplicatedDomains = deduplicatedDomains(from: domains)
        candidateDomains = deduplicatedDomains
        candidatePasskeys = []
        candidateListItems = []

        if let error = ensureProviderReady() {
            presentBridgeError(error)
            return
        }

        let context = webContext(for: deduplicatedDomains.first ?? "")
        let response = CredentialProviderIPCChannel.callCore(
            command: "credential_provider:list",
            data: ["context": context]
        )

        guard let result = bridgeResult(from: response) else {
            if let error = bridgeError(from: response) {
                presentBridgeError(error)
            } else {
                showProviderUnavailableUI(
                    title: "ChromVoid is unavailable",
                    message: "Bring ChromVoid to the foreground and try AutoFill again."
                )
            }
            return
        }

        guard let candidates = result["candidates"] as? [[String: Any]], !candidates.isEmpty else {
            showNoCredentialsUI()
            return
        }

        candidateCredentials = candidates
        showCredentialListUI(candidates: candidates, domains: deduplicatedDomains)
    }

    private func preparePasskeyCredentialList() {
        guard let context = activePasskeyAssertionContext else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        if let error = ensurePasskeysLiteReady() {
            presentBridgeError(error)
            return
        }

        let response = CredentialProviderIPCChannel.callCore(
            command: CredentialIPCBridge.passkeyQueryCommand,
            data: CredentialIPCBridge.passkeyAssertionPayload(
                relyingPartyIdentifier: context.relyingPartyIdentifier,
                credentialID: nil,
                clientDataHash: context.clientDataHash,
                allowedCredentialIDs: context.allowedCredentialIDs,
                userVerified: false
            )
        )

        guard let result = bridgeResult(from: response) else {
            presentBridgeError(bridgeError(from: response) ?? unavailableError())
            return
        }

        let passkeys = (result["passkeys"] as? [[String: Any]] ?? [])
            .compactMap(PasskeyCandidate.init(payload:))

        guard !passkeys.isEmpty else {
            showNoCredentialsUI()
            return
        }

        candidatePasskeys = passkeys
        candidateCredentials = []
        candidateListItems = []
        showPasskeyListUI(candidates: passkeys)
    }

    private func prepareCombinedCredentialList(domains: [String]) {
        let deduplicatedDomains = deduplicatedDomains(from: domains)
        candidateDomains = deduplicatedDomains
        candidateCredentials = []
        candidatePasskeys = []
        candidateListItems = []

        guard let context = activePasskeyAssertionContext else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        if let error = ensureProviderReady() {
            presentBridgeError(error)
            return
        }

        var deferredError: ProviderBridgeError?
        let web = webContext(for: deduplicatedDomains.first ?? context.relyingPartyIdentifier)
        let passwordResponse = CredentialProviderIPCChannel.callCore(
            command: "credential_provider:list",
            data: ["context": web]
        )
        if let result = bridgeResult(from: passwordResponse) {
            candidateCredentials = result["candidates"] as? [[String: Any]] ?? []
        } else {
            deferredError = bridgeError(from: passwordResponse) ?? unavailableError()
        }

        if let passkeyError = ensurePasskeysLiteReady() {
            deferredError = deferredError ?? passkeyError
        } else {
            let passkeyResponse = CredentialProviderIPCChannel.callCore(
                command: CredentialIPCBridge.passkeyQueryCommand,
                data: CredentialIPCBridge.passkeyAssertionPayload(
                    relyingPartyIdentifier: context.relyingPartyIdentifier,
                    credentialID: nil,
                    clientDataHash: context.clientDataHash,
                    allowedCredentialIDs: context.allowedCredentialIDs,
                    userVerified: false
                )
            )
            if let result = bridgeResult(from: passkeyResponse) {
                candidatePasskeys = (result["passkeys"] as? [[String: Any]] ?? [])
                    .compactMap(PasskeyCandidate.init(payload:))
            } else {
                deferredError = deferredError ?? bridgeError(from: passkeyResponse) ?? unavailableError()
            }
        }

        if candidateCredentials.isEmpty && candidatePasskeys.isEmpty {
            if let error = deferredError {
                presentBridgeError(error)
            } else {
                showNoCredentialsUI()
            }
            return
        }

        showCombinedCredentialListUI(
            credentials: candidateCredentials,
            passkeys: candidatePasskeys,
            domains: deduplicatedDomains
        )
    }

    private func deduplicatedDomains(from domains: [String]) -> [String] {
        var seen = Set<String>()
        return domains.compactMap { value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, seen.insert(trimmed).inserted else {
                return nil
            }
            return trimmed
        }
    }

    /// Called when the user opens the extension settings.
    override func prepareInterfaceForExtensionConfiguration() {
        showProviderUnavailableUI(
            title: "Open ChromVoid",
            message: "Provider configuration is managed in the main ChromVoid app."
        )
    }

    // MARK: - Core IPC Flow

    /// Full flow: status → session:open → getSecret → session:close
    private func fetchCredential(
        recordIdentifier: String,
        serviceIdentifier: String
    ) -> (credential: ASPasswordCredential?, error: ProviderBridgeError?) {
        if let error = ensureProviderReady() {
            return (nil, error)
        }

        let sessionResp = CredentialProviderIPCChannel.callCore(command: "credential_provider:session:open")
        guard let sessionResult = bridgeResult(from: sessionResp),
              let providerSession = sessionResult["provider_session"] as? String
        else {
            return (nil, bridgeError(from: sessionResp) ?? unavailableError())
        }

        let context = webContext(for: serviceIdentifier)
        let secretResp = CredentialProviderIPCChannel.callCore(
            command: "credential_provider:getSecret",
            data: [
                "provider_session": providerSession,
                "credential_id": recordIdentifier,
                "context": context,
            ]
        )

        // Always close session regardless of result.
        let _ = CredentialProviderIPCChannel.callCore(
            command: "credential_provider:session:close",
            data: ["provider_session": providerSession]
        )

        guard let secretResult = bridgeResult(from: secretResp),
              let username = secretResult["username"] as? String,
              let password = secretResult["password"] as? String
        else {
            return (nil, bridgeError(from: secretResp) ?? unavailableError())
        }

        return (ASPasswordCredential(user: username, password: password), nil)
    }

    @available(iOS 18.0, macOS 15.0, *)
    private func provideOneTimeCodeWithoutUserInteraction(for request: ASOneTimeCodeCredentialRequest) {
        guard let identity = request.credentialIdentity as? ASOneTimeCodeCredentialIdentity,
              let recordIdentifier = identity.recordIdentifier,
              let record = CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier(recordIdentifier)
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let outcome = fetchOneTimeCode(
            credentialID: record.credentialID,
            otpID: record.otpID,
            serviceIdentifier: identity.serviceIdentifier.identifier
        )
        if let credential = outcome.credential {
            extensionContext.completeOneTimeCodeRequest(using: credential, completionHandler: nil)
        } else {
            cancelAutomaticOneTimeCodeRequest(error: outcome.error)
        }
    }

    @available(iOS 18.0, macOS 15.0, *)
    private func prepareInterfaceToProvideOneTimeCode(for request: ASOneTimeCodeCredentialRequest) {
        guard let identity = request.credentialIdentity as? ASOneTimeCodeCredentialIdentity,
              let recordIdentifier = identity.recordIdentifier,
              let record = CredentialIPCBridge.decodeOneTimeCodeRecordIdentifier(recordIdentifier)
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let outcome = fetchOneTimeCode(
            credentialID: record.credentialID,
            otpID: record.otpID,
            serviceIdentifier: identity.serviceIdentifier.identifier
        )
        if let credential = outcome.credential {
            extensionContext.completeOneTimeCodeRequest(using: credential, completionHandler: nil)
        } else {
            presentBridgeError(outcome.error ?? unavailableError())
        }
    }

    @available(iOS 18.0, macOS 15.0, *)
    private func prepareOneTimeCodeCredentialList(domains: [String]) {
        activePasskeyAssertionContext = nil
        candidateCredentials = []
        candidatePasskeys = []
        candidateListItems = []
        candidateDomains = deduplicatedDomains(from: domains)

        if let error = ensureProviderReady() {
            presentBridgeError(error)
            return
        }

        var data: [String: Any] = ["query": ""]
        if let domain = candidateDomains.first {
            data["context"] = webContext(for: domain)
        }
        let response = CredentialProviderIPCChannel.callCore(
            command: "credential_provider:search",
            data: data
        )
        guard let result = bridgeResult(from: response) else {
            presentBridgeError(bridgeError(from: response) ?? unavailableError())
            return
        }

        candidateOneTimeCodes = oneTimeCodeCandidates(
            from: result["candidates"] as? [[String: Any]] ?? []
        )
        guard !candidateOneTimeCodes.isEmpty else {
            showNoCredentialsUI(message: "No matching verification codes found")
            return
        }
        showOneTimeCodeListUI(candidates: candidateOneTimeCodes)
    }

    @available(iOS 18.0, macOS 15.0, *)
    private func fetchOneTimeCode(
        credentialID: String,
        otpID: String,
        serviceIdentifier: String
    ) -> (credential: ASOneTimeCodeCredential?, error: ProviderBridgeError?) {
        if let error = ensureProviderReady() {
            return (nil, error)
        }

        for attempt in 0 ..< 2 {
            let sessionResponse = CredentialProviderIPCChannel.callCore(
                command: "credential_provider:session:open"
            )
            guard let sessionResult = bridgeResult(from: sessionResponse),
                  let providerSession = sessionResult["provider_session"] as? String
            else {
                return (nil, bridgeError(from: sessionResponse) ?? unavailableError())
            }

            let codeResponse = CredentialProviderIPCChannel.callCore(
                command: CredentialIPCBridge.oneTimeCodeCommand,
                data: [
                    "provider_session": providerSession,
                    "credential_id": credentialID,
                    "otp_id": otpID,
                    "context": webContext(for: serviceIdentifier),
                ]
            )
            let _ = CredentialProviderIPCChannel.callCore(
                command: "credential_provider:session:close",
                data: ["provider_session": providerSession]
            )

            if let result = bridgeResult(from: codeResponse) {
                let nowMilliseconds = Date().timeIntervalSince1970 * 1_000
                guard CredentialIPCBridge.oneTimeCodeResultIsFresh(
                    result,
                    nowMilliseconds: nowMilliseconds
                ), let code = result["code"] as? String else {
                    return (
                        nil,
                        ProviderBridgeError(
                            code: "OTP_GENERATE_FAILED",
                            message: "The verification code expired before AutoFill could use it."
                        )
                    )
                }
                return (ASOneTimeCodeCredential(code: code), nil)
            }

            let error = bridgeError(from: codeResponse) ?? unavailableError()
            if attempt == 0, error.code == "PROVIDER_SESSION_EXPIRED" {
                continue
            }
            return (nil, error)
        }

        return (nil, unavailableError())
    }

    private func oneTimeCodeCandidates(from candidates: [[String: Any]]) -> [OneTimeCodeCandidate] {
        candidates.flatMap { candidate -> [OneTimeCodeCandidate] in
            guard let credentialID = candidate["credential_id"] as? String,
                  !credentialID.isEmpty,
                  let domain = candidate["domain"] as? String,
                  !domain.isEmpty
            else {
                return []
            }

            let entryLabel = (candidate["label"] as? String)
                ?? (candidate["username"] as? String)
                ?? domain
            let options = candidate["otp_options"] as? [[String: Any]] ?? []
            return options.compactMap { option in
                guard let otpID = option["id"] as? String,
                      !otpID.isEmpty,
                      let type = option["type"] as? String,
                      type.caseInsensitiveCompare("TOTP") == .orderedSame
                else {
                    return nil
                }
                let otpLabel = (option["label"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let label = otpLabel.map { $0.isEmpty ? entryLabel : "\(entryLabel) — \($0)" }
                    ?? entryLabel
                return OneTimeCodeCandidate(
                    credentialID: credentialID,
                    otpID: otpID,
                    label: label,
                    domain: domain
                )
            }
        }
    }

    @available(iOS 18.0, macOS 15.0, *)
    private func completeOneTimeCodeCandidate(at index: Int) {
        guard index < candidateOneTimeCodes.count else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }
        let candidate = candidateOneTimeCodes[index]
        let outcome = fetchOneTimeCode(
            credentialID: candidate.credentialID,
            otpID: candidate.otpID,
            serviceIdentifier: candidate.domain
        )
        if let credential = outcome.credential {
            extensionContext.completeOneTimeCodeRequest(using: credential, completionHandler: nil)
        } else {
            presentBridgeError(outcome.error ?? unavailableError())
        }
    }

    private func cancelAutomaticOneTimeCodeRequest(error: ProviderBridgeError?) {
        switch error?.code {
        case "NO_MATCH":
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
        case "HOTP_AUTOFILL_UNSUPPORTED", "ACCESS_DENIED", "OTP_GENERATE_FAILED":
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
        default:
            extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    private func completePasskeyRegistration(for registrationRequest: ASCredentialRequest) {
        if let error = ensurePasskeysLiteReady() {
            presentBridgeError(error)
            return
        }

        guard let request = registrationRequest as? ASPasskeyCredentialRequest,
              let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let response = CredentialProviderIPCChannel.callCore(
            command: CredentialIPCBridge.passkeyCreateCommand,
            data: CredentialIPCBridge.passkeyRegistrationPayload(
                relyingPartyIdentifier: identity.relyingPartyIdentifier,
                userName: identity.userName,
                userHandle: identity.userHandle,
                clientDataHash: request.clientDataHash,
                supportedAlgorithms: request.supportedAlgorithms.map(\.rawValue)
            )
        )

        guard let result = bridgeResult(from: response) else {
            presentBridgeError(bridgeError(from: response) ?? unavailableError())
            return
        }

        completePasskeyRegistration(
            relyingPartyIdentifier: identity.relyingPartyIdentifier,
            clientDataHash: request.clientDataHash,
            result: result
        )
    }

    @available(iOS 17.0, macOS 14.0, *)
    private func completePasskeyAssertion(for credentialRequest: ASCredentialRequest) {
        if let error = ensurePasskeysLiteReady() {
            presentBridgeError(error)
            return
        }

        guard let request = credentialRequest as? ASPasskeyCredentialRequest,
              let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let response = CredentialProviderIPCChannel.callCore(
            command: CredentialIPCBridge.passkeyGetCommand,
            data: CredentialIPCBridge.passkeyAssertionPayload(
                relyingPartyIdentifier: identity.relyingPartyIdentifier,
                credentialID: identity.credentialID,
                clientDataHash: request.clientDataHash,
                allowedCredentialIDs: [identity.credentialID]
            )
        )

        guard let result = bridgeResult(from: response) else {
            presentBridgeError(bridgeError(from: response) ?? unavailableError())
            return
        }

        completePasskeyAssertion(
            relyingPartyIdentifier: identity.relyingPartyIdentifier,
            clientDataHash: request.clientDataHash,
            result: result
        )
    }

    @available(iOS 17.0, macOS 14.0, *)
    private func completeSelectedPasskeyAssertion(_ candidate: PasskeyCandidate) {
        guard let context = activePasskeyAssertionContext else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        guard let credentialID = CredentialIPCBridge.base64URLDecode(candidate.credentialIdB64Url) else {
            extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        let response = CredentialProviderIPCChannel.callCore(
            command: CredentialIPCBridge.passkeyGetCommand,
            data: CredentialIPCBridge.passkeyAssertionPayload(
                relyingPartyIdentifier: context.relyingPartyIdentifier,
                credentialID: credentialID,
                clientDataHash: context.clientDataHash,
                allowedCredentialIDs: context.allowedCredentialIDs
            )
        )

        guard let result = bridgeResult(from: response) else {
            presentBridgeError(bridgeError(from: response) ?? unavailableError())
            return
        }

        completePasskeyAssertion(
            relyingPartyIdentifier: context.relyingPartyIdentifier,
            clientDataHash: context.clientDataHash,
            result: result
        )
    }

    @available(iOS 17.0, macOS 14.0, *)
    private func completePasskeyRegistration(
        relyingPartyIdentifier: String,
        clientDataHash: Data,
        result: [String: Any]
    ) {
        guard let credentialIDValue = result["credentialIdB64Url"] as? String,
              let credentialID = CredentialIPCBridge.base64URLDecode(credentialIDValue),
              let response = result["response"] as? [String: Any],
              let attestationValue = response["attestationObject"] as? String,
              let attestationObject = CredentialIPCBridge.base64URLDecode(attestationValue)
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        let credential = ASPasskeyRegistrationCredential(
            relyingParty: relyingPartyIdentifier,
            clientDataHash: clientDataHash,
            credentialID: credentialID,
            attestationObject: attestationObject
        )
        extensionContext.completeRegistrationRequest(using: credential, completionHandler: nil)
    }

    @available(iOS 17.0, macOS 14.0, *)
    private func completePasskeyAssertion(
        relyingPartyIdentifier: String,
        clientDataHash: Data,
        result: [String: Any]
    ) {
        guard let credentialIDValue = result["credentialIdB64Url"] as? String,
              let credentialID = CredentialIPCBridge.base64URLDecode(credentialIDValue),
              let response = result["response"] as? [String: Any],
              let authenticatorDataValue = response["authenticatorData"] as? String,
              let authenticatorData = CredentialIPCBridge.base64URLDecode(authenticatorDataValue),
              let signatureValue = response["signature"] as? String,
              let signature = CredentialIPCBridge.base64URLDecode(signatureValue),
              let userHandleValue = response["userHandle"] as? String,
              let userHandle = CredentialIPCBridge.base64URLDecode(userHandleValue)
        else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        let credential = ASPasskeyAssertionCredential(
            userHandle: userHandle,
            relyingParty: relyingPartyIdentifier,
            signature: signature,
            clientDataHash: clientDataHash,
            authenticatorData: authenticatorData,
            credentialID: credentialID
        )
        extensionContext.completeAssertionRequest(using: credential, completionHandler: nil)
    }

    private func bridgeResult(from response: [String: Any]?) -> [String: Any]? {
        guard let response,
              response["success"] as? Bool == true
        else {
            return nil
        }
        return response["result"] as? [String: Any]
    }

    private func bridgeError(from response: [String: Any]?) -> ProviderBridgeError? {
        guard let response,
              response["success"] as? Bool == false
        else {
            return nil
        }

        return ProviderBridgeError(
            code: response["error_code"] as? String ?? "PROVIDER_UNAVAILABLE",
            message: response["error"] as? String ?? "ChromVoid provider bridge is unavailable"
        )
    }

    private func unavailableError() -> ProviderBridgeError {
        ProviderBridgeError(
            code: "PROVIDER_UNAVAILABLE",
            message: "Bring ChromVoid to the foreground and try AutoFill again."
        )
    }

    private func ensureProviderReady() -> ProviderBridgeError? {
        let response = CredentialProviderIPCChannel.callCore(command: "credential_provider:status")
        guard let status = bridgeResult(from: response) else {
            return bridgeError(from: response) ?? unavailableError()
        }

        if status["enabled"] as? Bool != true {
            return ProviderBridgeError(
                code: "PROVIDER_DISABLED",
                message: "Enable Credential Providers in ChromVoid settings."
            )
        }

        if status["vault_open"] as? Bool != true {
            return ProviderBridgeError(
                code: "VAULT_REQUIRED",
                message: "Unlock your ChromVoid vault to continue."
            )
        }

        return nil
    }

    private func ensurePasskeysLiteReady() -> ProviderBridgeError? {
        if let error = ensureProviderReady() {
            return error
        }

        if !CredentialIPCBridge.passkeysLiteReady() {
            return ProviderBridgeError(
                code: "UNSUPPORTED",
                message: CredentialIPCBridge.passkeysLiteUnsupportedReason()
                    ?? "Passkeys are unavailable on this platform."
            )
        }

        return nil
    }

    private func webContext(for serviceIdentifier: String) -> [String: Any] {
        let domain = normalizedDomain(from: serviceIdentifier)
        return [
            "kind": "web",
            "domain": domain,
            "origin": syntheticOrigin(for: domain),
        ]
    }

    private func normalizedDomain(from serviceIdentifier: String) -> String {
        if let url = URL(string: serviceIdentifier),
           let host = url.host,
           !host.isEmpty
        {
            return host
        }

        return serviceIdentifier
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func syntheticOrigin(for domain: String) -> String {
        "https://\(domain)"
    }

    private func presentBridgeError(_ error: ProviderBridgeError) {
        switch error.code {
        case "VAULT_REQUIRED":
            showVaultLockedUI(message: error.message)
        case "NO_MATCH":
            showNoCredentialsUI(message: error.message)
        case "PROVIDER_DISABLED":
            showProviderUnavailableUI(
                title: "ChromVoid AutoFill is disabled",
                message: error.message
            )
        case "FEATURE_DISABLED_BY_ROLLOUT", "FEATURE_UNSUPPORTED_ON_PLATFORM":
            showProviderUnavailableUI(
                title: "Verification code AutoFill is unavailable",
                message: error.message
            )
        case "HOTP_AUTOFILL_UNSUPPORTED":
            showProviderUnavailableUI(
                title: "Counter-based codes are not supported",
                message: error.message
            )
        case "UNSUPPORTED":
            showProviderUnavailableUI(title: "Passkeys are unavailable", message: error.message)
        default:
            showProviderUnavailableUI(title: "ChromVoid is unavailable", message: error.message)
        }
    }

    private func completePasswordCandidate(at index: Int) {
        guard index < candidateCredentials.count else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        let candidate = candidateCredentials[index]
        let credentialID = candidate["credential_id"] as? String ?? ""
        let domain = candidate["domain"] as? String ?? candidateDomains.first ?? ""
        let outcome = fetchCredential(recordIdentifier: credentialID, serviceIdentifier: domain)

        if let credential = outcome.credential {
            extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
        } else if let error = outcome.error {
            presentBridgeError(error)
        } else {
            showProviderUnavailableUI(
                title: "ChromVoid is unavailable",
                message: "Bring ChromVoid to the foreground and try AutoFill again."
            )
        }
    }

    private func completePasskeyCandidate(at index: Int) {
        guard index < candidatePasskeys.count else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        if #available(iOS 17.0, macOS 14.0, *) {
            completeSelectedPasskeyAssertion(candidatePasskeys[index])
        } else {
            presentBridgeError(
                ProviderBridgeError(
                    code: "UNSUPPORTED",
                    message: CredentialIPCBridge.passkeysLiteUnsupportedReason()
                        ?? "Passkeys are unavailable on this platform."
                )
            )
        }
    }

    private func completeCombinedCandidate(at index: Int) {
        guard index < candidateListItems.count else {
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        switch candidateListItems[index] {
        case .password(let credentialIndex):
            completePasswordCandidate(at: credentialIndex)
        case .passkey(let passkeyIndex):
            completePasskeyCandidate(at: passkeyIndex)
        }
    }

    // MARK: - UI

    #if os(macOS)

    private func showVaultLockedUI(message: String = "Open ChromVoid and unlock your vault to use AutoFill.") {
        clearUI()

        let label = NSTextField(labelWithString: "ChromVoid vault is locked")
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(labelWithString: message)
        subtitle.font = .systemFont(ofSize: 13)
        subtitle.textColor = .secondaryLabelColor
        subtitle.alignment = .center
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [label, subtitle, cancelButton])
        stack.orientation = .vertical
        stack.spacing = 12
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -20),
        ])
    }

    private func showNoCredentialsUI(message: String = "No matching credentials found") {
        clearUI()

        let label = NSTextField(labelWithString: message)
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [label, cancelButton])
        stack.orientation = .vertical
        stack.spacing = 12
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func showProviderUnavailableUI(title: String, message: String) {
        clearUI()

        let titleLabel = NSTextField(labelWithString: title)
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.alignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(labelWithString: message)
        subtitle.font = .systemFont(ofSize: 13)
        subtitle.textColor = .secondaryLabelColor
        subtitle.alignment = .center
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [titleLabel, subtitle, cancelButton])
        stack.orientation = .vertical
        stack.spacing = 12
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -20),
        ])
    }

    private func showCredentialListUI(candidates: [[String: Any]], domains: [String]) {
        clearUI()

        let titleLabel = NSTextField(labelWithString: "Choose a credential")
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        var views: [NSView] = [titleLabel]

        for (index, candidate) in candidates.enumerated() {
            let credentialID = candidate["credential_id"] as? String ?? ""
            let username = candidate["username"] as? String ?? ""
            let label = candidate["label"] as? String ?? credentialID
            let domain = candidate["domain"] as? String ?? domains.first ?? ""

            let buttonTitle = "\(username)  —  \(label)"
            let button = NSButton(title: buttonTitle, target: self, action: #selector(credentialSelected(_:)))
            button.tag = index
            button.bezelStyle = .rounded
            button.translatesAutoresizingMaskIntoConstraints = false

            // Store credential info for selection
            button.toolTip = "\(credentialID)\n\(domain)"

            views.append(button)
        }

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        views.append(cancelButton)

        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.spacing = 8
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        let scrollView = NSScrollView()
        scrollView.documentView = stack
        scrollView.hasVerticalScroller = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -12),
        ])
    }

    @available(macOS 15.0, *)
    private func showOneTimeCodeListUI(candidates: [OneTimeCodeCandidate]) {
        clearUI()

        let titleLabel = NSTextField(labelWithString: "Choose a verification code")
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        var views: [NSView] = [titleLabel]
        for (index, candidate) in candidates.enumerated() {
            let button = NSButton(
                title: "\(candidate.label)  —  \(candidate.domain)",
                target: self,
                action: #selector(oneTimeCodeSelected(_:))
            )
            button.tag = index
            button.bezelStyle = .rounded
            button.translatesAutoresizingMaskIntoConstraints = false
            views.append(button)
        }

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        views.append(cancelButton)

        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.spacing = 8
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        let scrollView = NSScrollView()
        scrollView.documentView = stack
        scrollView.hasVerticalScroller = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -12),
        ])
    }

    private func showPasskeyListUI(candidates: [PasskeyCandidate]) {
        clearUI()

        let titleLabel = NSTextField(labelWithString: "Choose a passkey")
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        var views: [NSView] = [titleLabel]

        for (index, candidate) in candidates.enumerated() {
            let button = NSButton(
                title: "\(candidate.accountLabel)  —  \(candidate.rpId)",
                target: self,
                action: #selector(passkeySelected(_:))
            )
            button.tag = index
            button.bezelStyle = .rounded
            button.translatesAutoresizingMaskIntoConstraints = false
            views.append(button)
        }

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        views.append(cancelButton)

        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.spacing = 8
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        let scrollView = NSScrollView()
        scrollView.documentView = stack
        scrollView.hasVerticalScroller = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -12),
        ])
    }

    private func showCombinedCredentialListUI(
        credentials: [[String: Any]],
        passkeys: [PasskeyCandidate],
        domains: [String]
    ) {
        clearUI()
        candidateListItems = []

        let titleLabel = NSTextField(labelWithString: "Choose a credential")
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        var views: [NSView] = [titleLabel]

        for (index, candidate) in credentials.enumerated() {
            let credentialID = candidate["credential_id"] as? String ?? ""
            let username = candidate["username"] as? String ?? ""
            let label = candidate["label"] as? String ?? credentialID
            let domain = candidate["domain"] as? String ?? domains.first ?? ""
            candidateListItems.append(.password(index))

            let button = NSButton(
                title: "\(username) - \(label)",
                target: self,
                action: #selector(combinedCredentialSelected(_:))
            )
            button.tag = candidateListItems.count - 1
            button.bezelStyle = .rounded
            button.translatesAutoresizingMaskIntoConstraints = false
            button.toolTip = "\(credentialID)\n\(domain)"
            views.append(button)
        }

        for (index, candidate) in passkeys.enumerated() {
            candidateListItems.append(.passkey(index))
            let button = NSButton(
                title: "\(candidate.accountLabel) - \(candidate.rpId)",
                target: self,
                action: #selector(combinedCredentialSelected(_:))
            )
            button.tag = candidateListItems.count - 1
            button.bezelStyle = .rounded
            button.translatesAutoresizingMaskIntoConstraints = false
            views.append(button)
        }

        let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancelTapped))
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        views.append(cancelButton)

        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.spacing = 8
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        let scrollView = NSScrollView()
        scrollView.documentView = stack
        scrollView.hasVerticalScroller = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -12),
        ])
    }

    @objc private func credentialSelected(_ sender: NSButton) {
        completePasswordCandidate(at: sender.tag)
    }

    @objc private func passkeySelected(_ sender: NSButton) {
        completePasskeyCandidate(at: sender.tag)
    }

    @available(macOS 15.0, *)
    @objc private func oneTimeCodeSelected(_ sender: NSButton) {
        completeOneTimeCodeCandidate(at: sender.tag)
    }

    @objc private func combinedCredentialSelected(_ sender: NSButton) {
        completeCombinedCandidate(at: sender.tag)
    }

    @objc private func cancelTapped() {
        extensionContext.cancelRequest(withError: ASExtensionError(.userCanceled))
    }

    private func clearUI() {
        view.subviews.forEach { $0.removeFromSuperview() }
    }

    #else // iOS

    private func showVaultLockedUI(message: String = "Unlock your ChromVoid vault to continue.") {
        showProviderUnavailableUI(title: "ChromVoid vault is locked", message: message)
    }

    private func showNoCredentialsUI(message: String = "No matching credentials found") {
        showProviderUnavailableUI(title: "No matching credentials", message: message)
    }

    private func showCredentialListUI(candidates: [[String: Any]], domains: [String]) {
        clearUI()

        let titleLabel = UILabel()
        titleLabel.text = "Choose a credential"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [titleLabel])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false

        for (index, candidate) in candidates.enumerated() {
            let credentialID = candidate["credential_id"] as? String ?? ""
            let username = candidate["username"] as? String ?? ""
            let label = candidate["label"] as? String ?? credentialID
            let domain = candidate["domain"] as? String ?? domains.first ?? ""

            let button = UIButton(type: .system)
            button.tag = index
            button.setTitle("\(username)  •  \(label)", for: .normal)
            button.accessibilityHint = domain
            button.contentHorizontalAlignment = .left
            button.addTarget(self, action: #selector(credentialSelected(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
        }

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        stack.addArrangedSubview(cancelButton)

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -32),
        ])
    }

    @available(iOS 18.0, *)
    private func showOneTimeCodeListUI(candidates: [OneTimeCodeCandidate]) {
        clearUI()

        let titleLabel = UILabel()
        titleLabel.text = "Choose a verification code"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [titleLabel])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false

        for (index, candidate) in candidates.enumerated() {
            let button = UIButton(type: .system)
            button.tag = index
            button.setTitle("\(candidate.label)  •  \(candidate.domain)", for: .normal)
            button.contentHorizontalAlignment = .left
            button.addTarget(self, action: #selector(oneTimeCodeSelected(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
        }

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        stack.addArrangedSubview(cancelButton)

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -32),
        ])
    }

    private func showProviderUnavailableUI(title: String, message: String) {
        clearUI()

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let subtitleLabel = UILabel()
        subtitleLabel.text = message
        subtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
        subtitleLabel.textAlignment = .center
        subtitleLabel.textColor = .secondaryLabel
        subtitleLabel.numberOfLines = 0

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel, cancelButton])
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
        ])
    }

    private func showPasskeyListUI(candidates: [PasskeyCandidate]) {
        clearUI()

        let titleLabel = UILabel()
        titleLabel.text = "Choose a passkey"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [titleLabel])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false

        for (index, candidate) in candidates.enumerated() {
            let button = UIButton(type: .system)
            button.tag = index
            button.setTitle("\(candidate.accountLabel)  •  \(candidate.rpId)", for: .normal)
            button.contentHorizontalAlignment = .left
            button.addTarget(self, action: #selector(passkeySelected(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
        }

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        stack.addArrangedSubview(cancelButton)

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -32),
        ])
    }

    private func showCombinedCredentialListUI(
        credentials: [[String: Any]],
        passkeys: [PasskeyCandidate],
        domains: [String]
    ) {
        clearUI()
        candidateListItems = []

        let titleLabel = UILabel()
        titleLabel.text = "Choose a credential"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [titleLabel])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false

        for (index, candidate) in credentials.enumerated() {
            let credentialID = candidate["credential_id"] as? String ?? ""
            let username = candidate["username"] as? String ?? ""
            let label = candidate["label"] as? String ?? credentialID
            let domain = candidate["domain"] as? String ?? domains.first ?? ""
            candidateListItems.append(.password(index))

            let button = UIButton(type: .system)
            button.tag = candidateListItems.count - 1
            button.setTitle("\(username) - \(label)", for: .normal)
            button.accessibilityHint = domain
            button.contentHorizontalAlignment = .left
            button.addTarget(self, action: #selector(combinedCredentialSelected(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
        }

        for (index, candidate) in passkeys.enumerated() {
            candidateListItems.append(.passkey(index))

            let button = UIButton(type: .system)
            button.tag = candidateListItems.count - 1
            button.setTitle("\(candidate.accountLabel) - \(candidate.rpId)", for: .normal)
            button.contentHorizontalAlignment = .left
            button.addTarget(self, action: #selector(combinedCredentialSelected(_:)), for: .touchUpInside)
            stack.addArrangedSubview(button)
        }

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        stack.addArrangedSubview(cancelButton)

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -32),
        ])
    }

    @objc private func credentialSelected(_ sender: UIButton) {
        completePasswordCandidate(at: sender.tag)
    }

    @objc private func passkeySelected(_ sender: UIButton) {
        completePasskeyCandidate(at: sender.tag)
    }

    @available(iOS 18.0, *)
    @objc private func oneTimeCodeSelected(_ sender: UIButton) {
        completeOneTimeCodeCandidate(at: sender.tag)
    }

    @objc private func combinedCredentialSelected(_ sender: UIButton) {
        completeCombinedCandidate(at: sender.tag)
    }

    @objc private func cancelTapped() {
        extensionContext.cancelRequest(withError: ASExtensionError(.userCanceled))
    }

    private func clearUI() {
        view.subviews.forEach { $0.removeFromSuperview() }
    }

    #endif
}
