import AirPresentation
import ChromVoidBridge
import Foundation
import Testing
import UIKit

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct CredentialActionsTests {
  @Test(arguments: [
    ("login", "password", "synthetic login secret"),
    ("payment_card", "card_pan", "4111111111111111"),
  ])
  func catalogQuickCopyReadsOnlyTheRequestedPrimaryField(
    kind: String, type: String, value: String
  ) async throws {
    let store = ActionStore()
    store.pageEntries = [summary(kind: kind)]
    store.immediateSecrets = [type: value]
    let clipboard = RecordingClipboard()
    let model = CredentialsModel(store: store, generation: 7, clipboard: clipboard)
    await model.reload()?.value
    #expect(store.secretReads == 0)
    #expect(model.copyPrimarySecret("not-visible") == nil)
    await model.copyPrimarySecret("entry")?.value
    #expect(store.readIDs == ["entry"])
    #expect(store.readTypes == [type])
    #expect(store.copyGenerations == [7])
    #expect(clipboard.values == [value])
    #expect(model.selected == nil)
    guard case .copied("entry", let receipt) = model.quickCopyState else {
      Issue.record("Successful copy must acknowledge the selected row")
      return
    }
    model.clearQuickCopyFeedback(UUID())
    #expect(model.quickCopyState == .copied("entry", receipt))
    model.clearQuickCopyFeedback(receipt)
    #expect(model.quickCopyState == .idle)
    model.coverSensitiveValues()
    #expect(clipboard.clearCount == 0)
    model.revoke()
  }

  @Test(arguments: ["cover", "revoke", "reload", "detail", "selection", "groups"])
  func catalogQuickCopyCannotFinishAfterLeavingItsContext(transition: String) async throws {
    let store = ActionStore()
    store.pageEntries = [summary()]
    let clipboard = RecordingClipboard()
    let model = CredentialsModel(store: store, generation: 7, clipboard: clipboard)
    await model.reload()?.value
    let copying = try #require(model.copyPrimarySecret("entry"))
    await store.waitForSecretRead()
    #expect(model.copyPrimarySecret("entry") == nil)
    switch transition {
    case "cover": model.coverSensitiveValues()
    case "revoke": model.revoke()
    case "reload": await model.reload()?.value
    case "detail": model.select("entry")
    case "selection": model.beginSelection()
    default: model.beginGroups()
    }
    store.secretRead?.resume(returning: "must never reach clipboard")
    store.secretRead = nil
    await copying.value
    #expect(store.secretReads == 1)
    #expect(clipboard.values.isEmpty)
    #expect(model.quickCopyState == .idle)
    model.revoke()
  }

  @Test func canceledQuickCopyCannotOverwriteANewerRequest() async throws {
    let store = ActionStore()
    store.pageEntries = [summary(), summary(id: "second")]
    let clipboard = RecordingClipboard()
    let model = CredentialsModel(store: store, generation: 7, clipboard: clipboard)
    await model.reload()?.value
    let first = try #require(model.copyPrimarySecret("entry"))
    await store.waitForSecretRead()
    let firstRead = try #require(store.secretRead)
    store.secretRead = nil
    model.cancelQuickCopy()
    let second = try #require(model.copyPrimarySecret("second"))
    await store.waitForSecretRead()
    firstRead.resume(returning: "stale secret")
    await first.value
    #expect(model.quickCopyState == .loading("second"))
    #expect(clipboard.values.isEmpty)
    store.secretRead?.resume(returning: "current secret")
    store.secretRead = nil
    await second.value
    #expect(clipboard.values == ["current secret"])
    model.revoke()
  }

  @Test func quickCopyFailurePreservesClipboardAndAllowsExplicitRetry() async throws {
    let store = ActionStore()
    store.pageEntries = [summary(), summary(id: "unknown-type", kind: "future")]
    store.secretErrors["password"] = try rpcFailure("ACCESS_DENIED")
    let clipboard = RecordingClipboard()
    let model = CredentialsModel(store: store, generation: 7, clipboard: clipboard)
    await model.reload()?.value
    #expect(model.copyPrimarySecret("unknown-type") == nil)
    await model.copyPrimarySecret("entry")?.value
    guard case .failed("entry", let denialMessage) = model.quickCopyState else {
      Issue.record("Denied field access must be reported on the selected row")
      return
    }
    #expect(!denialMessage.isEmpty)
    #expect(clipboard.values.isEmpty)
    store.secretErrors = [:]
    store.immediateSecrets = ["password": ""]
    await model.copyPrimarySecret("entry")?.value
    guard case .failed("entry", let emptyMessage) = model.quickCopyState else {
      Issue.record("An empty field must not be acknowledged as copied")
      return
    }
    #expect(!emptyMessage.isEmpty)
    #expect(emptyMessage != denialMessage)
    #expect(clipboard.values.isEmpty)
    store.immediateSecrets = ["password": "retry secret"]
    await model.copyPrimarySecret("entry")?.value
    #expect(clipboard.values == ["retry secret"])
    store.secretErrors["password"] = BridgeError.SessionRevoked
    await model.copyPrimarySecret("entry")?.value
    #expect(model.state == .revoked)
    #expect(model.quickCopyState == .idle)
    #expect(clipboard.values == ["retry secret"])
    #expect(model.copyPrimarySecret("entry") == nil)
  }

  private func summary(id: String = "entry", kind: String = "login") -> CredentialSummary {
    CredentialSummary(
      entryType: kind, groupKey: nil, groupPath: "/", hasCodes: false, iconRef: nil, id: id,
      title: "Synthetic credential", username: "alice", website: nil)
  }

  /// What the copy-all action used to guard: one secret read at a time, and a revoked page
  /// cannot let a late one reach the clipboard.
  @Test func aSecretReadInFlightBlocksAnotherAndCannotOutliveRevocation() async throws {
    let store = ActionStore()
    let clipboard = RecordingClipboard()
    let model = CredentialDetailModel(
      id: "entry", store: store, generation: 7, clipboard: clipboard
    ) {}
    await model.reload()?.value
    let copying = try #require(model.copySecret("password"))
    await store.waitForSecretRead()
    #expect(model.loadingSecret == "password")
    #expect(model.copySecret("note") == nil)
    #expect(model.beginEditing() == nil)
    #expect(model.editor == nil)
    model.revoke()
    store.secretRead?.resume(returning: "late password")
    store.secretRead = nil
    await copying.value
    #expect(store.secretReads == 1)
    #expect(clipboard.values.isEmpty)
    #expect(model.secrets.isEmpty)
  }

  @Test func batchDeletionRequiresConfirmationAndReportsPartialResultsWithoutRetry() async throws {
    let store = ActionStore()
    let clipboard = RecordingClipboard()
    let model = CredentialSelectionModel(store: store, generation: 7, clipboard: clipboard)
    defer { model.revoke() }
    let ids = ["deleted", "absent", "denied", "unknown", "unattempted"]
    for id in ids {
      model.toggle(
        CredentialSummary(
          entryType: "login", groupKey: nil, groupPath: "/", hasCodes: false, iconRef: nil, id: id,
          title: id, username: "", website: nil))
    }
    store.deleteErrors = [
      "absent": try rpcFailure("NODE_NOT_FOUND"),
      "denied": try rpcFailure("ACCESS_DENIED"),
      "unknown": CredentialStoreError.invalidPage,
    ]
    #expect(model.confirmDeletion() == nil)
    model.requestDeletion()
    model.cancelDeletion()
    #expect(store.deletedIDs.isEmpty)
    #expect(model.chosen.map(\.id) == ids)
    model.requestDeletion()
    let deleting = try #require(model.confirmDeletion())
    #expect(model.confirmDeletion() == nil)
    await deleting.value
    #expect(model.state == .finished)
    #expect(model.results.map(\.id) == ids)
    #expect(
      model.results.map(\.outcome) == [.deleted, .absent, .denied, .unconfirmed, .notAttempted])
    #expect(model.deletedCount == 1)
    #expect(model.needsCheck)
    #expect(store.deletedIDs == Array(ids.prefix(4)))
    #expect(store.deleteGenerations == [7, 7, 7, 7])
    #expect(clipboard.clearCount == 1)
    model.requestDeletion()
    #expect(model.confirmDeletion() == nil)
  }

  @Test func revokedBatchCannotContinueOrRestoreResultsAndClipboard() async throws {
    let store = ActionStore()
    store.delayDeletion = true
    let clipboard = RecordingClipboard()
    let model = CredentialSelectionModel(store: store, generation: 7, clipboard: clipboard)
    for id in ["first", "second"] {
      model.toggle(
        CredentialSummary(
          entryType: "login", groupKey: nil, groupPath: "/", hasCodes: false, iconRef: nil, id: id,
          title: id, username: "", website: nil))
    }
    model.requestDeletion()
    let deleting = try #require(model.confirmDeletion())
    await store.waitForDeletion()
    model.revoke()
    store.deleteContinuation?.resume()
    store.deleteContinuation = nil
    await deleting.value
    #expect(store.deletedIDs == ["first"])
    #expect(model.state == .revoked)
    #expect(model.chosen.isEmpty)
    #expect(model.results.isEmpty)
    #expect(clipboard.clearCount == 0)
  }

  @Test func explicitCopyDoesNotRevealAndRevokedReadCannotOverwriteClipboard() async throws {
    let store = ActionStore()
    let clipboard = RecordingClipboard()
    let model = CredentialDetailModel(
      id: "entry", store: store, generation: 7, clipboard: clipboard
    ) {}
    await model.reload()?.value
    #expect(store.secretReads == 0)
    model.copyMetadata(.username)
    #expect(clipboard.values == ["alice"])
    let copying = try #require(model.copySecret("password"))
    await store.waitForSecretRead()
    store.secretRead?.resume(returning: "synthetic password")
    store.secretRead = nil
    await copying.value
    #expect(clipboard.values == ["alice", "synthetic password"])
    #expect(model.secrets.isEmpty)
    #expect(model.copyFeedback != nil)

    let late = try #require(model.copySecret("password"))
    await store.waitForSecretRead()
    model.revoke()
    store.secretRead?.resume(returning: "late secret")
    store.secretRead = nil
    await late.value
    #expect(clipboard.values == ["alice", "synthetic password"])
    #expect(model.copyFeedback == nil)
    #expect(model.detail == nil)
  }

  @Test func coverCancelsPendingCopyWithoutClearingAnExplicitExport() async throws {
    let store = ActionStore()
    let clipboard = RecordingClipboard()
    let model = CredentialDetailModel(
      id: "entry", store: store, generation: 7, clipboard: clipboard
    ) {}
    await model.reload()?.value
    model.copyMetadata(.username)
    let copying = try #require(model.copySecret("note"))
    await store.waitForSecretRead()
    model.hideSecrets()
    store.secretRead?.resume(returning: "covered value")
    store.secretRead = nil
    await copying.value
    #expect(clipboard.values == ["alice"])
    #expect(clipboard.clearCount == 0)
  }

  @Test func deletionRequiresConfirmationAndDoesNotRepeatAnUncertainMutation() async throws {
    let store = ActionStore()
    let clipboard = RecordingClipboard()
    var mutations = 0
    var deleted = 0
    let model = CredentialDetailModel(
      id: "entry", store: store, generation: 7, clipboard: clipboard,
      onDelete: { deleted += 1 }, onMutation: { mutations += 1 })
    await model.reload()?.value
    #expect(model.confirmDeletion() == nil)
    model.requestDeletion()
    model.cancelDeletion()
    #expect(store.deletedIDs.isEmpty)
    #expect(model.deletion == .idle)

    store.deleteError = CredentialStoreError.invalidPage
    model.requestDeletion()
    let deleting = try #require(model.confirmDeletion())
    #expect(model.confirmDeletion() == nil)
    #expect(!model.canInteract)
    await deleting.value
    #expect(model.deletion == .uncertain)
    model.requestDeletion()
    #expect(model.confirmDeletion() == nil)
    #expect(store.deletedIDs == ["entry"])
    #expect(deleted == 0)
    #expect(mutations == 1)

    store.deleteError = nil
    await model.reload()?.value
    model.requestDeletion()
    await model.confirmDeletion()?.value
    #expect(store.deletedIDs == ["entry", "entry"])
    #expect(deleted == 1)
    #expect(model.detail == nil)
    #expect(clipboard.clearCount == 1)
  }

  @Test func revokedDeletionCannotNavigateOrClearLaterClipboard() async throws {
    let store = ActionStore()
    store.delayDeletion = true
    let clipboard = RecordingClipboard()
    var deleted = false
    let model = CredentialDetailModel(
      id: "entry", store: store, generation: 7, clipboard: clipboard,
      onDelete: { deleted = true }, onMutation: {})
    await model.reload()?.value
    model.requestDeletion()
    let operation = try #require(model.confirmDeletion())
    await store.waitForDeletion()
    model.revoke()
    store.deleteContinuation?.resume()
    store.deleteContinuation = nil
    await operation.value
    #expect(!deleted)
    #expect(clipboard.clearCount == 0)
    #expect(model.state == .revoked)
    #expect(model.detail == nil)
  }

  @Test func deniedAndMissingDeletionsKeepDistinctRecoveryStates() async throws {
    let store = ActionStore()
    let model = CredentialDetailModel(id: "entry", store: store, generation: 7) {}
    await model.reload()?.value
    store.deleteError = try rpcFailure("ACCESS_DENIED")
    model.requestDeletion()
    await model.confirmDeletion()?.value
    #expect(model.deletion == .denied)
    #expect(model.detail?.id == "entry")
    store.deleteError = try rpcFailure("NODE_NOT_FOUND")
    model.requestDeletion()
    await model.confirmDeletion()?.value
    #expect(model.state == .missing)
    #expect(model.detail == nil)
  }

  private func rpcFailure(_ code: String) throws -> RPCFailure {
    let data = try JSONSerialization.data(withJSONObject: ["ok": false, "code": code])
    do {
      _ = try JSONDecoder().decode(RPCResult<JSONNull>.self, from: data)
      throw CredentialStoreError.invalidPage
    } catch let error as RPCFailure { return error }
  }

  @Test func nativePasteboardCleanupPreservesLaterForeignContentAndExpires() async throws {
    let board = UIPasteboard.withUniqueName()
    defer { UIPasteboard.remove(withName: board.name) }
    let clipboard = SystemCredentialClipboard(pasteboard: board)
    clipboard.copy("synthetic пароль")
    #expect(board.string == "synthetic пароль")
    board.string = "later foreign item"
    clipboard.clearOwned()
    #expect(board.string == "later foreign item")
    clipboard.copy("new owned item")
    clipboard.clearOwned()
    #expect(board.numberOfItems == 0)

    // Keep the production 15-second duration; move the injected wall clock so the
    // real OS deadline is near. No scheduler timer in the subject owns expiration.
    let expiring = SystemCredentialClipboard(
      pasteboard: board, now: { Date().addingTimeInterval(-14) })
    expiring.copy("expires through UIKit")
    #expect(board.string == "expires through UIKit")
    let deadline = ContinuousClock.now.advanced(by: .seconds(5))
    while board.numberOfItems != 0, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(25))
    }
    #expect(board.numberOfItems == 0)
  }
}

