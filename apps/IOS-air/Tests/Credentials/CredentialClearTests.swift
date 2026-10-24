import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct CredentialClearTests {
  @Test func clearRequiresConfirmationAndBlocksDuplicateSubmission() async throws {
    let store = ClearStore()
    let clipboard = ClearClipboard()
    var completed = 0
    let model = CredentialClearModel(store: store, generation: 7, clipboard: clipboard) {
      completed += 1
    }
    #expect(model.confirmClear() == nil)
    model.requestClear()
    model.cancelClear()
    #expect(model.state == .ready)
    #expect(store.generations.isEmpty)
    model.requestClear()
    let work = try #require(model.confirmClear())
    await store.started()
    #expect(model.confirmClear() == nil)
    model.cancelClear()
    #expect(model.state == .clearing)
    store.pending?.resume()
    store.pending = nil
    await work.value
    #expect(store.generations == [7])
    #expect(model.state == .finished)
    #expect(clipboard.clears == 1)
    #expect(completed == 1)
    model.requestClear()
    #expect(model.confirmClear() == nil)
  }

  @Test func clearRevocationRejectsLateCompletionAndPurgesTheTask() async throws {
    let store = ClearStore()
    let clipboard = ClearClipboard()
    var completed = false
    let model = CredentialClearModel(store: store, generation: 8, clipboard: clipboard) {
      completed = true
    }
    model.requestClear()
    let work = try #require(model.confirmClear())
    await store.started()
    model.revoke()
    store.pending?.resume()
    store.pending = nil
    await work.value
    #expect(model.state == .revoked)
    #expect(!completed)
    #expect(clipboard.clears == 0)
    model.requestClear()
    #expect(model.confirmClear() == nil)
  }

  @Test func clearFailureDoesNotRetryOrClaimSuccess() async throws {
    let denied: Error
    do {
      _ = try JSONDecoder().decode(
        RPCResult<JSONNull>.self, from: Data(#"{"ok":false,"code":"ACCESS_DENIED"}"#.utf8))
      Issue.record("Expected RPC error")
      return
    } catch { denied = error }
    for (failure, expected) in [
      (denied, CredentialClearModel.State.denied),
      (CredentialStoreError.invalidPage, .uncertain),
      (BridgeError.SessionRevoked, .revoked),
    ] {
      let store = ClearStore()
      let clipboard = ClearClipboard()
      let model = CredentialClearModel(store: store, generation: 9, clipboard: clipboard) {
        Issue.record("False success")
      }
      model.requestClear()
      let work = try #require(model.confirmClear())
      await store.started()
      store.pending?.resume(throwing: failure)
      store.pending = nil
      await work.value
      #expect(model.state == expected)
      #expect(clipboard.clears == 0)
      model.requestClear()
      #expect(model.confirmClear() == nil)
      #expect(store.generations.count == 1)
    }
  }
}

@MainActor
private final class ClearStore: CredentialMaintenanceStore {
  var pending: CheckedContinuation<Void, Error>?
  var generations: [UInt64] = []
  func clearCredentials(generation: UInt64) async throws {
    generations.append(generation)
    try await withCheckedThrowingContinuation { pending = $0 }
  }
  func started() async {
    for _ in 0..<100 where pending == nil { await Task.yield() }
    #expect(pending != nil)
  }
}

@MainActor
private final class ClearClipboard: CredentialClipboard {
  var clears = 0
  func copy(_ value: String) { Issue.record("Clear must not copy anything") }
  func clearOwned() { clears += 1 }
}
