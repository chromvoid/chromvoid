import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct WalletAddressBookTests {
  @Test func submitFocusesMissingInputAndForwardsAddressValidationToCore() async {
    let store = WalletContactsTestStore()
    let model = makeModel(store)
    await model.reload()?.value
    model.add()
    #expect(model.save() == nil && model.invalidField == .label)
    model.change(.label, to: "Savings")
    #expect(model.save() == nil && model.invalidField == .network)
    model.change(.network, to: "unknown")
    #expect(model.save() == nil && model.invalidField == .network)
    model.change(.network, to: "fixture-chain")
    #expect(model.save() == nil && model.invalidField == .address)
    model.change(.address, to: "format-owned-by-core")
    store.rejection = "INVALID_ADDRESS"
    await model.save()?.value
    #expect(model.invalidField == .address && model.draft?.address == "format-owned-by-core")
    #expect(store.creates.first?.network == "fixture-chain" && model.mutation == .idle)
    store.rejection = nil
    model.change(.address, to: "corrected-by-user")
    await model.save()?.value
    #expect(model.draft == nil && model.entries.first?.address == "corrected-by-user")
    #expect(store.creates.count == 2 && store.generations.allSatisfy { $0 == 7 })
  }

  @Test func editKeepsIdentityCopyUsesCurrentDataAndDeleteNeedsConfirmation() async {
    let store = WalletContactsTestStore()
    store.entries = [WalletContactsTestStore.entry("a"), WalletContactsTestStore.entry("b")]
    let clipboard = ContactsClipboard()
    let model = WalletAddressBookModel(store: store, generation: 7, clipboard: clipboard)
    model.updateNetworks(["fixture-chain"])
    await model.reload()?.value
    model.edit("a")
    model.change(.label, to: "Updated")
    model.closeEditor()
    #expect(model.discardRequested && model.draft?.entryID == "a" && store.updates.isEmpty)
    model.keepEditing()
    await model.save()?.value
    #expect(store.updates.first?.entryID == "a" && model.entries.first?.label == "Updated")
    model.copyAddress("a")
    #expect(clipboard.value == "a-address" && model.copiedID == "a")
    model.requestDeletion("a")
    model.cancelDeletion()
    #expect(model.confirmDeletion() == nil && store.deletes.isEmpty)
    model.requestDeletion("a")
    store.entries.reverse()
    await model.reload()?.value
    await model.confirmDeletion()?.value
    #expect(store.deletes == ["a"] && model.entries.map(\.entryID) == ["b"])
    model.revoke()
    #expect(clipboard.value == nil && model.entries.isEmpty && model.copiedID == nil)
  }

  @Test func uncertainCommitRequiresSuccessfulReadbackAndExplicitAcknowledgement() async {
    let store = WalletContactsTestStore()
    let model = makeModel(store)
    await model.reload()?.value
    fill(model)
    store.uncertain = true
    store.readFails = true
    await model.save()?.value
    #expect(model.draft == nil && model.mutation == .uncertain && model.state == .failed)
    model.acknowledgeReconciliation()
    model.add()
    #expect(model.mutation == .uncertain && model.draft == nil)
    store.readFails = false
    await model.reload()?.value
    #expect(model.entries.count == 1 && model.entries.first?.label == "Savings")
    model.add()
    #expect(model.draft == nil && store.creates.count == 1)
    model.acknowledgeReconciliation()
    model.add()
    #expect(model.draft != nil && model.mutation == .idle && store.creates.count == 1)
  }

  @Test func inFlightWriteCannotBeDuplicatedOrDiscardedByReload() async throws {
    let store = WalletContactsTestStore()
    let model = makeModel(store)
    await model.reload()?.value
    fill(model)
    store.writeGate.enabled = true
    let write = try #require(model.save())
    await store.writeGate.wait()
    model.discard()
    model.closeEditor()
    model.change(.address, to: "wrong-late-value")
    #expect(model.save() == nil && !model.canDismiss && model.draft?.address == "synthetic")
    await model.reload()?.value
    #expect(model.mutation == .working && store.creates.count == 1)
    store.writeGate.release()
    await write.value
    #expect(model.entries.first?.address == "synthetic" && model.draft == nil && model.canDismiss)
  }

  @Test(arguments: [false, true])
  func revokeDiscardsLateReadOrWrite(writePending: Bool) async throws {
    let store = WalletContactsTestStore()
    let model = makeModel(store)
    await model.reload()?.value
    fill(model)
    let gate = writePending ? store.writeGate : store.readGate
    gate.enabled = true
    let work = try #require(writePending ? model.save() : model.reload())
    await gate.wait()
    model.revoke()
    gate.release()
    await work.value
    #expect(model.state == .revoked && model.entries.isEmpty && model.draft == nil)
    #expect(model.networks.isEmpty && model.reload() == nil && model.save() == nil)
  }

  @Test func removedContactCannotBecomeAnUnintendedCreate() async {
    let store = WalletContactsTestStore()
    store.entries = [WalletContactsTestStore.entry("a")]
    let model = makeModel(store)
    await model.reload()?.value
    model.edit("a")
    model.change(.label, to: "Keep identity")
    store.entries = []
    await model.reload()?.value
    #expect(model.save() == nil && model.issue == .missing)
    #expect(store.updates.isEmpty && store.creates.isEmpty)
    model.closeEditor()
    #expect(model.discardRequested)
    model.discard()
    #expect(model.draft == nil && model.canDismiss)
  }

  private func makeModel(_ store: WalletContactsTestStore) -> WalletAddressBookModel {
    let model = WalletAddressBookModel(store: store, generation: 7, clipboard: ContactsClipboard())
    model.updateNetworks(["fixture-chain"])
    return model
  }
  private func fill(_ model: WalletAddressBookModel) {
    model.add()
    model.change(.label, to: "Savings")
    model.change(.network, to: "fixture-chain")
    model.change(.address, to: "synthetic")
  }
}