@MainActor
private final class RecordingClipboard: CredentialClipboard {
  var values: [String] = []
  var clearCount = 0
  func copy(_ value: String) { values.append(value) }
  func clearOwned() { clearCount += 1 }
}

@MainActor
private final class ActionStore: CredentialStore {
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  { throw CredentialStoreError.invalidPage }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  var card = false
  var immediateSecrets: [String: String]?
  var secretErrors: [String: any Error] = [:]
  var readTypes: [String] = []
  var copyGenerations: [UInt64] = []
  var includeOTP = false
  var otpFailure: (any Error)?
  var codeLabels: [String] = []
  func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse {
    if let otpFailure { throw otpFailure }
    copyGenerations.append(generation)
    let records =
      includeOTP
      ? ["First code", "Second code"].map {
        CredentialOtpSummary(
          algorithm: "SHA1", counter: nil, digits: 6, encoding: "base32", label: $0,
          otpType: "totp", period: 30)
      } : []
    return PassmanagerOtpRecordsResponse(records: records, revision: "otp-revision")
  }
  func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
  {
    copyGenerations.append(generation)
    codeLabels.append(request.label)
    return OtpPreviewResponse(leftSeconds: 30, otp: "123456", period: 30)
  }
  var pageEntries: [CredentialSummary]?
  var readIDs: [String] = []
  var secretReads = 0
  var secretRead: CheckedContinuation<String, any Error>?
  private var readStarted: CheckedContinuation<Void, Never>?
  var deletedIDs: [String] = []
  var deleteGenerations: [UInt64] = []
  var deleteErrors: [String: any Error] = [:]
  var deleteError: (any Error)?
  var delayDeletion = false
  var deleteContinuation: CheckedContinuation<Void, Never>?
  private var deleteStarted: CheckedContinuation<Void, Never>?

