import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct PasswordMaintenanceTests {
  @Test func submitExplainsInvalidFieldsBeforeIssuingAnyMutation() {
    let store = MaintenanceTestStore()
    let model = PasswordMaintenanceModel(kind: .vault, store: store, generation: 4)
    #expect(model.submit() == nil && model.issue == .currentRequired)
    model.change(.current, value: "current")
    #expect(model.submit() == nil && model.issue == .newRequired)
    model.change(.newPassword, value: "current")
    #expect(model.submit() == nil && model.issue == .samePassword)
    model.change(.newPassword, value: "replacement")
    #expect(model.submit() == nil && model.issue == .mismatch)
    #expect(store.vaultRequests.isEmpty && store.masterRequests.isEmpty)
  }

  @Test(arguments: [PasswordMaintenanceModel.Kind.vault, .administrator])
  func confirmedChangeUsesOneCapturedRequestAndClearsInputs(_ kind: PasswordMaintenanceModel.Kind)
    async throws
  {
    let store = MaintenanceTestStore()
    let model = ready(kind, store)
    store.gate.enabled = true
    let task = try #require(model.submit())
    await store.gate.wait()
    #expect(model.state == .working && model.currentPassword.isEmpty && model.submit() == nil)
    model.change(.newPassword, value: "ignored during mutation")
    store.gate.release()
    await task.value
    #expect(model.state == .completed && model.backupRecommended && store.generations == [4])
    #expect(model.newPassword.isEmpty && model.confirmation.isEmpty)
    switch kind {
    case .vault:
      #expect(store.vaultRequests.count == 1 && store.masterRequests.isEmpty)
      #expect(store.vaultRequests[0].currentPassword == "current")
      #expect(store.vaultRequests[0].newPassword == "replacement")
    case .administrator:
      #expect(store.masterRequests.count == 1 && store.vaultRequests.isEmpty)
      #expect(store.masterRequests[0].currentPassword == "current")
      #expect(store.masterRequests[0].newMasterPassword == "replacement")
    }
    #expect(model.submit() == nil)
  }

  @Test func definiteReauthenticationFailureAllowsCorrectionButUnknownOutcomeCannotRetry()
    async
  {
    let store = MaintenanceTestStore()
    store.failure = "REKEY_INVALID_CURRENT_PASSWORD"
    let model = ready(.vault, store)
    await model.submit()?.value
    #expect(model.state == .editing && model.issue == .reauthentication)
    #expect(model.currentPassword.isEmpty && model.newPassword == "replacement")
    model.change(.current, value: "corrected")
    store.failure = "INTERNAL_ERROR"
    await model.submit()?.value
    #expect(model.state == .uncertain && !model.backupRecommended)
    #expect(
      model.currentPassword.isEmpty && model.newPassword.isEmpty && model.confirmation.isEmpty)
    model.change(.current, value: "must not become a retry")
    #expect(model.submit() == nil && store.vaultRequests.count == 2)
  }

  @Test func revocationClearsSecretsAndRejectsLateCompletion() async throws {
    let store = MaintenanceTestStore()
    let model = ready(.administrator, store)
    store.gate.enabled = true
    let task = try #require(model.submit())
    await store.gate.wait()
    model.revoke()
    #expect(
      model.currentPassword.isEmpty && model.newPassword.isEmpty && model.confirmation.isEmpty)
    store.gate.release()
    await task.value
    #expect(model.state == .revoked && !model.backupRecommended && model.submit() == nil)
  }

  private func ready(_ kind: PasswordMaintenanceModel.Kind, _ store: MaintenanceTestStore)
    -> PasswordMaintenanceModel
  {
    let model = PasswordMaintenanceModel(kind: kind, store: store, generation: 4)
    model.change(.current, value: "current")
    model.change(.newPassword, value: "replacement")
    model.change(.confirmation, value: "replacement")
    return model
  }
}

@MainActor
private final class MaintenanceTestStore: MaintenanceStore {
  var vaultRequests: [VaultRekeyRequest] = []
  var masterRequests: [MasterRekeyRequest] = []
  var generations: [UInt64] = []
  var failure: String?
  let gate = ContactsGate()

  func rekeyVault(_ request: VaultRekeyRequest, generation: UInt64) async throws
    -> VaultRekeyResponse
  {
    vaultRequests.append(request)
    generations.append(generation)
    await gate.pause()
    if let failure { throw RPCFailure(code: failure) }
    return VaultRekeyResponse(
      backupRecommended: true, deletedDerivativeChunks: 0, deletedOldChunks: 3,
      durationMS: 1, migratedChunks: 3, preservedUnknownChunks: 0)
  }
  func rekeyMaster(_ request: MasterRekeyRequest, generation: UInt64) async throws
    -> MasterRekeyResponse
  {
    masterRequests.append(request)
    generations.append(generation)
    await gate.pause()
    if let failure { throw RPCFailure(code: failure) }
    return MasterRekeyResponse(backupRecommended: true, rewrappedArtifacts: ["master.verify"])
  }
}

