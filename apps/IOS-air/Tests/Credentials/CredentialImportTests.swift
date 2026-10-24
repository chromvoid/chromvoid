import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct CredentialImportTests {
  @Test func importWarningsRemainVisibleBeforeCommitAndClearWithTheReview() async throws {
    let store = ImportStore()
    store.review.preview = store.review.preview.with(
      source: "bitwarden",
      warnings: [
        CredentialImportWarning(code: .unsupportedRecords, count: 2),
        CredentialImportWarning(code: .passkeysOmitted, count: 1),
        CredentialImportWarning(code: .otpInNote, count: 1),
        CredentialImportWarning(code: .cardInNote, count: 1),
        CredentialImportWarning(code: .entryLimit, count: 3),
        CredentialImportWarning(code: .invalidRows, count: 2),
        CredentialImportWarning(code: .unmappedColumns, count: 1),
      ])
    let model = CredentialImportModel(store: store, generation: 1) {}
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json"))))
    await read.value
    #expect(model.state == .review)
    #expect(model.warnings.map(\.count) == [2, 1, 1, 1, 3, 2, 1])
    #expect(
      model.warnings.map(\.message) == [
        "Unsupported records skipped, including SSH keys", "Passkeys are not imported",
        "OTP setup saved in notes; configure codes manually",
        "Incomplete card details saved in notes",
        "Entries beyond the 10,000-item limit skipped",
        "CSV rows with missing fields or invalid data skipped",
        "CSV columns with unrecognized names were not imported",
      ])
    #expect(store.review.commits == 0)
    model.chooseFile()
    #expect(model.warnings.isEmpty)
    #expect(store.review.cancelled)
  }

  @Test func keepassPasswordRetryClearsInputAndOnlyThenAllowsReview() async throws {
    let store = ImportStore()
    store.reviewError = try importFailure("CREDENTIAL_IMPORT_PASSWORD_REQUIRED")
    let model = CredentialImportModel(store: store, generation: 1) {}
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.kdbx"))))
    await read.value
    #expect(model.state == .password)
    #expect(model.requestImport() == nil)
    store.reviewError = try importFailure("CREDENTIAL_IMPORT_PASSWORD_INVALID")
    model.setSourcePassword("incorrect")
    let retry = try #require(model.submitPassword())
    #expect(model.sourcePassword.isEmpty)
    #expect(model.submitPassword() == nil)
    await retry.value
    #expect(model.state == .password)
    #expect(model.issue == "That password could not open the KeePass database. Try again.")
    #expect(store.review.commits == 0)
    store.reviewError = nil
    // An intentionally empty database password must still reach Core.
    let valid = try #require(model.submitPassword())
    await valid.value
    #expect(store.passwords == [nil, "incorrect", ""])
    #expect(model.state == .review)
    #expect(model.sourcePassword.isEmpty)
    #expect(model.issue == nil)
    let commit = try #require(model.requestImport())
    await commit.value
    #expect(store.review.commits == 1)
  }

  @Test func revokingPasswordReviewPurgesInputAndRejectsLateCompletion() async throws {
    let store = ImportStore()
    store.reviewError = try importFailure("CREDENTIAL_IMPORT_PASSWORD_REQUIRED")
    let model = CredentialImportModel(store: store, generation: 1) {}
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.kdbx"))))
    await read.value
    model.setSourcePassword("synthetic password")
    store.reviewError = nil
    store.suspend = true
    let retry = try #require(model.submitPassword())
    await store.started()
    model.revoke()
    store.pending?.resume(returning: store.review)
    store.pending = nil
    await retry.value
    #expect(model.state == .revoked)
    #expect(model.filename.isEmpty)
    #expect(model.sourcePassword.isEmpty)
    #expect(model.preview == nil)
    #expect(model.submitPassword() == nil)
    #expect(store.review.cancelled)
    #expect(store.review.commits == 0)
  }

  private func importFailure(_ code: String) throws -> RPCFailure {
    do {
      _ = try JSONDecoder().decode(
        RPCResult<JSONNull>.self,
        from: JSONSerialization.data(withJSONObject: ["ok": false, "code": code]))
      throw CredentialStoreError.invalidPage
    } catch let failure as RPCFailure { return failure }
  }

  @Test func csvReviewExplainsThatRepeatingMergeAddsNewCredentials() async throws {
    let store = ImportStore()
    store.review.preview = store.review.preview.with(source: "csv")
    let model = CredentialImportModel(store: store, generation: 1) {}
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.csv"))))
    await read.value
    #expect(
      model.reviewExplanation
        == "Importing this CSV again in merge mode adds new credentials, even when names match."
    )
    #expect(store.review.commits == 0)
    model.chooseFile()
    #expect(
      model.reviewExplanation
        == "Counts include supported entries that may update existing credentials.")
  }

  @Test func reviewDoesNotWriteAndReplacementRequiresExplicitConfirmation() async throws {
    let store = ImportStore()
    var completions = 0
    let model = CredentialImportModel(store: store, generation: 7) { completions += 1 }
    model.setReplacing(true)
    model.chooseFile()
    // SwiftUI dismisses the picker binding before delivering its selected URL.
    model.cancelPicker()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json"))))
    await read.value
    #expect(model.state == .review)
    #expect(model.preview?.entryCount == 2)
    #expect(store.review.commits == 0)
    #expect(store.generations == [7])
    #expect(store.modes == [.replace])
    model.setReplacing(false)
    #expect(model.replacing)
    #expect(model.requestImport() == nil)
    #expect(model.state == .confirming)
    model.cancelConfirmation()
    #expect(store.review.commits == 0)
    model.requestImport()
    let commit = try #require(model.confirmReplacement())
    #expect(model.confirmReplacement() == nil)
    #expect(model.requestImport() == nil)
    await commit.value
    #expect(model.state == .finished)
    #expect(store.review.commits == 1)
    #expect(completions == 1)
  }

  @Test func dismissAndLatePreparationCannotKeepAReviewedResource() async throws {
    let store = ImportStore()
    store.suspend = true
    let model = CredentialImportModel(store: store, generation: 8) {
      Issue.record("False completion")
    }
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json"))))
    await store.started()
    model.revoke()
    store.pending?.resume(returning: store.review)
    store.pending = nil
    await read.value
    #expect(model.state == .revoked)
    #expect(model.preview == nil)
    #expect(model.filename.isEmpty)
    #expect(store.review.cancelled)
    #expect(store.review.commits == 0)
  }

  @Test func choosingAnotherFileCancelsThePreviousReviewAndRevokePurgesMetadata() async throws {
    let store = ImportStore()
    let model = CredentialImportModel(store: store, generation: 9) {}
    model.chooseFile()
    let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json"))))
    await read.value
    model.chooseFile()
    #expect(store.review.cancelled)
    #expect(model.preview == nil)
    #expect(model.requestImport() == nil)
    model.cancelPicker()
    #expect(model.state == .choosing)
    model.revoke()
    #expect(model.receiveFile(.success(URL(fileURLWithPath: "/late.json"))) == nil)
  }

  @Test func uncertainCommitNeverRetriesAndConflictRequiresNewReview() async throws {
    let conflict: Error
    do {
      _ = try JSONDecoder().decode(
        RPCResult<JSONNull>.self, from: Data(#"{"ok":false,"code":"SYNC_CONFLICT"}"#.utf8))
      Issue.record("Expected failure")
      return
    } catch { conflict = error }
    for (error, expected) in [
      (conflict, CredentialImportModel.State.failed),
      (CredentialStoreError.invalidPage, .uncertain),
    ] {
      let store = ImportStore()
      store.review.error = error
      let model = CredentialImportModel(store: store, generation: 10) {
        Issue.record("False completion")
      }
      model.chooseFile()
      let read = try #require(model.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json"))))
      await read.value
      let commit = try #require(model.requestImport())
      await commit.value
      #expect(model.state == expected)
      #expect(model.requestImport() == nil)
      #expect(store.review.commits == 1)
      #expect(store.review.cancelled)
    }
  }
}

@MainActor
private final class ImportStore: CredentialImportStore {
  let review = ImportReview()
  var generations: [UInt64] = []
  var modes: [AirImportMode] = []
  var passwords: [String?] = []
  var reviewError: Error?
  var suspend = false
  var pending: CheckedContinuation<any CredentialImportReview, Error>?
  private var startWaiter: CheckedContinuation<Void, Never>?
  func started() async {
    if pending != nil { return }
    await withCheckedContinuation { startWaiter = $0 }
  }
  func reviewCredentialFile(
    _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String?
  ) async throws
    -> any CredentialImportReview
  {
    generations.append(generation)
    modes.append(mode)
    passwords.append(sourcePassword)
    if let reviewError { throw reviewError }
    if !suspend { return review }
    return try await withCheckedThrowingContinuation {
      pending = $0
      startWaiter?.resume()
      startWaiter = nil
    }
  }
}

@MainActor
private final class ImportReview: CredentialImportReview {
  var preview = PassmanagerRootImportPreview(
    createdEntryCount: nil, entryCount: 2, folderCount: 1, mode: "merge", revision: "opaque",
    source: nil, sshKeyCount: 0,
    updatedEntryCount: nil, warnings: nil)
  var commits = 0
  var cancelled = false
  var error: Error?
  func commit() async throws {
    commits += 1
    if let error { throw error }
  }
  func cancel() { cancelled = true }
}
