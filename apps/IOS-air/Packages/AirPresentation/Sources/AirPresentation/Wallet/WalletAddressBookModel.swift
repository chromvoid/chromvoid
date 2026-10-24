import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class WalletAddressBookModel {
  public enum State: Equatable { case loading, ready, failed, revoked }
  public enum Mutation: Equatable { case idle, working, uncertain }
  public enum Field: Hashable { case label, network, address }
  public enum Issue: Equatable {
    case required(Field)
    case invalidAddress, invalidInput, denied, unavailable, missing, uncertain
  }
  public struct Draft: Equatable {
    public let entryID: String?
    public var label: String
    public var network: String?
    public var address: String
  }
  public private(set) var state: State = .loading
  public private(set) var mutation: Mutation = .idle
  public private(set) var entries: [WalletAddressBookEntry] = []
  public private(set) var networks: [String] = []
  public private(set) var draft: Draft?
  public private(set) var pendingDeletion: WalletAddressBookEntry?
  public private(set) var discardRequested = false
  public private(set) var issue: Issue?
  public private(set) var copiedID: String?
  private var original: Draft?
  private let store: any WalletAddressBookStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let reads = ModelWork()
  private let writes = ModelWork()

  public init(
    store: any WalletAddressBookStore, generation: UInt64, clipboard: any CredentialClipboard
  ) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
  }
  public var hasChanges: Bool { draft != original }
  public var canDismiss: Bool {
    mutation != .working && draft == nil && pendingDeletion == nil
  }
  public var invalidField: Field? {
    switch issue {
    case .required(let field): field
    case .invalidAddress: .address
    default: nil
    }
  }
  public func updateNetworks(_ networks: [String]) {
    guard state != .revoked else { return }
    self.networks = networks
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    state = .loading
    copiedID = nil
    return reads.start { [weak self, store, generation] run in
      do {
        let result = try await store.listWalletContacts(generation: generation)
        guard let self, run.isCurrent else { return }
        self.entries = result.entries
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked { self.revoke() } else { self.state = .failed }
      }
    }
  }
  public func add() {
    guard state == .ready, mutation == .idle, draft == nil, pendingDeletion == nil else { return }
    open(Draft(entryID: nil, label: "", network: nil, address: ""))
  }
  public func edit(_ id: String) {
    guard state == .ready, mutation == .idle, draft == nil, pendingDeletion == nil,
      let entry = entries.first(where: { $0.entryID == id })
    else { return }
    open(Draft(entryID: id, label: entry.label, network: entry.network, address: entry.address))
  }
  private func open(_ draft: Draft) {
    self.draft = draft
    original = draft
    issue = nil
    discardRequested = false
  }
  public func change(_ field: Field, to value: String) {
    guard mutation == .idle, draft != nil, state != .revoked else { return }
    switch field {
    case .label: draft?.label = value
    case .network: draft?.network = value.isEmpty ? nil : value
    case .address: draft?.address = value
    }
    issue = nil
  }
  public func closeEditor() {
    guard mutation != .working else { return }
    if hasChanges { discardRequested = true } else { clearEditor() }
  }
  public func keepEditing() { discardRequested = false }
  public func discard() {
    guard mutation != .working else { return }
    clearEditor()
  }
  private func clearEditor() {
    draft = nil
    original = nil
    discardRequested = false
  }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .ready, mutation == .idle, let draft else { return nil }
    if draft.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      issue = .required(.label)
      return nil
    }
    guard let network = draft.network, networks.contains(network) else {
      issue = .required(.network)
      return nil
    }
    if draft.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      issue = .required(.address)
      return nil
    }
    if let id = draft.entryID {
      guard entries.contains(where: { $0.entryID == id }) else {
        issue = .missing
        return nil
      }
      return perform(
        .update(
          WalletAddressBookUpdateRequest(
            address: draft.address, entryID: id, label: draft.label, network: network)))
    }
    return perform(
      .create(
        WalletAddressBookCreateRequest(
          address: draft.address, label: draft.label, network: network)))
  }
  public func requestDeletion(_ id: String) {
    guard state == .ready, mutation == .idle, draft == nil else { return }
    pendingDeletion = entries.first { $0.entryID == id }
    issue = nil
  }
  public func cancelDeletion() { pendingDeletion = nil }
  @discardableResult
  public func confirmDeletion() -> Task<Void, Never>? {
    guard state == .ready, mutation == .idle, let entry = pendingDeletion else { return nil }
    pendingDeletion = nil
    return perform(.delete(WalletAddressBookDeleteRequest(entryID: entry.entryID)))
  }
  public func acknowledgeReconciliation() {
    guard state == .ready, mutation == .uncertain else { return }
    mutation = .idle
    issue = nil
  }
  public func copyAddress(_ id: String) {
    guard state == .ready, mutation != .working,
      let entry = entries.first(where: { $0.entryID == id })
    else { return }
    clipboard.copy(entry.address)
    copiedID = id
  }
  private enum Operation {
    case create(WalletAddressBookCreateRequest)
    case update(WalletAddressBookUpdateRequest)
    case delete(WalletAddressBookDeleteRequest)
  }
  private func perform(_ operation: Operation) -> Task<Void, Never> {
    mutation = .working
    issue = nil
    return writes.start { [weak self, store, generation] run in
      do {
        switch operation {
        case .create(let request):
          _ = try await store.createWalletContact(request, generation: generation)
        case .update(let request):
          _ = try await store.updateWalletContact(request, generation: generation)
        case .delete(let request):
          _ = try await store.deleteWalletContact(request, generation: generation)
        }
        guard let self, run.isCurrent else { return }
        self.clearEditor()
        await self.reload()?.value
        guard run.isCurrent else { return }
        self.mutation = .idle
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        if error.coreFailure?.code == "INVALID_ADDRESS" {
          self.issue = .invalidAddress
        } else {
          switch error.coreFailureKind {
          case .invalidInput: self.issue = .invalidInput
          case .denied: self.issue = .denied
          case .unavailable: self.issue = .unavailable
          case .missing: self.issue = .missing
          default: self.issue = .uncertain
          }
        }
        self.mutation = self.issue == .uncertain ? .uncertain : .idle
        if self.issue == .uncertain || self.issue == .missing {
          self.clearEditor()
          await self.reload()?.value
        }
      }
    }
  }
  public func revoke() {
    reads.cancel()
    writes.cancel()
    clearEditor()
    pendingDeletion = nil
    entries = []
    networks = []
    copiedID = nil
    clipboard.clearOwned()
    issue = nil
    mutation = .idle
    state = .revoked
  }
}
