import AirProviderTransport
import AuthenticationServices
import SwiftUI
import UIKit

/// Maps Apple callbacks and completion objects. The model owns presentation lifetime;
/// ProviderClient and the host retain the single Core/provider contract.
@MainActor
open class AirCredentialProviderController: ASCredentialProviderViewController {
  private let model = ProviderModel()
  private var automatic: Task<Void, Never>?
  private var content: UIHostingController<ProviderView>?

  private func client() throws -> ProviderClient {
    guard let identity = Bundle.main.bundleIdentifier,
      let host = Bundle.main.object(forInfoDictionaryKey: "AirProviderHostBundle") as? String,
      host.hasPrefix("com.chromvoid.iosair.dev"), identity == host + ".provider",
      let group = Bundle.main.object(forInfoDictionaryKey: "AirProviderAppGroup") as? String,
      group == "group." + host + ".provider",
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil
    else { throw ProviderTransportError.unavailable }
    return ProviderClient(serviceName: group + ".requests")
  }

  public override func viewDidLoad() {
    super.viewDidLoad()
    let hosted = UIHostingController(
      rootView: ProviderView(model: model) { [weak self] in self?.cancel() })
    addChild(hosted)
    hosted.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(hosted.view)
    NSLayoutConstraint.activate([
      hosted.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hosted.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hosted.view.topAnchor.constraint(equalTo: view.topAnchor),
      hosted.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hosted.didMove(toParent: self)
    content = hosted
  }

  public override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    automatic?.cancel()
    model.reset()
  }

  public override func prepareCredentialList(
    for serviceIdentifiers: [ASCredentialServiceIdentifier]
  ) {
    prepareList(serviceIdentifiers)
  }

  public override func prepareInterfaceForExtensionConfiguration() {
    automatic?.cancel()
    model.configure()
  }

  public override func provideCredentialWithoutUserInteraction(
    for credentialIdentity: ASPasswordCredentialIdentity
  ) {
    runAutomatic { [self] in try await password(credentialIdentity) }
  }

  public override func prepareInterfaceToProvideCredential(
    for credentialIdentity: ASPasswordCredentialIdentity
  ) {
    perform { [self] in try await password(credentialIdentity) }
  }

  @available(iOS 17.0, *)
  public override func provideCredentialWithoutUserInteraction(
    for credentialRequest: any ASCredentialRequest
  ) {
    if let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity {
      provideCredentialWithoutUserInteraction(for: identity)
    } else if #available(iOS 18.0, *),
      let identity = credentialRequest.credentialIdentity as? ASOneTimeCodeCredentialIdentity
    {
      runAutomatic { [self] in try await oneTimeCode(identity) }
    } else {
      automatic?.cancel()
      model.reset()
      extensionContext.cancelRequest(withError: ASExtensionError(.userInteractionRequired))
    }
  }

  @available(iOS 17.0, *)
  public override func prepareInterfaceToProvideCredential(
    for credentialRequest: any ASCredentialRequest
  ) {
    if let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity {
      prepareInterfaceToProvideCredential(for: identity)
    } else if #available(iOS 18.0, *),
      let identity = credentialRequest.credentialIdentity as? ASOneTimeCodeCredentialIdentity
    {
      perform { [self] in try await oneTimeCode(identity) }
    } else if let request = credentialRequest as? ASPasskeyCredentialRequest,
      let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity
    {
      let input = ProviderPasskeyInput(
        relyingParty: identity.relyingPartyIdentifier,
        clientDataHash: request.clientDataHash, allowedCredentialIDs: [identity.credentialID])
      perform { [self] in try await assertion(input, credentialID: identity.credentialID) }
    } else {
      perform { throw ProviderFailure("UNSUPPORTED") }
    }
  }

  @available(iOS 17.0, *)
  public override func prepareCredentialList(
    for serviceIdentifiers: [ASCredentialServiceIdentifier],
    requestParameters: ASPasskeyCredentialRequestParameters
  ) {
    let input = ProviderPasskeyInput(
      relyingParty: requestParameters.relyingPartyIdentifier,
      clientDataHash: requestParameters.clientDataHash,
      allowedCredentialIDs: requestParameters.allowedCredentials)
    prepareList(serviceIdentifiers, passkey: input)
  }

  @available(iOS 18.0, *)
  public override func prepareOneTimeCodeCredentialList(
    for serviceIdentifiers: [ASCredentialServiceIdentifier]
  ) {
    prepareList(serviceIdentifiers, codes: true)
  }

  @available(iOS 17.0, *)
  public override func prepareInterface(
    forPasskeyRegistration registrationRequest: any ASCredentialRequest
  ) {
    guard let request = registrationRequest as? ASPasskeyCredentialRequest,
      let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity
    else {
      perform { throw ProviderFailure("INVALID_CONTEXT") }
      return
    }
    let input = ProviderPasskeyInput(
      relyingParty: identity.relyingPartyIdentifier,
      clientDataHash: request.clientDataHash, allowedCredentialIDs: [])
    automatic?.cancel()
    model.prepare { [weak self] in
      guard let self else { throw CancellationError() }
      _ = try await client().readiness()
      return [
        ProviderChoice(
          id: "registration", title: identity.userName,
          subtitle: ProviderCopy.text("Create passkey") + " · " + identity.relyingPartyIdentifier,
          symbol: "person.badge.key"
        ) { [weak self] in
          guard let self else { throw CancellationError() }
          let result = try await client().registerPasskey(
            input, userName: identity.userName,
            userHandle: identity.userHandle, algorithms: request.supportedAlgorithms.map(\.rawValue)
          )
          let credential = try ASPasskeyRegistrationCredential(
            relyingParty: input.relyingParty,
            clientDataHash: input.clientDataHash,
            credentialID: Data(providerBase64: result.credentialIdB64Url),
            attestationObject: Data(providerBase64: result.response.attestationObject))
          try Task.checkCancellation()
          extensionContext.completeRegistrationRequest(using: credential, completionHandler: nil)
        }
      ]
    }
  }

  private func prepareList(
    _ services: [ASCredentialServiceIdentifier], passkey: ProviderPasskeyInput? = nil,
    codes: Bool = false
  ) {
    automatic?.cancel()
    model.prepare { [weak self] in
      guard let self else { throw CancellationError() }
      let client = try client()
      let status = try await client.readiness()
      if codes && !status.capabilityMatrix.ios.oneTimeCodes {
        throw ProviderFailure("FEATURE_UNSUPPORTED_ON_PLATFORM")
      }
      var choices: [ProviderChoice] = []
      var seen = Set<String>()
      for match in try await client.matches(services: services.map(\.identifier)) {
        let context = match.context
        let candidate = match.candidate
        if codes {
          for otp in candidate.otpOptions ?? [] where otp.type?.lowercased() == "totp" {
            let key = candidate.credentialID + ":" + otp.id
            guard seen.insert(key).inserted else { continue }
            choices.append(
              ProviderChoice(
                id: key, title: otp.label ?? candidate.label,
                subtitle: context.domain, symbol: "number"
              ) { [weak self] in
                guard let self else { throw CancellationError() }
                try await code(id: candidate.credentialID, otpID: otp.id, context: context)
              })
          }
        } else if seen.insert(candidate.credentialID).inserted {
          choices.append(
            ProviderChoice(
              id: candidate.credentialID, title: candidate.label,
              subtitle: candidate.username + " · " + context.domain, symbol: "key"
            ) { [weak self] in
              guard let self else { throw CancellationError() }
              try await password(id: candidate.credentialID, context: context)
            })
        }
      }
      if #available(iOS 17.0, *), let passkey, status.capabilityMatrix.ios.passkeysLite {
        for candidate in try await client.passkeys(passkey) {
          choices.append(
            ProviderChoice(
              id: "passkey:" + candidate.credentialIDB64URL,
              title: candidate.userName.isEmpty ? candidate.userDisplayName : candidate.userName,
              subtitle: candidate.rpID, symbol: "person.badge.key"
            ) { [weak self] in
              guard let self else { throw CancellationError() }
              try await assertion(
                passkey, credentialID: Data(providerBase64: candidate.credentialIDB64URL))
            })
        }
      }
      return choices
    }
  }

