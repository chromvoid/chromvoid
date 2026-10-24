import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct CredentialOTPImportTests {
  @Test func reviewValidatesInputAndReturnsOnlyAReviewedDraft() async {
    let store = ImportStore()
    var imported: PassmanagerOtpURIResponse?
    let model = CredentialOTPImportModel(store: store, generation: 9) { imported = $0 }
    #expect(model.review() == nil)
    model.changeURI("")
    #expect(model.issue != nil && store.reads == 0)
    model.changeURI("otpauth://supplied")
    await model.review()?.value
    #expect(store.lastURI == "otpauth://supplied" && store.lastGeneration == 9)
    #expect(imported?.settings.label == "Account")
    #expect(imported?.secret == "supplied-key")
    #expect(store.writes == 0)
    #expect(model.uri.isEmpty && model.state == .revoked)
  }
  @Test func cancelledParsingCannotRestoreASecretOrOpenTheDraft() async {
    let store = ImportStore()
    store.delayed = true
    var imports = 0
    let model = CredentialOTPImportModel(store: store, generation: 9) { _ in imports += 1 }
    model.changeURI("supplied secret link")
    let task = model.review()
    await store.waitForRead()
    model.revoke()
    store.pending?.resume(returning: ImportStore.makeResponse())
    store.pending = nil
    await task?.value
    #expect(imports == 0 && model.uri.isEmpty && model.state == .revoked)
  }
  @Test func scanTokensRejectStaleAndDuplicateCallbacks() async throws {
    let store = ImportStore()
    store.delayed = true
    let model = CredentialOTPImportModel(store: store, generation: 9, camera: Camera(.ready)) { _ in
    }
    await model.scan()?.value
    guard case .scanning(let old) = model.state else {
      Issue.record("Expected scanner")
      return
    }
    model.useLink()
    await model.scan()?.value
    guard case .scanning(let current) = model.state else {
      Issue.record("Expected new scanner")
      return
    }
    model.receive("stale", session: old)
    #expect(store.reads == 0 && model.state == .scanning(current))
    model.receive("current", session: current)
    model.receive("duplicate", session: current)
    await store.waitForRead()
    #expect(store.reads == 1 && store.lastURI == "current")
    model.revoke()
    store.pending?.resume(returning: ImportStore.makeResponse())
    store.pending = nil
  }
  @Test func unavailableCameraKeepsManualLinkRoute() async {
    for status in [OTPScanAvailability.denied, .unavailable] {
      let model = CredentialOTPImportModel(
        store: ImportStore(), generation: 9, camera: Camera(status)
      ) { _ in }
      model.changeURI("existing input")
      await model.scan()?.value
      #expect(model.state == .input && model.issue != nil && model.uri == "existing input")
      model.revoke()
    }
  }
}
@MainActor private struct Camera: OTPScanAccess {
  let status: OTPScanAvailability
  init(_ status: OTPScanAvailability) { self.status = status }
  func request() async -> OTPScanAvailability { status }
}
@MainActor private final class ImportStore: CredentialOTPStore {
  nonisolated static func makeResponse() -> sending PassmanagerOtpURIResponse {
    PassmanagerOtpURIResponse(
      account: "Account", issuer: "Service", secret: "supplied-key",
      settings: CredentialOtpSummary(
        algorithm: "SHA1", counter: nil, digits: 6, encoding: "base32", label: "Account",
        otpType: "TOTP", period: 30))
  }
  var delayed = false
  var reads = 0
  var writes = 0
  var lastURI = ""
  var lastGeneration: UInt64?
  var pending: CheckedContinuation<PassmanagerOtpURIResponse, Error>?
  private var readWaiter: CheckedContinuation<Void, Never>?
  func waitForRead() async {
    if pending != nil { return }
    await withCheckedContinuation { readWaiter = $0 }
  }
  func parseOTPURI(_ uri: String, generation: UInt64) async throws -> PassmanagerOtpURIResponse {
    reads += 1
    lastURI = uri
    lastGeneration = generation
    if !delayed { return Self.makeResponse() }
    return try await withCheckedThrowingContinuation {
      pending = $0
      readWaiter?.resume()
      readWaiter = nil
    }
  }
  func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
  { throw CredentialStoreError.invalidPage }
}
