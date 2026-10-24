// This file was generated from JSON Schema using quicktype, do not modify it directly.
// To parse the JSON, add this file to your project and do:
//
//   let providerWire = try ProviderWire(json)

import Foundation

// MARK: - ProviderWire
public struct ProviderWire: Codable {
    public let candidate: CredentialCandidate
    public let oneTimeCode: CredentialOneTimeCode
    public let passkeys: VaultPasskeysListResponse
    public let secret: CredentialSecret
    public let session: CredentialProviderSessionResponse
    public let status: CredentialProviderStatusResponse

    public enum CodingKeys: String, CodingKey {
        case candidate = "candidate"
        case oneTimeCode = "one_time_code"
        case passkeys = "passkeys"
        case secret = "secret"
        case session = "session"
        case status = "status"
    }

    public init(candidate: CredentialCandidate, oneTimeCode: CredentialOneTimeCode, passkeys: VaultPasskeysListResponse, secret: CredentialSecret, session: CredentialProviderSessionResponse, status: CredentialProviderStatusResponse) {
        self.candidate = candidate
        self.oneTimeCode = oneTimeCode
        self.passkeys = passkeys
        self.secret = secret
        self.session = session
        self.status = status
    }
}

// MARK: ProviderWire convenience initializers and mutators

public extension ProviderWire {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(ProviderWire.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        candidate: CredentialCandidate? = nil,
        oneTimeCode: CredentialOneTimeCode? = nil,
        passkeys: VaultPasskeysListResponse? = nil,
        secret: CredentialSecret? = nil,
        session: CredentialProviderSessionResponse? = nil,
        status: CredentialProviderStatusResponse? = nil
    ) -> ProviderWire {
        return ProviderWire(
            candidate: candidate ?? self.candidate,
            oneTimeCode: oneTimeCode ?? self.oneTimeCode,
            passkeys: passkeys ?? self.passkeys,
            secret: secret ?? self.secret,
            session: session ?? self.session,
            status: status ?? self.status
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialCandidate
public struct CredentialCandidate: Codable {
    public let appID: String?
    public let credentialID: String
    public let domain: String?
    public let label: String
    public let lastUsedAt: Int?
    public let match: String
    public let otpOptions: [CredentialOtpOption]?
    public let username: String

    public enum CodingKeys: String, CodingKey {
        case appID = "app_id"
        case credentialID = "credential_id"
        case domain = "domain"
        case label = "label"
        case lastUsedAt = "last_used_at"
        case match = "match"
        case otpOptions = "otp_options"
        case username = "username"
    }

    public init(appID: String?, credentialID: String, domain: String?, label: String, lastUsedAt: Int?, match: String, otpOptions: [CredentialOtpOption]?, username: String) {
        self.appID = appID
        self.credentialID = credentialID
        self.domain = domain
        self.label = label
        self.lastUsedAt = lastUsedAt
        self.match = match
        self.otpOptions = otpOptions
        self.username = username
    }
}

// MARK: CredentialCandidate convenience initializers and mutators

public extension CredentialCandidate {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialCandidate.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        appID: String?? = nil,
        credentialID: String? = nil,
        domain: String?? = nil,
        label: String? = nil,
        lastUsedAt: Int?? = nil,
        match: String? = nil,
        otpOptions: [CredentialOtpOption]?? = nil,
        username: String? = nil
    ) -> CredentialCandidate {
        return CredentialCandidate(
            appID: appID ?? self.appID,
            credentialID: credentialID ?? self.credentialID,
            domain: domain ?? self.domain,
            label: label ?? self.label,
            lastUsedAt: lastUsedAt ?? self.lastUsedAt,
            match: match ?? self.match,
            otpOptions: otpOptions ?? self.otpOptions,
            username: username ?? self.username
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialOtpOption
public struct CredentialOtpOption: Codable {
    public let id: String
    public let label: String?
    public let type: String?

    public enum CodingKeys: String, CodingKey {
        case id = "id"
        case label = "label"
        case type = "type"
    }

    public init(id: String, label: String?, type: String?) {
        self.id = id
        self.label = label
        self.type = type
    }
}

// MARK: CredentialOtpOption convenience initializers and mutators

public extension CredentialOtpOption {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialOtpOption.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        id: String? = nil,
        label: String?? = nil,
        type: String?? = nil
    ) -> CredentialOtpOption {
        return CredentialOtpOption(
            id: id ?? self.id,
            label: label ?? self.label,
            type: type ?? self.type
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialOneTimeCode
public struct CredentialOneTimeCode: Codable {
    public let code: String
    public let credentialID: String
    public let otpID: String
    public let validUntilMS: Int

    public enum CodingKeys: String, CodingKey {
        case code = "code"
        case credentialID = "credential_id"
        case otpID = "otp_id"
        case validUntilMS = "valid_until_ms"
    }

    public init(code: String, credentialID: String, otpID: String, validUntilMS: Int) {
        self.code = code
        self.credentialID = credentialID
        self.otpID = otpID
        self.validUntilMS = validUntilMS
    }
}

// MARK: CredentialOneTimeCode convenience initializers and mutators

public extension CredentialOneTimeCode {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialOneTimeCode.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        code: String? = nil,
        credentialID: String? = nil,
        otpID: String? = nil,
        validUntilMS: Int? = nil
    ) -> CredentialOneTimeCode {
        return CredentialOneTimeCode(
            code: code ?? self.code,
            credentialID: credentialID ?? self.credentialID,
            otpID: otpID ?? self.otpID,
            validUntilMS: validUntilMS ?? self.validUntilMS
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - VaultPasskeysListResponse
public struct VaultPasskeysListResponse: Codable {
    public let passkeys: [VaultPasskeySummary]

    public enum CodingKeys: String, CodingKey {
        case passkeys = "passkeys"
    }

    public init(passkeys: [VaultPasskeySummary]) {
        self.passkeys = passkeys
    }
}

// MARK: VaultPasskeysListResponse convenience initializers and mutators

public extension VaultPasskeysListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeysListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        passkeys: [VaultPasskeySummary]? = nil
    ) -> VaultPasskeysListResponse {
        return VaultPasskeysListResponse(
            passkeys: passkeys ?? self.passkeys
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - VaultPasskeySummary
public struct VaultPasskeySummary: Codable {
    public let createdAtEpochMS: Int
    public let credentialIDB64URL: String
    public let lastUsedEpochMS: Int
    public let portable: Bool
    public let rpID: String
    public let rpName: String
    public let signCount: Int
    public let storageKind: String
    public let userDisplayName: String
    public let userName: String

    public enum CodingKeys: String, CodingKey {
        case createdAtEpochMS = "createdAtEpochMs"
        case credentialIDB64URL = "credentialIdB64Url"
        case lastUsedEpochMS = "lastUsedEpochMs"
        case portable = "portable"
        case rpID = "rpId"
        case rpName = "rpName"
        case signCount = "signCount"
        case storageKind = "storageKind"
        case userDisplayName = "userDisplayName"
        case userName = "userName"
    }

    public init(createdAtEpochMS: Int, credentialIDB64URL: String, lastUsedEpochMS: Int, portable: Bool, rpID: String, rpName: String, signCount: Int, storageKind: String, userDisplayName: String, userName: String) {
        self.createdAtEpochMS = createdAtEpochMS
        self.credentialIDB64URL = credentialIDB64URL
        self.lastUsedEpochMS = lastUsedEpochMS
        self.portable = portable
        self.rpID = rpID
        self.rpName = rpName
        self.signCount = signCount
        self.storageKind = storageKind
        self.userDisplayName = userDisplayName
        self.userName = userName
    }
}

// MARK: VaultPasskeySummary convenience initializers and mutators

public extension VaultPasskeySummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeySummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdAtEpochMS: Int? = nil,
        credentialIDB64URL: String? = nil,
        lastUsedEpochMS: Int? = nil,
        portable: Bool? = nil,
        rpID: String? = nil,
        rpName: String? = nil,
        signCount: Int? = nil,
        storageKind: String? = nil,
        userDisplayName: String? = nil,
        userName: String? = nil
    ) -> VaultPasskeySummary {
        return VaultPasskeySummary(
            createdAtEpochMS: createdAtEpochMS ?? self.createdAtEpochMS,
            credentialIDB64URL: credentialIDB64URL ?? self.credentialIDB64URL,
            lastUsedEpochMS: lastUsedEpochMS ?? self.lastUsedEpochMS,
            portable: portable ?? self.portable,
            rpID: rpID ?? self.rpID,
            rpName: rpName ?? self.rpName,
            signCount: signCount ?? self.signCount,
            storageKind: storageKind ?? self.storageKind,
            userDisplayName: userDisplayName ?? self.userDisplayName,
            userName: userName ?? self.userName
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialSecret
public struct CredentialSecret: Codable {
    public let credentialID: String
    public let otp: String?
    public let password: String?
    public let username: String

    public enum CodingKeys: String, CodingKey {
        case credentialID = "credential_id"
        case otp = "otp"
        case password = "password"
        case username = "username"
    }

    public init(credentialID: String, otp: String?, password: String?, username: String) {
        self.credentialID = credentialID
        self.otp = otp
        self.password = password
        self.username = username
    }
}

// MARK: CredentialSecret convenience initializers and mutators

public extension CredentialSecret {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialSecret.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        credentialID: String? = nil,
        otp: String?? = nil,
        password: String?? = nil,
        username: String? = nil
    ) -> CredentialSecret {
        return CredentialSecret(
            credentialID: credentialID ?? self.credentialID,
            otp: otp ?? self.otp,
            password: password ?? self.password,
            username: username ?? self.username
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderSessionResponse
public struct CredentialProviderSessionResponse: Codable {
    public let expiresAtMS: Int
    public let providerSession: String

    public enum CodingKeys: String, CodingKey {
        case expiresAtMS = "expires_at_ms"
        case providerSession = "provider_session"
    }

    public init(expiresAtMS: Int, providerSession: String) {
        self.expiresAtMS = expiresAtMS
        self.providerSession = providerSession
    }
}

// MARK: CredentialProviderSessionResponse convenience initializers and mutators

public extension CredentialProviderSessionResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderSessionResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        expiresAtMS: Int? = nil,
        providerSession: String? = nil
    ) -> CredentialProviderSessionResponse {
        return CredentialProviderSessionResponse(
            expiresAtMS: expiresAtMS ?? self.expiresAtMS,
            providerSession: providerSession ?? self.providerSession
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderStatusResponse
public struct CredentialProviderStatusResponse: Codable {
    public let capabilityMatrix: CredentialProviderCapabilityMatrix
    public let commandErrorMap: CredentialProviderCommandErrorMap
    public let enabled: Bool
    public let passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix
    public let vaultOpen: Bool

    public enum CodingKeys: String, CodingKey {
        case capabilityMatrix = "capability_matrix"
        case commandErrorMap = "command_error_map"
        case enabled = "enabled"
        case passkeysLiteStatus = "passkeys_lite_status"
        case vaultOpen = "vault_open"
    }

    public init(capabilityMatrix: CredentialProviderCapabilityMatrix, commandErrorMap: CredentialProviderCommandErrorMap, enabled: Bool, passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix, vaultOpen: Bool) {
        self.capabilityMatrix = capabilityMatrix
        self.commandErrorMap = commandErrorMap
        self.enabled = enabled
        self.passkeysLiteStatus = passkeysLiteStatus
        self.vaultOpen = vaultOpen
    }
}

// MARK: CredentialProviderStatusResponse convenience initializers and mutators

public extension CredentialProviderStatusResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderStatusResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        capabilityMatrix: CredentialProviderCapabilityMatrix? = nil,
        commandErrorMap: CredentialProviderCommandErrorMap? = nil,
        enabled: Bool? = nil,
        passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix? = nil,
        vaultOpen: Bool? = nil
    ) -> CredentialProviderStatusResponse {
        return CredentialProviderStatusResponse(
            capabilityMatrix: capabilityMatrix ?? self.capabilityMatrix,
            commandErrorMap: commandErrorMap ?? self.commandErrorMap,
            enabled: enabled ?? self.enabled,
            passkeysLiteStatus: passkeysLiteStatus ?? self.passkeysLiteStatus,
            vaultOpen: vaultOpen ?? self.vaultOpen
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCapabilityMatrix
public struct CredentialProviderCapabilityMatrix: Codable {
    public let android: CredentialProviderCapability
    public let ios: CredentialProviderCapability
    public let macos: CredentialProviderCapability
    public let windows: CredentialProviderCapability

    public enum CodingKeys: String, CodingKey {
        case android = "android"
        case ios = "ios"
        case macos = "macos"
        case windows = "windows"
    }

    public init(android: CredentialProviderCapability, ios: CredentialProviderCapability, macos: CredentialProviderCapability, windows: CredentialProviderCapability) {
        self.android = android
        self.ios = ios
        self.macos = macos
        self.windows = windows
    }
}

// MARK: CredentialProviderCapabilityMatrix convenience initializers and mutators

public extension CredentialProviderCapabilityMatrix {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCapabilityMatrix.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        android: CredentialProviderCapability? = nil,
        ios: CredentialProviderCapability? = nil,
        macos: CredentialProviderCapability? = nil,
        windows: CredentialProviderCapability? = nil
    ) -> CredentialProviderCapabilityMatrix {
        return CredentialProviderCapabilityMatrix(
            android: android ?? self.android,
            ios: ios ?? self.ios,
            macos: macos ?? self.macos,
            windows: windows ?? self.windows
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCapability
public struct CredentialProviderCapability: Codable {
    public let autofillFallback: Bool
    public let oneTimeCodes: Bool
    public let oneTimeCodesUnsupportedReason: String?
    public let passkeysLite: Bool
    public let passwordProvider: Bool
    public let unsupportedReason: String?

    public enum CodingKeys: String, CodingKey {
        case autofillFallback = "autofill_fallback"
        case oneTimeCodes = "one_time_codes"
        case oneTimeCodesUnsupportedReason = "one_time_codes_unsupported_reason"
        case passkeysLite = "passkeys_lite"
        case passwordProvider = "password_provider"
        case unsupportedReason = "unsupported_reason"
    }

    public init(autofillFallback: Bool, oneTimeCodes: Bool, oneTimeCodesUnsupportedReason: String?, passkeysLite: Bool, passwordProvider: Bool, unsupportedReason: String?) {
        self.autofillFallback = autofillFallback
        self.oneTimeCodes = oneTimeCodes
        self.oneTimeCodesUnsupportedReason = oneTimeCodesUnsupportedReason
        self.passkeysLite = passkeysLite
        self.passwordProvider = passwordProvider
        self.unsupportedReason = unsupportedReason
    }
}

// MARK: CredentialProviderCapability convenience initializers and mutators

public extension CredentialProviderCapability {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCapability.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        autofillFallback: Bool? = nil,
        oneTimeCodes: Bool? = nil,
        oneTimeCodesUnsupportedReason: String?? = nil,
        passkeysLite: Bool? = nil,
        passwordProvider: Bool? = nil,
        unsupportedReason: String?? = nil
    ) -> CredentialProviderCapability {
        return CredentialProviderCapability(
            autofillFallback: autofillFallback ?? self.autofillFallback,
            oneTimeCodes: oneTimeCodes ?? self.oneTimeCodes,
            oneTimeCodesUnsupportedReason: oneTimeCodesUnsupportedReason ?? self.oneTimeCodesUnsupportedReason,
            passkeysLite: passkeysLite ?? self.passkeysLite,
            passwordProvider: passwordProvider ?? self.passwordProvider,
            unsupportedReason: unsupportedReason ?? self.unsupportedReason
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCommandErrorMap
public struct CredentialProviderCommandErrorMap: Codable {
    public let credentialProviderGetOneTimeCode: [String]
    public let credentialProviderGetSecret: [String]
    public let credentialProviderList: [String]
    public let credentialProviderPasskeyCreate: [String]
    public let credentialProviderPasskeyGet: [String]
    public let credentialProviderPasskeyQuery: [String]
    public let credentialProviderRecordUse: [String]
    public let credentialProviderSearch: [String]
    public let credentialProviderSessionClose: [String]
    public let credentialProviderSessionOpen: [String]
    public let credentialProviderStatus: [String]

    public enum CodingKeys: String, CodingKey {
        case credentialProviderGetOneTimeCode = "credential_provider:getOneTimeCode"
        case credentialProviderGetSecret = "credential_provider:getSecret"
        case credentialProviderList = "credential_provider:list"
        case credentialProviderPasskeyCreate = "credential_provider:passkey:create"
        case credentialProviderPasskeyGet = "credential_provider:passkey:get"
        case credentialProviderPasskeyQuery = "credential_provider:passkey:query"
        case credentialProviderRecordUse = "credential_provider:recordUse"
        case credentialProviderSearch = "credential_provider:search"
        case credentialProviderSessionClose = "credential_provider:session:close"
        case credentialProviderSessionOpen = "credential_provider:session:open"
        case credentialProviderStatus = "credential_provider:status"
    }

    public init(credentialProviderGetOneTimeCode: [String], credentialProviderGetSecret: [String], credentialProviderList: [String], credentialProviderPasskeyCreate: [String], credentialProviderPasskeyGet: [String], credentialProviderPasskeyQuery: [String], credentialProviderRecordUse: [String], credentialProviderSearch: [String], credentialProviderSessionClose: [String], credentialProviderSessionOpen: [String], credentialProviderStatus: [String]) {
        self.credentialProviderGetOneTimeCode = credentialProviderGetOneTimeCode
        self.credentialProviderGetSecret = credentialProviderGetSecret
        self.credentialProviderList = credentialProviderList
        self.credentialProviderPasskeyCreate = credentialProviderPasskeyCreate
        self.credentialProviderPasskeyGet = credentialProviderPasskeyGet
        self.credentialProviderPasskeyQuery = credentialProviderPasskeyQuery
        self.credentialProviderRecordUse = credentialProviderRecordUse
        self.credentialProviderSearch = credentialProviderSearch
        self.credentialProviderSessionClose = credentialProviderSessionClose
        self.credentialProviderSessionOpen = credentialProviderSessionOpen
        self.credentialProviderStatus = credentialProviderStatus
    }
}

// MARK: CredentialProviderCommandErrorMap convenience initializers and mutators

public extension CredentialProviderCommandErrorMap {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCommandErrorMap.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        credentialProviderGetOneTimeCode: [String]? = nil,
        credentialProviderGetSecret: [String]? = nil,
        credentialProviderList: [String]? = nil,
        credentialProviderPasskeyCreate: [String]? = nil,
        credentialProviderPasskeyGet: [String]? = nil,
        credentialProviderPasskeyQuery: [String]? = nil,
        credentialProviderRecordUse: [String]? = nil,
        credentialProviderSearch: [String]? = nil,
        credentialProviderSessionClose: [String]? = nil,
        credentialProviderSessionOpen: [String]? = nil,
        credentialProviderStatus: [String]? = nil
    ) -> CredentialProviderCommandErrorMap {
        return CredentialProviderCommandErrorMap(
            credentialProviderGetOneTimeCode: credentialProviderGetOneTimeCode ?? self.credentialProviderGetOneTimeCode,
            credentialProviderGetSecret: credentialProviderGetSecret ?? self.credentialProviderGetSecret,
            credentialProviderList: credentialProviderList ?? self.credentialProviderList,
            credentialProviderPasskeyCreate: credentialProviderPasskeyCreate ?? self.credentialProviderPasskeyCreate,
            credentialProviderPasskeyGet: credentialProviderPasskeyGet ?? self.credentialProviderPasskeyGet,
            credentialProviderPasskeyQuery: credentialProviderPasskeyQuery ?? self.credentialProviderPasskeyQuery,
            credentialProviderRecordUse: credentialProviderRecordUse ?? self.credentialProviderRecordUse,
            credentialProviderSearch: credentialProviderSearch ?? self.credentialProviderSearch,
            credentialProviderSessionClose: credentialProviderSessionClose ?? self.credentialProviderSessionClose,
            credentialProviderSessionOpen: credentialProviderSessionOpen ?? self.credentialProviderSessionOpen,
            credentialProviderStatus: credentialProviderStatus ?? self.credentialProviderStatus
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderPasskeysLiteStatusMatrix
public struct CredentialProviderPasskeysLiteStatusMatrix: Codable {
    public let android: CredentialProviderPasskeysLiteStatus
    public let ios: CredentialProviderPasskeysLiteStatus
    public let macos: CredentialProviderPasskeysLiteStatus
    public let windows: CredentialProviderPasskeysLiteStatus

    public enum CodingKeys: String, CodingKey {
        case android = "android"
        case ios = "ios"
        case macos = "macos"
        case windows = "windows"
    }

    public init(android: CredentialProviderPasskeysLiteStatus, ios: CredentialProviderPasskeysLiteStatus, macos: CredentialProviderPasskeysLiteStatus, windows: CredentialProviderPasskeysLiteStatus) {
        self.android = android
        self.ios = ios
        self.macos = macos
        self.windows = windows
    }
}

// MARK: CredentialProviderPasskeysLiteStatusMatrix convenience initializers and mutators

public extension CredentialProviderPasskeysLiteStatusMatrix {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderPasskeysLiteStatusMatrix.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        android: CredentialProviderPasskeysLiteStatus? = nil,
        ios: CredentialProviderPasskeysLiteStatus? = nil,
        macos: CredentialProviderPasskeysLiteStatus? = nil,
        windows: CredentialProviderPasskeysLiteStatus? = nil
    ) -> CredentialProviderPasskeysLiteStatusMatrix {
        return CredentialProviderPasskeysLiteStatusMatrix(
            android: android ?? self.android,
            ios: ios ?? self.ios,
            macos: macos ?? self.macos,
            windows: windows ?? self.windows
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderPasskeysLiteStatus
public struct CredentialProviderPasskeysLiteStatus: Codable {
    public let create: String
    public let credentialProviderPasskeysLiteStatusGet: String
    public let unsupportedReason: String?

    public enum CodingKeys: String, CodingKey {
        case create = "create"
        case credentialProviderPasskeysLiteStatusGet = "get"
        case unsupportedReason = "unsupported_reason"
    }

    public init(create: String, credentialProviderPasskeysLiteStatusGet: String, unsupportedReason: String?) {
        self.create = create
        self.credentialProviderPasskeysLiteStatusGet = credentialProviderPasskeysLiteStatusGet
        self.unsupportedReason = unsupportedReason
    }
}

// MARK: CredentialProviderPasskeysLiteStatus convenience initializers and mutators

public extension CredentialProviderPasskeysLiteStatus {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderPasskeysLiteStatus.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        create: String? = nil,
        credentialProviderPasskeysLiteStatusGet: String? = nil,
        unsupportedReason: String?? = nil
    ) -> CredentialProviderPasskeysLiteStatus {
        return CredentialProviderPasskeysLiteStatus(
            create: create ?? self.create,
            credentialProviderPasskeysLiteStatusGet: credentialProviderPasskeysLiteStatusGet ?? self.credentialProviderPasskeysLiteStatusGet,
            unsupportedReason: unsupportedReason ?? self.unsupportedReason
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - Helper functions for creating encoders and decoders

func newJSONDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    if #available(iOS 10.0, OSX 10.12, tvOS 10.0, watchOS 3.0, *) {
        decoder.dateDecodingStrategy = .iso8601
    }
    return decoder
}

func newJSONEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    if #available(iOS 10.0, OSX 10.12, tvOS 10.0, watchOS 3.0, *) {
        encoder.dateEncodingStrategy = .iso8601
    }
    return encoder
}