  private func password(_ identity: ASPasswordCredentialIdentity) async throws {
    guard let id = identity.recordIdentifier else { throw ProviderFailure("NO_MATCH") }
    try await password(
      id: id, context: ProviderServiceContext(identifier: identity.serviceIdentifier.identifier))
  }

  private func password(id: String, context: ProviderServiceContext) async throws {
    let result = try await client().password(id: id, context: context)
    guard let password = result.password else { throw ProviderFailure("NO_MATCH") }
    try Task.checkCancellation()
    extensionContext.completeRequest(
      withSelectedCredential: ASPasswordCredential(user: result.username, password: password),
      completionHandler: nil)
  }

  @available(iOS 18.0, *)
  private func oneTimeCode(_ identity: ASOneTimeCodeCredentialIdentity) async throws {
    guard let record = identity.recordIdentifier, record.hasPrefix("cv:otp:v1:") else {
      throw ProviderFailure("NO_MATCH")
    }
    let parts = record.dropFirst("cv:otp:v1:".count).split(
      separator: ":", omittingEmptySubsequences: false)
    guard parts.count == 2,
      let id = String(data: try Data(providerBase64: String(parts[0])), encoding: .utf8),
      let otpID = String(data: try Data(providerBase64: String(parts[1])), encoding: .utf8)
    else { throw ProviderFailure("NO_MATCH") }
    try await code(
      id: id, otpID: otpID,
      context: ProviderServiceContext(identifier: identity.serviceIdentifier.identifier))
  }