@MainActor
final class WalletContactsTestStore: WalletAddressBookStore {
  var entries: [WalletAddressBookEntry] = []
  var creates: [WalletAddressBookCreateRequest] = []
  var updates: [WalletAddressBookUpdateRequest] = []
  var deletes: [String] = []
  var generations: [UInt64] = []
  var rejection: String?
  var uncertain = false
  var readFails = false
  let readGate = ContactsGate()
  let writeGate = ContactsGate()
  func listWalletContacts(generation: UInt64) async throws -> WalletAddressBookListResponse {
    generations.append(generation)
    let result = WalletAddressBookListResponse(entries: entries)
    await readGate.pause()
    if readFails { throw ContactsError.unavailable }
    return result
  }
  func createWalletContact(_ request: WalletAddressBookCreateRequest, generation: UInt64)
    async throws
    -> WalletAddressBookCreateResponse
  {
    generations.append(generation)
    creates.append(request)
    await writeGate.pause()
    if let rejection { throw RPCFailure(code: rejection) }
    let entry = Self.entry("created").with(
      address: request.address, label: request.label, network: request.network)
    entries.append(entry)
    if uncertain { throw ContactsError.unavailable }
    return WalletAddressBookCreateResponse(entry: entry)
  }
  func updateWalletContact(_ request: WalletAddressBookUpdateRequest, generation: UInt64)
    async throws
    -> WalletAddressBookUpdateResponse
  {
    generations.append(generation)
    updates.append(request)
    let entry = Self.entry(request.entryID).with(
      address: request.address, label: request.label, network: request.network)
    entries = entries.map { $0.entryID == request.entryID ? entry : $0 }
    return WalletAddressBookUpdateResponse(entry: entry)
  }
  func deleteWalletContact(_ request: WalletAddressBookDeleteRequest, generation: UInt64)
    async throws
    -> WalletAddressBookDeleteResponse
  {
    generations.append(generation)
    deletes.append(request.entryID)
    entries.removeAll { $0.entryID == request.entryID }
    return WalletAddressBookDeleteResponse(entryID: request.entryID)
  }
  static func entry(_ id: String) -> WalletAddressBookEntry {
    WalletAddressBookEntry(
      address: id + "-address", createdAt: 1, entryID: id, label: id,
      network: "fixture-chain", updatedAt: 1)
  }
}

private enum ContactsError: Error { case unavailable }

@MainActor
final class ContactsGate {
  var enabled = false
  private var pending: CheckedContinuation<Void, Never>?
  private var waiter: CheckedContinuation<Void, Never>?
  func pause() async {
    guard enabled else { return }
    await withCheckedContinuation {
      pending = $0
      waiter?.resume()
      waiter = nil
    }
  }
  func wait() async { if pending == nil { await withCheckedContinuation { waiter = $0 } } }
  func release() {
    enabled = false
    pending?.resume()
    pending = nil
  }
}

@MainActor
private final class ContactsClipboard: CredentialClipboard {
  var value: String?
  func copy(_ value: String) { self.value = value }
  func clearOwned() { value = nil }
}