@Suite @MainActor
struct StorageBackupModelTests {
  @Test func validationAndConfirmedSavePreserveExactInputs() async throws {
    let store = BackupModelStore()
    let model = StorageBackupModel(store: store, generation: 7)
    #expect(model.submit() == nil && model.issue == .directoryRequired)
    model.selectDirectory(store.directory)
    #expect(model.submit() == nil && model.issue == .passwordRequired)
    model.changePassword(" exact password ")
    store.gate.enabled = true
    let task = try #require(model.submit())
    await store.gate.wait()
    #expect(model.password.isEmpty && model.submit() == nil)
    #expect(store.password == " exact password " && store.generation == 7)
    #expect(store.selectedDirectory == store.directory)
    #expect(model.progress?.completedBytes == 2)
    store.gate.release()
    await task.value
    #expect(model.state == .completed && model.savedDirectory == store.output)
    #expect(model.submit() == nil && store.calls == 1)
  }

  @Test(arguments: [false, true])
  func cancellationWaitsForCleanupBeforeAllowingRetry(rustCancellation: Bool) async throws {
    let store = BackupModelStore()
    let model = ready(store)
    store.gate.enabled = true
    if rustCancellation {
      store.failure = BridgeError.RequestCanceled
    } else {
      store.failure = CancellationError()
    }
    let task = try #require(model.submit())
    await store.gate.wait()
    model.cancel()
    #expect(model.state == .cancelling && model.submit() == nil)
    store.gate.release()
    await task.value
    #expect(model.state == .editing && model.issue == nil && model.password.isEmpty)
    store.gate.enabled = false
    store.failure = nil
    model.changePassword("retry")
    await model.submit()?.value
    #expect(model.state == .completed && store.calls == 2)
  }

  @Test func failureExplainsReauthenticationAndUnremovedOutput() async {
    let store = BackupModelStore()
    let model = ready(store)
    store.failure = RPCFailure(code: "INVALID_MASTER_PASSWORD")
    await model.submit()?.value
    #expect(model.issue == .reauthentication && model.state == .editing && model.password.isEmpty)
    store.failure = StorageBackupCleanupFailure(
      folderName: "unfinished", cause: CancellationError(),
      cleanupError: CocoaError(.fileWriteNoPermission))
    model.changePassword("retry")
    await model.submit()?.value
    #expect(model.issue == .cleanupFailed("unfinished") && model.savedDirectory == nil)
  }

  @Test func revocationSuppressesLateProgressAndSuccess() async throws {
    let store = BackupModelStore()
    let model = ready(store)
    store.gate.enabled = true
    let task = try #require(model.submit())
    await store.gate.wait()
    model.revoke()
    store.gate.release()
    await task.value
    #expect(model.state == .revoked && model.savedDirectory == nil && model.progress == nil)
    #expect(model.directory == nil && model.password.isEmpty && model.submit() == nil)
  }

  private func ready(_ store: BackupModelStore) -> StorageBackupModel {
    let model = StorageBackupModel(store: store, generation: 7)
    model.selectDirectory(store.directory)
    model.changePassword("synthetic")
    return model
  }
}

@MainActor
private final class BackupModelStore: StorageBackupStore {
  let directory = URL(fileURLWithPath: "/synthetic-backups")
  var output: URL { directory.appendingPathComponent("completed") }
  let gate = ContactsGate()
  var calls = 0
  var password: String?
  var generation: UInt64?
  var selectedDirectory: URL?
  var failure: Error?

  func saveStorageBackup(
    to directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageBackupProgress) -> Void
  ) async throws -> URL {
    calls += 1
    password = masterPassword
    self.generation = generation
    selectedDirectory = directory
    progress(StorageBackupProgress(completedBytes: 2, totalBytes: 4))
    await gate.pause()
    progress(StorageBackupProgress(completedBytes: 4, totalBytes: 4))
    if let failure { throw failure }
    return output
  }
}

@Suite @MainActor
struct StorageRestoreModelTests {
  @Test func reviewRequiresInputsAndExplicitConsumingConfirmation() async throws {
    let store = RestoreModelStore()
    var restored = 0
    let model = StorageRestoreModel(store: store, generation: 9, onRestored: { restored += 1 })
    #expect(model.submit() == nil && model.issue == .directoryRequired)
    model.selectDirectory(store.directory)
    #expect(model.submit() == nil && model.issue == .passwordRequired)
    model.changePassword(" exact source password ")
    store.gate.enabled = true
    let work = try #require(model.submit())
    await store.gate.wait()
    #expect(model.password.isEmpty && model.submit() == nil)
    #expect(store.password == " exact source password " && store.generation == 9)
    #expect(store.selectedDirectory == store.directory && model.progress?.completedBytes == 2)
    #expect(model.confirmRestore() == nil && store.review.commits == 0)
    store.gate.release()
    await work.value
    #expect(model.state == .review && model.preview == store.review.preview)
    #expect(model.directory == nil && model.progress == nil && restored == 0)
    store.review.commitGate.enabled = true
    let commit = try #require(model.confirmRestore())
    await store.review.commitGate.wait()
    #expect(model.confirmRestore() == nil && model.cancel() == nil)
    store.review.commitGate.release()
    await commit.value
    #expect(model.state == .completed && restored == 1 && model.preview == nil)
    #expect(store.review.commits == 1 && store.review.closes == 1)
  }

