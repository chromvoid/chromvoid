import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct StorageEraseTests {
  @Test func reviewAndValidationPrecedeDeletionAndWrongPasswordAllowsCorrection() async {
    let store = StorageEraseTestStore()
    var outcomes: [StorageEraseOutcome] = []
    let model = StorageEraseModel(store: store, generation: 4) { outcomes.append($0) }
    #expect(model.submit() == nil)
    await model.prepare()?.value
    #expect(store.generations == [4])
    #expect(model.submit() == nil && model.issue == .acknowledgementRequired)
    model.acknowledge(true)
    #expect(model.submit() == nil && model.issue == .passwordRequired)
    #expect(store.passwords.isEmpty)
    model.changePassword("wrong")
    store.result = .failure(RPCFailure(code: "INVALID_MASTER_PASSWORD"))
    await model.submit()?.value
    #expect(model.state == .ready && model.issue == .invalidPassword)
    #expect(model.password.isEmpty && outcomes.isEmpty && store.cancels == 0)
    model.changePassword("corrected")
    store.result = .success(.completed(erasedBytes: 10, erasedChunks: 1, timeElapsedMs: 1))
    await model.submit()?.value
    #expect(outcomes == [.completed] && store.passwords == ["wrong", "corrected"])
    #expect(model.submit() == nil)
  }

  @Test(arguments: [false, true])
  func actualReceiptOutlivesRevocationAndReleasedScreen(_ incomplete: Bool) async throws {
    let store = StorageEraseTestStore()
    if incomplete {
      store.result = .success(.incomplete(keyCleanupFailed: true, hostCleanupFailed: false))
    }
    store.commitGate.enabled = true
    var outcomes: [StorageEraseOutcome] = []
    var model: StorageEraseModel? = StorageEraseModel(store: store, generation: 4) {
      outcomes.append($0)
    }
    await model?.prepare()?.value
    model?.acknowledge(true)
    model?.changePassword("administrator")
    let task = try #require(model?.submit())
    await store.commitGate.wait()
    #expect(model?.password.isEmpty == true && model?.submit() == nil)
    weak var released = model
    model?.revoke()
    model = nil
    #expect(released == nil)
    store.commitGate.release()
    await task.value
    #expect(outcomes == [incomplete ? .incomplete : .completed])
  }

  @Test(arguments: [false, true])
  func missingReceiptNeverBecomesSuccess(_ unknown: Bool) async throws {
    let store = StorageEraseTestStore()
    store.result =
      unknown ? .failure(StorageEraseCompletionUnknown()) : .failure(BridgeError.SessionRevoked)
    store.commitGate.enabled = true
    var outcomes: [StorageEraseOutcome] = []
    let model = StorageEraseModel(store: store, generation: 4) { outcomes.append($0) }
    await model.prepare()?.value
    model.acknowledge(true)
    model.changePassword("administrator")
    let task = try #require(model.submit())
    await store.commitGate.wait()
    model.revoke()
    store.commitGate.release()
    await task.value
    #expect(outcomes == (unknown ? [.unconfirmed] : []))
    #expect(model.state == .revoked && model.submit() == nil)
  }

  @Test func closingBeforeDispatchPreventsCommitAndLateReviewIsCanceled() async throws {
    let store = StorageEraseTestStore()
    let model = StorageEraseModel(store: store, generation: 4) { _ in
      Issue.record("No erase was started")
    }
    store.reviewGate.enabled = true
    let prepare = try #require(model.prepare())
    await store.reviewGate.wait()
    model.revoke()
    store.reviewGate.release()
    await prepare.value
    #expect(model.state == .revoked && store.cancels == 1)
    let next = StorageEraseModel(store: store, generation: 4) { _ in
      Issue.record("No erase was started")
    }
    await next.prepare()?.value
    next.acknowledge(true)
    next.changePassword("administrator")
    let commit = try #require(next.submit())
    next.revoke()
    await commit.value
    #expect(store.passwords.isEmpty && next.password.isEmpty)
  }
}

@MainActor
final class StorageEraseTestStore: StorageEraseStore, StorageEraseReview {
  let reviewGate = ContactsGate()
  let commitGate = ContactsGate()
  var generations: [UInt64] = []
  var passwords: [String] = []
  var cancels = 0
  var result: Result<AirEraseReceipt, Error> = .success(
    .completed(erasedBytes: 10, erasedChunks: 1, timeElapsedMs: 1))
  func reviewStorageErase(generation: UInt64) async throws -> any StorageEraseReview {
    generations.append(generation)
    await reviewGate.pause()
    return self
  }
  func commit(masterPassword: String) async throws -> AirEraseReceipt {
    passwords.append(masterPassword)
    await commitGate.pause()
    return try result.get()
  }
  func cancel() { cancels += 1 }
}
