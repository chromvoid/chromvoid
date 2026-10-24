import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct CredentialOTPModelTests {
  @Test func testEditPreservesSeedAndRejectsDuplicateUncertainSubmission() async throws {
    let store = OTPStore()
    let model = CredentialOTPModel(
      id: "entry", store: store, generation: 7, clipboard: OTPClipboard()
    ) {}
    await model.reload()?.value
    model.beginEdit(store.record)
    model.changeDraft { $0.label = "Renamed" }
    await model.save()?.value
    #expect(store.saved?.secret == nil)
    #expect(store.saved?.sourceLabel == "Main")
    #expect(store.saved?.settings.label == "Renamed")
    #expect(model.mutation == .uncertain)
    #expect(model.save() == nil)
    #expect(store.writes == 1)
    model.revoke()
    #expect(model.draft == nil)
    #expect(model.records.isEmpty)
  }
  @Test func testValidationKeepsDraftAndReloadLeavesUncertainty() async {
    let store = OTPStore()
    let model = CredentialOTPModel(
      id: "entry", store: store, generation: 7, clipboard: OTPClipboard()
    ) {}
    await model.reload()?.value
    model.beginEdit()
    #expect(model.save() == nil)
    #expect(model.invalidField == .label)
    model.changeDraft { $0.label = "" }
    #expect(model.issue != nil)
    model.changeDraft { $0.label = "Main" }
    #expect(model.save() == nil)
    #expect(model.invalidField == .seed)
    // A Base32 length no key has: stopped here, before Core decodes it into other bytes.
    model.changeDraft { $0.seed = "JBSWY3DPEHPK3P" }
    #expect(model.save() == nil)
    #expect(model.save() == nil)
    #expect(model.invalidField == .seed)
    #expect(store.writes == 0)
    model.changeDraft { $0.seed = "jbsw y3dp ehpk 3pxp" }
    await model.save()?.value
    #expect(model.mutation == .uncertain)
    await model.reload()?.value
    #expect(model.mutation == .idle)
    #expect(model.draft == nil)
  }
  @Test func keyWarningStopsTheFirstSaveOnly() async {
    let store = OTPStore()
    let model = CredentialOTPModel(
      id: "entry", store: store, generation: 7, clipboard: OTPClipboard()
    ) {}
    await model.reload()?.value
    model.beginEdit()
    model.changeDraft {
      $0.label = "Main"
      $0.seed = "JBSWY3DPEHPK3PXP"
      $0.encoding = "utf-8"
    }
    #expect(model.save() == nil)
    #expect(model.invalidField == .seed && store.writes == 0)
    // Changing the key or its encoding asks again; saving the same draft keeps it.
    model.changeDraft { $0.encoding = "base64" }
    #expect(model.save() == nil)
    await model.save()?.value
    #expect(store.writes == 1)
    model.revoke()
  }
  @Test func testLateCodeCannotCopyAfterRevocation() async {
    let store = OTPStore()
    let clipboard = OTPClipboard()
    let model = CredentialOTPModel(id: "entry", store: store, generation: 7, clipboard: clipboard) {
    }
    await model.reload()?.value
    let task = model.code("Main", copy: true)
    await store.waitForCode()
    #expect(store.pending != nil)
    model.revoke()
    store.pending?.resume(returning: OtpPreviewResponse(leftSeconds: 30, otp: "123456", period: 30))
    await task?.value
    #expect(clipboard.values.isEmpty)
    #expect(model.shownCode == nil)
    #expect(model.state == .revoked)
  }
  @Test func requestsNextCodeAtPeriodBoundaryWithoutExportingExpiredValue() async {
    let store = OTPStore()
    let clipboard = OTPClipboard()
    let model = CredentialOTPModel(id: "entry", store: store, generation: 7, clipboard: clipboard) {
    }
    await model.reload()?.value
    let task = model.code("Main", copy: true)
    await store.waitForCode()
    store.pending?.resume(returning: OtpPreviewResponse(leftSeconds: 1, otp: "old", period: 30))
    store.pending = nil
    await store.waitForCode()
    #expect(clipboard.values.isEmpty)
    store.pending?.resume(returning: OtpPreviewResponse(leftSeconds: 30, otp: "fresh", period: 30))
    store.pending = nil
    await task?.value
    #expect(clipboard.values == ["fresh"])
    model.revoke()
  }
  @Test func testCodeExpiresAndCopyFetchesFreshValue() async throws {
    let store = OTPStore()
    let clipboard = OTPClipboard()
    let model = CredentialOTPModel(id: "entry", store: store, generation: 7, clipboard: clipboard) {
    }
    await model.reload()?.value
    let task = model.code("Main")
    await store.waitForCode()
    store.pending?.resume(returning: OtpPreviewResponse(leftSeconds: 2, otp: "123456", period: 30))
    store.pending = nil
    await task?.value
    #expect(model.shownCode == "123456")
    await store.waitForCode()
    // The timed refresh keeps the last code on screen until the next one arrives.
    #expect(model.shownCode == "123456")
    #expect(model.loadingCode)
    model.hideCode()
    store.pending?.resume(
      returning: OtpPreviewResponse(leftSeconds: 30, otp: "late refresh", period: 30))
    store.pending = nil
    let copied = model.code("Main", copy: true)
    await store.waitForCode()
    store.pending?.resume(returning: OtpPreviewResponse(leftSeconds: 30, otp: "654321", period: 30))
    store.pending = nil
    await copied?.value
    #expect(clipboard.values == ["654321"])
    #expect(model.shownCode == nil)
    model.revoke()
  }
}
@MainActor
private final class OTPClipboard: CredentialClipboard {
  var values: [String] = []
  func copy(_ value: String) { values.append(value) }
  func clearOwned() { values = [] }
}
@MainActor
private final class OTPStore: CredentialOTPStore {
  let record = CredentialOtpSummary(
    algorithm: "SHA1", counter: nil, digits: 6, encoding: "base32", label: "Main", otpType: "TOTP",
    period: 30)
  var saved: PassmanagerOtpRecordSaveRequest?
  var writes = 0
  var pending: CheckedContinuation<OtpPreviewResponse, Error>?
  private var codeWaiter: CheckedContinuation<Void, Never>?
  func waitForCode() async {
    if pending != nil { return }
    await withCheckedContinuation { codeWaiter = $0 }
  }
  func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse {
    PassmanagerOtpRecordsResponse(records: [record], revision: "revision")
  }
  func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws {
    writes += 1
    saved = request
    throw CredentialStoreError.invalidPage
  }
  func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
  {
    try await withCheckedThrowingContinuation {
      pending = $0
      codeWaiter?.resume()
      codeWaiter = nil
    }
  }
}
