import ChromVoidBridge
import Foundation
import Observation
import SwiftUI

/// Every login that has one-time codes, as a live list: the first code of each login shows
/// with its remaining time and copies in one tap, as on the credential page. Opening the
/// login name goes to the credential itself.
@Observable
@MainActor
public final class CodesModel: Identifiable {
  public enum State: Equatable { case loading, ready, failed, revoked }
  public let id = UUID()
  public private(set) var state: State = .loading
  public private(set) var entries: [CredentialSummary] = []
  public private(set) var loadingMore = false
  public private(set) var selected: CredentialDetailModel?
  public private(set) var copyFeedback: UUID?
  @ObservationIgnored private var codes: [String: CredentialOTPModel] = [:]
  private var nextOffset: Int?
  private let store: any CredentialStore
  private let clipboard: any CredentialClipboard
  private let generation: UInt64
  private let onMutation: () -> Void
  private let work = ModelWork()

  public init(
    store: any CredentialStore, generation: UInt64, clipboard: any CredentialClipboard,
    onMutation: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.onMutation = onMutation
  }

  public var canLoadMore: Bool { nextOffset != nil }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    for model in codes.values { model.revoke() }
    codes = [:]
    if entries.isEmpty { state = .loading }
    nextOffset = nil
    loadingMore = false
    return fetch(offset: 0)
  }
  public func loadMore() {
    guard state == .ready, !loadingMore, let nextOffset else { return }
    loadingMore = true
    fetch(offset: nextOffset)
  }
  @discardableResult
  private func fetch(offset: Int) -> Task<Void, Never> {
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.credentialPage(
          PassmanagerEntryPageRequest(
            descending: false, entryType: "login", groupBy: nil, groupPath: nil,
            groupingTime: nil, limit: 50, offset: offset, query: "", quickFilters: ["otp"],
            sort: "name", tagKey: nil),
          generation: generation)
        guard let self, run.isCurrent else { return }
        if offset == 0 { self.entries = page.entries } else { self.entries += page.entries }
        self.nextOffset = page.nextOffset
        self.loadingMore = false
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingMore = false
        if error.isSessionRevoked { self.revoke() } else { self.state = .failed }
      }
    }
  }

  /// The live code model for one login, created on first request and kept while listed.
  public func codes(for entry: CredentialSummary) -> CredentialOTPModel {
    if let model = codes[entry.id] { return model }
    let model = CredentialOTPModel(
      id: entry.id, store: store, generation: generation, clipboard: clipboard,
      showsFirstCode: true, onCopied: { [weak self] in self?.copyFeedback = UUID() },
      onMutation: { [weak self] in self?.onMutation() })
    codes[entry.id] = model
    return model
  }
  public func clearCopyFeedback(_ id: UUID) { if copyFeedback == id { copyFeedback = nil } }

  public func select(_ id: String) {
    guard state == .ready, selected == nil else { return }
    hideCodes()
    selected = CredentialDetailModel(
      id: id, store: store, generation: generation, clipboard: clipboard,
      onDelete: { [weak self] in
        self?.closeDetail()
        self?.onMutation()
        self?.reload()
      },
      onMutation: { [weak self] in
        self?.onMutation()
        self?.reload()
      })
  }
  public func closeDetail() {
    selected?.revoke()
    selected = nil
    for model in codes.values { model.showFirstCode() }
  }
  public func hideCodes() {
    for model in codes.values { model.hideCode() }
  }
  public func showCodes() {
    for model in codes.values { model.showFirstCode() }
  }
  public func revoke() {
    work.cancel()
    closeDetail()
    for model in codes.values { model.revoke() }
    codes = [:]
    entries = []
    nextOffset = nil
    loadingMore = false
    copyFeedback = nil
    state = .revoked
  }
}

struct CodesView: View {
  @AirLocalizedCopy private var copy
  var model: CodesModel
  let lock: () -> Void

  var body: some View {
    List {
      switch model.state {
      case .loading: ProgressView(copy.text("Loading codes…"))
      case .failed:
        Text(copy.text("Couldn’t load codes."))
        Button(copy.text("Try again")) { model.reload() }
      case .revoked: Text(copy.text("Vault locked"))
      case .ready:
        if model.entries.isEmpty {
          Section {
            Label(copy.text("No one-time codes"), systemImage: "number.square").font(.headline)
              .accessibilityIdentifier("noCodes")
            Text(
              copy.text(
                "Add the setup key provided by your service to generate verification codes.")
            )
            .foregroundStyle(.secondary)
          }
        }
        ForEach(model.entries, id: \.id) { entry in
          CodesEntrySection(model: model.codes(for: entry), entry: entry) {
            model.select(entry.id)
          }
        }
        if model.canLoadMore {
          Section {
            if model.loadingMore {
              ProgressView(copy.text("Loading credentials…"))
            } else {
              Button(copy.text("Load more"), action: model.loadMore)
            }
          }
        }
      }
    }
    .airCanvas()
    .animation(AirMotion.layout, value: model.entries.map(\.id))
    .animation(AirMotion.layout, value: model.state)
    .privacySensitive()
    .navigationTitle(copy.text("Codes"))
    .accessibilityIdentifier("codesCatalog")
    .airToast(
      model.copyFeedback == nil ? nil : copy.text("Copied. Expires in 15 seconds on this device."),
      systemImage: "checkmark", identifier: "credentialCopied"
    )
    .onChange(of: model.copyFeedback) { _, id in if id != nil { AirHaptics.confirm() } }
    .task(id: model.copyFeedback) {
      guard let id = model.copyFeedback else { return }
      try? await Task.sleep(for: .seconds(3))
      if !Task.isCancelled { model.clearCopyFeedback(id) }
    }
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
          .accessibilityIdentifier("lockVault")
      }
    }
    .navigationDestination(
      isPresented: Binding(get: { model.selected != nil }, set: { if !$0 { model.closeDetail() } })
    ) {
      if let detail = model.selected { CredentialDetailView(model: detail, lock: lock) }
    }
    .onAppear { model.showCodes() }
    .onDisappear { model.hideCodes() }
  }
}

/// One login in the Codes list: its name opens the credential; its codes are the same live
/// block as on the credential page.
private struct CodesEntrySection: View {
  @AirLocalizedCopy private var copy
  var model: CredentialOTPModel
  let entry: CredentialSummary
  let open: () -> Void

  var body: some View {
    Section {
      Button(action: open) {
        HStack(spacing: 14) {
          CredentialMonogram(title: entry.title, entryType: entry.entryType, size: 36)
          VStack(alignment: .leading, spacing: 2) {
            Text(entry.title.isEmpty ? copy.text("Untitled credential") : entry.title)
              .font(.headline).foregroundStyle(.primary)
            if !entry.username.isEmpty {
              Text(entry.username).font(.subheadline).foregroundStyle(.secondary)
            }
          }
          Spacer(minLength: 8)
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("openCodesEntry_" + entry.id)
      CredentialCodesRows(model: model)
    }
  }
}