  private func code(id: String, otpID: String, context: ProviderServiceContext) async throws {
    guard #available(iOS 18.0, *) else { throw ProviderFailure("UNSUPPORTED") }
    let result = try await client().oneTimeCode(id: id, otpID: otpID, context: context)
    guard Double(result.validUntilMS) > Date().timeIntervalSince1970 * 1_000 else {
      throw ProviderFailure("OTP_GENERATE_FAILED")
    }
    try Task.checkCancellation()
    extensionContext.completeOneTimeCodeRequest(
      using: ASOneTimeCodeCredential(code: result.code), completionHandler: nil)
  }

  @available(iOS 17.0, *)
  private func assertion(_ input: ProviderPasskeyInput, credentialID: Data) async throws {
    _ = try await client().readiness()
    let result = try await client().assertPasskey(input, credentialID: credentialID)
    let credential = try ASPasskeyAssertionCredential(
      userHandle: Data(providerBase64: result.response.userHandle),
      relyingParty: input.relyingParty, signature: Data(providerBase64: result.response.signature),
      clientDataHash: input.clientDataHash,
      authenticatorData: Data(providerBase64: result.response.authenticatorData),
      credentialID: Data(providerBase64: result.credentialIdB64Url))
    try Task.checkCancellation()
    extensionContext.completeAssertionRequest(using: credential, completionHandler: nil)
  }

  private func perform(_ action: @escaping @MainActor () async throws -> Void) {
    automatic?.cancel()
    model.reset()
    model.choose(
      ProviderChoice(id: "selected", title: "", subtitle: "", symbol: "key", perform: action))
  }

  private func runAutomatic(_ action: @escaping @MainActor () async throws -> Void) {
    automatic?.cancel()
    model.reset()
    automatic = Task { [weak self] in
      do { try await action() } catch {
        guard !Task.isCancelled else { return }
        let code: ASExtensionError.Code =
          (error as? ProviderFailure)?.code == "NO_MATCH"
          ? .credentialIdentityNotFound : .userInteractionRequired
        self?.extensionContext.cancelRequest(withError: ASExtensionError(code))
      }
    }
  }

  private func cancel() {
    automatic?.cancel()
    let configuration = model.isConfiguration
    model.reset()
    if configuration {
      extensionContext.completeExtensionConfigurationRequest()
    } else {
      extensionContext.cancelRequest(withError: ASExtensionError(.userCanceled))
    }
  }
}
