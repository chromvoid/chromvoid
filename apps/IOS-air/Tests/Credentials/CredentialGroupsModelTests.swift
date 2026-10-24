import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct CredentialGroupsModelTests {
  @Test func navigationDiscardsSupersededPagesAndRevocationPurgesHierarchy() async throws {
    let store = GroupProbe()
    let model = CredentialGroupsModel(
      store: store, generation: 9, onChoose: { _ in }, onMutation: {})
    await model.reload()?.value
    #expect(model.groups.map(\.path) == ["/Work"])
    store.delayRead = true
    let old = try #require(model.reload())
    await store.waitForRead()
    store.delayRead = false
    model.browse("/Work")
    await model.reload()?.value
    store.pendingRead?.resume()
    store.pendingRead = nil
    await old.value
    #expect(model.path == "/Work")
    #expect(model.groups.map(\.path) == ["/Work/Nested"])
    model.revoke()
    model.browse("/")
    #expect(model.state == .revoked)
    #expect(model.groups.isEmpty)
  }

  @Test func groupValidationCancelAndUncertainMutationRequireAuthoritativeReload() async throws {
    let store = GroupProbe()
    var changes = 0
    let model = CredentialGroupsModel(
      store: store, generation: 9, onChoose: { _ in }, onMutation: { changes += 1 })
    await model.reload()?.value
    model.beginEdit(.create)
    model.changeName("../Escape")
    #expect(model.save() == nil)
    #expect(model.issue == "Enter a group name without slashes or a leading dot.")
    model.changeName("../Escape")
    #expect(model.issue == "Enter a group name without slashes or a leading dot.")
    #expect(store.writes.isEmpty)
    model.changeName("Work")
    #expect(model.issue == nil)
    model.cancelEdit()
    model.browse("/Work")
    await model.reload()?.value
    model.requestDelete()
    model.cancelDelete()
    #expect(model.confirmDelete() == nil)
    #expect(store.writes.isEmpty)
    store.writeError = CredentialStoreError.invalidPage
    model.beginEdit(.rename)
    model.changeName("New name")
    await model.save()?.value
    #expect(model.mutation == .uncertain)
    #expect(model.save() == nil)
    #expect(store.writes == ["rename /Work New name"])
    #expect(changes == 0)
    await model.reload()?.value
    #expect(model.mutation == .idle)
    #expect(model.edit == nil)
    #expect(model.path == "/Work")
    #expect(store.writes.count == 1)
  }

  @Test func nestedCreationSelectsNewPathAndLateMutationCannotNavigateAfterRevoke() async throws {
    let store = GroupProbe()
    var chosen: String?
    var changes = 0
    let model = CredentialGroupsModel(
      store: store, generation: 9, onChoose: { chosen = $0 }, onMutation: { changes += 1 })
    await model.reload()?.value
    model.browse("/Work")
    await model.reload()?.value
    model.beginEdit(.create)
    model.changeName("  Личное  ")
    await model.save()?.value
    await model.reload()?.value
    model.choose()
    #expect(chosen == "/Work/Личное")
    #expect(changes == 1)
    #expect(store.writes == ["create /Work/Личное"])
    store.delayWrite = true
    model.requestDelete()
    let deletion = try #require(model.confirmDelete())
    await store.waitForWrite()
    model.revoke()
    store.pendingWrite?.resume()
    store.pendingWrite = nil
    await deletion.value
    #expect(model.state == .revoked)
    #expect(changes == 1)
    #expect(model.groups.isEmpty)
  }

  @Test func invalidGroupPagesAreErrorsRatherThanAnEmptySuccessfulCatalog() async {
    let store = GroupProbe()
    store.invalidPage = true
    let model = CredentialGroupsModel(
      store: store, generation: 9, onChoose: { _ in Issue.record("Invalid selection") },
      onMutation: {})
    await model.reload()?.value
    #expect(model.state == .failed)
    #expect(!model.canChoose)
    model.choose()
  }
}

@MainActor
private final class GroupProbe: CredentialGroupStore {
  var delayRead = false
  var delayWrite = false
  var invalidPage = false
  var writeError: (any Error)?
  var writes: [String] = []
  var pendingRead: CheckedContinuation<Void, Never>?
  var pendingWrite: CheckedContinuation<Void, Never>?
  private var readStarted: CheckedContinuation<Void, Never>?
  private var writeStarted: CheckedContinuation<Void, Never>?
  static func page(_ parent: String, _ paths: [String]) -> PassmanagerGroupPageResponse {
    PassmanagerGroupPageResponse(
      groups: paths.map { PassmanagerGroupSummary(entryCount: 0, path: $0) }, nextOffset: nil,
      parent: parent)
  }
  func waitForRead() async {
    if pendingRead != nil { return }
    await withCheckedContinuation { readStarted = $0 }
  }
  func waitForWrite() async {
    if pendingWrite != nil { return }
    await withCheckedContinuation { writeStarted = $0 }
  }
  func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
    -> PassmanagerGroupPageResponse
  {
    if delayRead {
      await withCheckedContinuation {
        pendingRead = $0
        readStarted?.resume()
        readStarted = nil
      }
    }
    if invalidPage { return Self.page(parent, ["/Unrelated/Child"]) }
    return Self.page(
      parent, parent == "/" ? ["/Work"] : (parent == "/Work" ? ["/Work/Nested"] : []))
  }
  private func write(_ description: String) async throws {
    writes.append(description)
    if delayWrite {
      await withCheckedContinuation {
        pendingWrite = $0
        writeStarted?.resume()
        writeStarted = nil
      }
    }
    if let writeError { throw writeError }
  }
  func ensureGroup(path: String, generation: UInt64) async throws {
    try await write("create " + path)
  }
  func renameGroup(path: String, name: String, generation: UInt64) async throws {
    try await write("rename " + path + " " + name)
  }
  func deleteGroup(path: String, generation: UInt64) async throws {
    try await write("delete " + path)
  }
}
