import ChromVoidBridge
import Foundation
import Observation
import SwiftUI

/// Ordered, ephemeral website draft. Core owns validation and revision-checked persistence.
@Observable
@MainActor
public final class WebsiteEditorModel: Identifiable {
  public struct Row: Identifiable, Equatable {
    public let id = UUID()
    public var value: String
    public var mode: String
    let sourceIndex: Int?
    var rule: CredentialWebsiteRule {
      CredentialWebsiteRule(matchMode: mode, sourceIndex: sourceIndex, value: value)
    }
  }
  public enum State { case loading, failed, editing, saving, saved, needsReload, revoked }
  public static let modes = ["base_domain", "host", "starts_with", "exact", "regex", "never"]
  public static func modeLabel(_ mode: String) -> String {
    switch mode {
    case "base_domain": "Domain and subdomains"
    case "host": "Exact host"
    case "starts_with": "URL starts with"
    case "exact": "Exact URL"
    case "regex": "Regular expression"
    case "never": "Never match"
    default: "Imported matching mode"
    }
  }
  public let id = UUID()
  public let entryID: String?
  public private(set) var rows: [Row] = []
  public private(set) var state: State
  public private(set) var errors: [UUID: String] = [:]
  public private(set) var issue: String?
  public private(set) var focus: UUID?
  public private(set) var focusRevision = 0
  public private(set) var confirmingDiscard = false
  public var isDirty: Bool { rows != initial }
  private var initial: [Row] = []
  @ObservationIgnored private var revision: String?
  private let store: any WebsiteStore
  private let generation: UInt64
  private let onSaved: ([CredentialWebsiteRule]) -> Void
  private let work = ModelWork()

  public init(
    store: any WebsiteStore, generation: UInt64, entryID: String? = nil,
    rules: [CredentialWebsiteRule] = [], onSaved: @escaping ([CredentialWebsiteRule]) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.entryID = entryID
    self.onSaved = onSaved
    state = entryID == nil ? .editing : .loading
    rows = rules.map { Row(value: $0.value, mode: $0.matchMode, sourceIndex: $0.sourceIndex) }
    initial = rows
  }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard let entryID, state == .loading || state == .failed, !work.isRunning else { return nil }
    state = .loading
    issue = nil
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.websiteRules(id: entryID, generation: generation)
        guard let self, run.isCurrent, self.state == .loading else { return }
        guard result.revision != nil, result.errors.isEmpty else {
          throw CredentialStoreError.invalidPage
        }
        self.rows = result.rules.map {
          Row(value: $0.value, mode: $0.matchMode, sourceIndex: $0.sourceIndex)
        }
        self.initial = self.rows
        self.revision = result.revision
        self.state = .editing
      } catch {
        guard let self, run.isCurrent, self.state == .loading else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.state = .failed
          self.issue = "Couldn’t load website rules."
        }
      }
    }
  }
  public func add() {
    guard state == .editing else { return }
    let row = Row(value: "", mode: "base_domain", sourceIndex: nil)
    rows.append(row)
    focus = row.id
    focusRevision += 1
  }
  public func change(_ id: UUID, value: String? = nil, mode: String? = nil) {
    guard state == .editing, let index = rows.firstIndex(where: { $0.id == id }) else { return }
    guard (value != nil && value != rows[index].value) || (mode != nil && mode != rows[index].mode)
    else { return }
    if let value { rows[index].value = value }
    if let mode { rows[index].mode = mode }
    errors = [:]
    issue = nil
  }
  public func remove(_ id: UUID) {
    guard state == .editing else { return }
    rows.removeAll { $0.id == id }
    errors = [:]
    if focus == id { focus = nil }
  }
  public func move(from: IndexSet, to: Int) {
    guard state == .editing else { return }
    rows.move(fromOffsets: from, toOffset: to)
    errors = [:]
  }
  public func requestDismiss() { confirmingDiscard = isDirty }
  public func cancelDiscard() { confirmingDiscard = false }

  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    let rules = rows.map(\.rule)
    let revision = revision
    state = .saving
    errors = [:]
    issue = nil
    return work.start { [weak self, store, generation, entryID] run in
      do {
        let result: PassmanagerWebsiteResult
        if let entryID, let revision {
          result = try await store.updateWebsites(
            PassmanagerWebsiteUpdateRequest(entryID: entryID, revision: revision, rules: rules),
            generation: generation)
        } else if entryID == nil {
          result = try await store.validateWebsites(rules, generation: generation)
        } else {
          throw CredentialStoreError.invalidPage
        }
        guard let self, run.isCurrent, self.state == .saving else { return }
        if !result.errors.isEmpty {
          for error in result.errors {
            guard self.rows.indices.contains(error.index) else {
              throw CredentialStoreError.invalidPage
            }
            self.errors[self.rows[error.index].id] = Self.errorText(error.code)
          }
          self.state = .editing
          self.focus = self.rows.first(where: { self.errors[$0.id] != nil })?.id
          self.focusRevision += 1
          return
        }
        if entryID != nil && result.revision == nil { throw CredentialStoreError.invalidPage }
        self.rows = []
        self.initial = []
        self.revision = nil
        self.focus = nil
        self.state = .saved
        self.onSaved(result.rules)
      } catch {
        guard let self, run.isCurrent, self.state == .saving else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = .editing
        switch error.coreFailureKind {
        case .denied: self.issue = "This vault does not allow this change."
        case .invalidInput:
          self.issue = "Check website rules. Use at most 100 rows."
        default:
          if entryID == nil {
            self.issue = "Couldn’t validate website rules. Try again."
          } else {
            self.state = .needsReload
            self.issue =
              "Close this editor and review the saved website rules before editing again."
          }
        }
      }
    }
  }
  private static func errorText(_ code: String) -> String {
    let copy: String
    switch code {
    case "invalid_regex": copy = "Enter a regular expression supported by the matcher."
    case "invalid_mode": copy = "Choose a supported matching mode."
    case "duplicate": copy = "This website is already in the list."
    case "too_long": copy = "Shorten this website rule."
    default: copy = "Enter a valid website address."
    }
    return copy
  }
  public func revoke() {
    state = .revoked
    work.cancel()
    rows = []
    initial = []
    revision = nil
    errors = [:]
    issue = nil
    focus = nil
    confirmingDiscard = false
  }
}
