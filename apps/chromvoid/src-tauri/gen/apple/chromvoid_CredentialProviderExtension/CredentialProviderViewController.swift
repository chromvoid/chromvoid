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

// MARK: - Credential Provider View Controller

final class CredentialProviderViewController: ASCredentialProviderViewController {
    private var candidateCredentials: [[String: Any]] = []
    private var candidateDomains: [String] = []
    private var activePasskeyRelyingParty: String?

    override func viewDidLoad() {
        super.viewDidLoad()
    }

    // MARK: - ASCredentialProviderViewController overrides

    /// macOS/iOS calls this when the user taps a credential from the AutoFill list.
    /// The credential was previously registered in ASCredentialIdentityStore.
    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        activePasskeyRelyingParty = nil
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
        activePasskeyRelyingParty = nil
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
        activePasskeyRelyingParty = nil
        preparePasswordCredentialList(domains: serviceIdentifiers.map(\.identifier))
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func provideCredentialWithoutUserInteraction(for credentialRequest: ASCredentialRequest) {
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
        switch credentialRequest.type {
        case .password:
            guard let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
                extensionContext.cancelRequest(withError: ASExtensionError(.credentialIdentityNotFound))
                return
            }
            prepareInterfaceToProvideCredential(for: identity)
        case .passkeyAssertion:
            showProviderUnavailableUI(
                title: "Passkeys are unavailable",
                message: "This build supports password fallback from mixed credential lists, but direct passkey assertion is not available yet."
            )
        default:
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func prepareCredentialList(
        for serviceIdentifiers: [ASCredentialServiceIdentifier],
        requestParameters: ASPasskeyCredentialRequestParameters
    ) {
        activePasskeyRelyingParty = requestParameters.relyingPartyIdentifier

        var domains = [requestParameters.relyingPartyIdentifier]
        domains.append(contentsOf: serviceIdentifiers.map(\.identifier))
        preparePasswordCredentialList(domains: domains)
    }

    @available(iOS 17.0, macOS 14.0, *)
    override func prepareInterface(forPasskeyRegistration registrationRequest: ASCredentialRequest) {
        activePasskeyRelyingParty = nil

        if let error = ensureProviderReady() {
            presentBridgeError(error)
            return
        }

        showProviderUnavailableUI(
            title: "Passkeys are unavailable",
            message: "ChromVoid passkey registration is not available yet in this build."
        )
    }

    private func preparePasswordCredentialList(domains: [String]) {
        let deduplicatedDomains = Array(NSOrderedSet(array: domains.compactMap { value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        })) as? [String] ?? []
        candidateDomains = deduplicatedDomains

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
        default:
            showProviderUnavailableUI(title: "ChromVoid is unavailable", message: error.message)
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

    @objc private func credentialSelected(_ sender: NSButton) {
        let index = sender.tag
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

    @objc private func credentialSelected(_ sender: UIButton) {
        let index = sender.tag
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

    @objc private func cancelTapped() {
        extensionContext.cancelRequest(withError: ASExtensionError(.userCanceled))
    }

    private func clearUI() {
        view.subviews.forEach { $0.removeFromSuperview() }
    }

    #endif
}
