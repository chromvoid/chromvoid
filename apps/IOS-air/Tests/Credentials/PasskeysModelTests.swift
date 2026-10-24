import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct PasskeysModelTests {
  @Test func searchUsesSiteAndAccountAndBackPreservesQuery() async {
    let store = PasskeyTestStore()
    let model = PasskeysModel(store: store, generation: 7)
    await model.reload()?.value
    model.search("БОБ")
    #expect(model.matches.map(\.credentialIDB64URL) == ["second"])
    model.select("second")
    #expect(model.selected?.rpID == "docs.example.test")
    model.closeDetail()
    #expect(model.query == "БОБ" && model.selected == nil)
    model.search("LOGIN.EXAMPLE")
    #expect(model.matches.map(\.credentialIDB64URL) == ["first"])
    model.search("missing")
    #expect(model.matches.isEmpty && model.rows.count == 2)
  }

  @Test func deleteRequiresConfirmationAndRefreshesActualCollection() async throws {
    let store = PasskeyTestStore()
    let model = PasskeysModel(store: store, generation: 7)
    await model.reload()?.value
    model.select("first")
    #expect(model.confirmDelete() == nil)
    model.requestDelete()
    model.cancelDelete()
    #expect(model.confirmDelete() == nil && store.deletions.isEmpty)
    model.requestDelete()
    let task = model.confirmDelete()
    #expect(model.confirmDelete() == nil)
    await task?.value
    #expect(store.deletions == ["first"] && store.generations == [7, 7, 7])
    #expect(model.state == .ready && model.notice == .deleted && model.selected == nil)
    #expect(model.rows.map(\.credentialIDB64URL) == ["second"])
  }

  @Test func missingDeleteAndUncertainWriteNeverFabricateSuccessOrRetry() async {
    let store = PasskeyTestStore()
    let model = PasskeysModel(store: store, generation: 9)
    await model.reload()?.value
    model.select("first")
    store.rows.removeFirst()
    model.requestDelete()
    await model.confirmDelete()?.value
    #expect(model.notice == .missing && model.rows.count == 1)
    model.select("second")
    store.deleteFailure = true
    model.requestDelete()
    await model.confirmDelete()?.value
    #expect(model.state == .uncertain && model.notice == .uncertain && model.rows.isEmpty)
    model.requestDelete()
    #expect(model.confirmDelete() == nil && store.deletions.count == 2)
    await model.reload()?.value
    #expect(model.state == .ready && model.rows.count == 1 && model.notice == nil)
    #expect(store.deletions.count == 2)
  }

  @Test func failedReadCanRetryButRevokedReadCannotRestoreMetadata() async {
    let store = PasskeyTestStore()
    let model = PasskeysModel(store: store, generation: 7)
    store.listFailure = true
    await model.reload()?.value
    #expect(model.state == .failed && model.rows.isEmpty)
    store.listFailure = false
    store.delayList = true
    let task = model.reload()
    await store.waitForList()
    model.search("private account")
    model.revoke()
    store.finishList()
    await task?.value
    #expect(model.state == .revoked && model.rows.isEmpty && model.query.isEmpty)
    #expect(model.reload() == nil)
  }

  @Test func lockDropsLateDeleteAcknowledgementAndDoesNotRefresh() async {
    let store = PasskeyTestStore()
    let model = PasskeysModel(store: store, generation: 7)
    await model.reload()?.value
    model.select("first")
    model.requestDelete()
    store.delayDelete = true
    let task = model.confirmDelete()
    await store.waitForDelete()
    model.revoke()
    store.finishDelete()
    await task?.value
    #expect(model.state == .revoked && model.rows.isEmpty && model.notice == nil)
    #expect(model.selected == nil && !model.confirmingDelete && store.generations.count == 2)
  }
}

@MainActor
private final class PasskeyTestStore: PasskeyStore {
  var rows = [
    VaultPasskeySummary(
      createdAtEpochMS: 1, credentialIDB64URL: "first", lastUsedEpochMS: 0,
      portable: true, rpID: "login.example.test", rpName: "Example Login", signCount: 0,
      storageKind: "vault", userDisplayName: "Alice", userName: "alice@example.test"),
    VaultPasskeySummary(
      createdAtEpochMS: 2, credentialIDB64URL: "second", lastUsedEpochMS: 0,
      portable: true, rpID: "docs.example.test", rpName: "Documents", signCount: 0,
      storageKind: "vault", userDisplayName: "Боб", userName: "bob@example.test"),
  ]
  var generations: [UInt64] = []
  var deletions: [String] = []
  var listFailure = false
  var deleteFailure = false
  var delayList = false
  var delayDelete = false
  private var pendingList: CheckedContinuation<Void, Never>?
  private var pendingDelete: CheckedContinuation<Void, Never>?
  private var listStarted: CheckedContinuation<Void, Never>?
  private var deleteStarted: CheckedContinuation<Void, Never>?

  func listPasskeys(generation: UInt64) async throws -> VaultPasskeysListResponse {
    generations.append(generation)
    if listFailure { throw CredentialStoreError.invalidPage }
    if delayList {
      await withCheckedContinuation {
        pendingList = $0
        listStarted?.resume()
        listStarted = nil
      }
    }
    return VaultPasskeysListResponse(passkeys: rows)
  }
  func deletePasskey(_ request: VaultPasskeyDeleteRequest, generation: UInt64) async throws
    -> VaultPasskeyDeleteResponse
  {
    generations.append(generation)
    deletions.append(request.credentialIDB64URL)
    if deleteFailure { throw CredentialStoreError.catalogChanged }
    if delayDelete {
      await withCheckedContinuation {
        pendingDelete = $0
        deleteStarted?.resume()
        deleteStarted = nil
      }
    }
    let deleted = rows.contains { $0.credentialIDB64URL == request.credentialIDB64URL }
    rows.removeAll { $0.credentialIDB64URL == request.credentialIDB64URL }
    return VaultPasskeyDeleteResponse(deleted: deleted)
  }
  func waitForList() async {
    if pendingList == nil { await withCheckedContinuation { listStarted = $0 } }
  }
  func waitForDelete() async {
    if pendingDelete == nil { await withCheckedContinuation { deleteStarted = $0 } }
  }
  func finishList() {
    pendingList?.resume()
    pendingList = nil
  }
  func finishDelete() {
    pendingDelete?.resume()
    pendingDelete = nil
  }
}
