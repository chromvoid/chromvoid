import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct CredentialTagsModelTests {
  @Test func assignmentKeepsOrderValidatesLimitAndDoesNotManageExistingTags() async throws {
    let store = TagProbe()
    var applied: [CredentialTagsModel.Selection]?
    let initial = (0..<12).map {
      CredentialTagsModel.Selection(key: "key\($0)", label: "Tag \($0)")
    }
    let model = CredentialTagsModel(store: store, generation: 9, selection: initial) {
      applied = $0
    }
    await model.reload()?.value
    model.beginEdit(store.current)
    #expect(model.edit == nil)
    model.requestDelete(store.current)
    #expect(!model.confirmingDelete)
    model.choose(store.current)
    model.applySelection()
    #expect(applied == nil && model.issue != nil)
    model.choose(store.current)
    model.applySelection()
    #expect(applied == initial)
    model.revoke()
    #expect(model.selection.isEmpty)
    model.applySelection()
    #expect(applied == initial)
  }

  @Test func stalePagesAndLateWritesCannotRestoreRevokedTags() async throws {
    let store = TagProbe()
    var changes = 0
    let model = CredentialTagsModel(
      store: store, generation: 9, onChoose: { _ in }, onMutation: { _, _ in changes += 1 })
    await model.reload()?.value
    #expect(model.tags.map(\.key) == ["work"])
    store.delayRead = true
    let old = try #require(model.reload())
    await store.waitForRead()
    store.delayRead = false
    store.current = TagProbe.tag("new", "New")
    await model.reload()?.value
    store.pendingRead?.resume()
    store.pendingRead = nil
    await old.value
    #expect(model.tags.map(\.key) == ["new"])
    model.beginEdit(store.current)
    model.changeName("Changed")
    store.delayWrite = true
    let write = try #require(model.save())
    await store.waitForWrite()
    model.revoke()
    store.pendingWrite?.resume()
    store.pendingWrite = nil
    await write.value
    #expect(model.state == .revoked)
    #expect(model.tags.isEmpty)
    #expect(model.name.isEmpty)
    #expect(model.edit == nil)
    #expect(changes == 0)
  }

  @Test func validationAndUncertainSaveRequireExplicitReloadWithoutRepeatingWrite() async {
    let store = TagProbe()
    let model = CredentialTagsModel(
      store: store, generation: 9, onChoose: { _ in }, onMutation: { _, _ in })
    await model.reload()?.value
    model.beginEdit()
    #expect(model.save() == nil)
    #expect(model.issue == "Enter a tag name.")
    model.changeName("")
    model.changeColor(.pink)
    #expect(model.issue == "Enter a tag name.")
    #expect(store.writes.isEmpty)
    model.changeName(" # Личное ")
    #expect(model.issue == nil)
    model.changeColor(.pink)
    store.writeError = CredentialStoreError.invalidPage
    await model.save()?.value
    #expect(model.mutation == .uncertain)
    #expect(model.save() == nil)
    #expect(store.writes == ["save new  # Личное  pink"])
    await model.reload()?.value
    #expect(model.mutation == .idle)
    #expect(model.edit == nil)
    #expect(model.name.isEmpty)
    #expect(store.writes.count == 1)
  }

  @Test func canonicalSaveAndDeleteKeepSelectionAndConfirmationExplicit() async {
    let store = TagProbe()
    var selected: String?
    var mutations: [(String?, String?)] = []
    let model = CredentialTagsModel(
      store: store, generation: 9, onChoose: { selected = $0.key },
      onMutation: { mutations.append(($0, $1?.key)) })
    await model.reload()?.value
    model.choose(store.current)
    #expect(selected == "work")
    model.beginEdit(store.current)
    model.changeName("New")
    await model.save()?.value
    await model.reload()?.value
    #expect(mutations.count == 1)
    #expect(mutations[0].0 == "work" && mutations[0].1 == "canonical")
    model.requestDelete(store.current)
    model.cancelDelete()
    #expect(model.confirmDelete() == nil)
    #expect(store.writes.count == 1)
    model.requestDelete(store.current)
    await model.confirmDelete()?.value
    #expect(mutations.count == 2 && mutations[1].1 == nil)
    #expect(store.writes == ["save work New blue", "delete canonical"])
    model.revoke()
  }

  @Test func invalidPageIsAnErrorAndCannotBeSelected() async {
    let store = TagProbe()
    store.invalidPage = true
    let model = CredentialTagsModel(
      store: store, generation: 9, onChoose: { _ in Issue.record("Invalid selection") },
      onMutation: { _, _ in })
    await model.reload()?.value
    #expect(model.state == .failed)
    #expect(!model.canChoose)
    model.choose(store.current)
    model.revoke()
  }
}

@MainActor
private final class TagProbe: CredentialTagStore {
  static func tag(_ key: String, _ label: String) -> CredentialTagSummary {
    CredentialTagSummary(colorID: "blue", count: 1, key: key, label: label)
  }
  var current = tag("work", "Work")
  var delayRead = false
  var delayWrite = false
  var invalidPage = false
  var writeError: (any Error)?
  var writes: [String] = []
  var pendingRead: CheckedContinuation<Void, Never>?
  var pendingWrite: CheckedContinuation<Void, Never>?
  private var readStarted: CheckedContinuation<Void, Never>?
  private var writeStarted: CheckedContinuation<Void, Never>?
  func waitForRead() async {
    if pendingRead != nil { return }
    await withCheckedContinuation { readStarted = $0 }
  }
  func waitForWrite() async {
    if pendingWrite != nil { return }
    await withCheckedContinuation { writeStarted = $0 }
  }
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    let tag = current
    if delayRead {
      await withCheckedContinuation {
        pendingRead = $0
        readStarted?.resume()
        readStarted = nil
      }
    }
    return PassmanagerTagPageResponse(nextOffset: invalidPage ? 0 : nil, tags: [tag])
  }
  private func write(_ value: String) async throws {
    writes.append(value)
    if delayWrite {
      await withCheckedContinuation {
        pendingWrite = $0
        writeStarted?.resume()
        writeStarted = nil
      }
    }
    if let writeError { throw writeError }
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  {
    try await write("save \(sourceKey ?? "new") \(label) \(colorID)")
    current = Self.tag("canonical", "Canonical")
    return current
  }
  func deleteTag(key: String, generation: UInt64) async throws { try await write("delete " + key) }
}