  @Test(arguments: [false, true])
  func cancelledOrRevokedReviewReleasesLateResult(revoked: Bool) async throws {
    let store = RestoreModelStore()
    let model = ready(store)
    store.gate.enabled = true
    let work = try #require(model.submit())
    await store.gate.wait()
    if revoked { model.revoke() } else { model.cancel() }
    #expect(model.submit() == nil)
    store.gate.release()
    await work.value
    #expect(model.state == (revoked ? .revoked : .editing))
    #expect(model.preview == nil && model.password.isEmpty && model.progress == nil)
    #expect(store.review.cancels == 1 && store.review.closes == 1 && store.review.commits == 0)
  }

  @Test func cancellingReviewedBackupWaitsForCleanup() async throws {
    let store = RestoreModelStore()
    let model = ready(store)
    await model.submit()?.value
    store.review.closeGate.enabled = true
    let cancel = try #require(model.cancel())
    await store.review.closeGate.wait()
    #expect(model.state == .cancelling && model.submit() == nil && model.preview == nil)
    store.review.closeGate.release()
    await cancel.value
    #expect(model.state == .editing && store.review.commits == 0)
  }

  @Test func wrongPasswordAllowsFreshReviewButUnknownCommitCannotRetry() async {
    let store = RestoreModelStore()
    let model = ready(store)
    store.failure = RPCFailure(code: "INVALID_BACKUP")
    await model.submit()?.value
    #expect(model.state == .editing && model.issue == .invalidBackup && model.password.isEmpty)
    store.failure = nil
    model.changePassword("retry")
    await model.submit()?.value
    store.review.failure = BridgeError.RuntimeUnavailable
    await model.confirmRestore()?.value
    #expect(model.state == .uncertain && model.preview == nil)
    #expect(model.confirmRestore() == nil && model.submit() == nil && store.calls == 2)
    #expect(store.review.commits == 1 && store.review.closes == 1)
  }

  @Test func revocationDuringCommitSuppressesLateSuccess() async throws {
    let store = RestoreModelStore()
    var restored = false
    let model = StorageRestoreModel(store: store, generation: 9, onRestored: { restored = true })
    model.selectDirectory(store.directory)
    model.changePassword("synthetic")
    await model.submit()?.value
    store.review.commitGate.enabled = true
    let work = try #require(model.confirmRestore())
    await store.review.commitGate.wait()
    model.revoke()
    store.review.commitGate.release()
    await work.value
    #expect(model.state == .revoked && !restored && model.preview == nil)
    #expect(store.review.cancels == 1 && store.review.closes == 1)
  }

  private func ready(_ store: RestoreModelStore) -> StorageRestoreModel {
    let model = StorageRestoreModel(store: store, generation: 9, onRestored: {})
    model.selectDirectory(store.directory)
    model.changePassword("synthetic")
    return model
  }
}

@MainActor
private final class RestoreModelStore: StorageRestoreStore {
  let directory = URL(fileURLWithPath: "/synthetic-restore")
  let gate = ContactsGate()
  let review = RestoreModelReview()
  var failure: Error?
  var calls = 0
  var password: String?
  var generation: UInt64?
  var selectedDirectory: URL?
  func reviewStorageBackup(
    at directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageRestoreProgress) -> Void
  ) async throws -> any StorageRestoreReview {
    calls += 1
    password = masterPassword
    self.generation = generation
    selectedDirectory = directory
    progress(StorageRestoreProgress(completedBytes: 2, totalBytes: 4))
    await gate.pause()
    progress(StorageRestoreProgress(completedBytes: 4, totalBytes: 4))
    if let failure { throw failure }
    return review
  }
}

@MainActor
private final class RestoreModelReview: StorageRestoreReview {
  let preview = AirRestorePreview(version: 1, chunkCount: 3, byteCount: 200_000)
  let commitGate = ContactsGate()
  let closeGate = ContactsGate()
  var commits = 0
  var cancels = 0
  var closes = 0
  var failure: Error?
  func commit() async throws {
    commits += 1
    await commitGate.pause()
    if let failure { throw failure }
  }
  func cancel() { cancels += 1 }
  func close() async throws {
    closes += 1
    await closeGate.pause()
  }
}