  func waitForDeletion() async {
    if deleteContinuation != nil { return }
    await withCheckedContinuation { deleteStarted = $0 }
  }

  func waitForSecretRead() async {
    if secretRead != nil { return }
    await withCheckedContinuation { readStarted = $0 }
  }
  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    CredentialDetail(
      entryType: card ? "payment_card" : "login", groupPath: "/", id: id,
      paymentCard: card
        ? PaymentCardMetadata(
          brand: "visa", cardholderName: "Alice Cardholder", expMonth: 12, expYear: 2030,
          last4: "1111") : nil,
      revision: "revision", tagKeys: [], tags: [],
      title: card ? "Synthetic card" : "Synthetic login", username: "alice",
      websites: ["https://example.org"], websitesEditable: true)
  }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    secretReads += 1
    readIDs.append(id)
    readTypes.append(type)
    copyGenerations.append(generation)
    if let error = secretErrors[type] { throw error }
    if let immediateSecrets { return immediateSecrets[type] ?? "" }
    return try await withCheckedThrowingContinuation {
      secretRead = $0
      readStarted?.resume()
      readStarted = nil
    }
  }
  func deleteCredential(id: String, generation: UInt64) async throws {
    deletedIDs.append(id)
    deleteGenerations.append(generation)
    if delayDeletion {
      await withCheckedContinuation {
        deleteContinuation = $0
        deleteStarted?.resume()
        deleteStarted = nil
      }
    }
    if let error = deleteErrors[id] ?? deleteError { throw error }
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  {
    throw CredentialStoreError.invalidPage
  }
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
  {
    guard let pageEntries else { throw CredentialStoreError.invalidPage }
    return PassmanagerEntryPageResponse(entries: pageEntries, nextOffset: nil, totalCount: nil)
  }
}
