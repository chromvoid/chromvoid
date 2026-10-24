import ChromVoidBridge
import Foundation
import Observation
import SwiftUI

/// The whole group tree on one screen, for choosing where an entry lives. Levels load when
/// they are expanded; the ancestors of the current group open on arrival so the tick is
/// visible. Tapping a row chooses it; a new group is created inside the ticked one and chosen.
@Observable
@MainActor
public final class GroupPickerModel: Identifiable {
  public enum State: Equatable { case loading, ready, failed, revoked }
  public struct Row: Identifiable, Equatable {
    public let id: String
    public let name: String
    public let depth: Int
    public let entryCount: Int
    /// nil until the level below has been loaded.
    public let hasChildren: Bool?
    public let expanded: Bool
  }
  public let id = UUID()
  public let current: String
  public private(set) var state: State = .loading
  public private(set) var children: [String: [PassmanagerGroupSummary]] = [:]
  public private(set) var expanded: Set<String> = []
  public private(set) var loading: Set<String> = []
  public private(set) var creating = false
  public private(set) var busy = false
  public private(set) var issue: String?
  private let store: any CredentialGroupStore
  private let generation: UInt64
  private let onChoose: (String) -> Void
  /// One work per level being loaded; `reload` and `revoke` supersede them all.
  @ObservationIgnored private var work: [String: ModelWork] = [:]
  private let mutation = ModelWork()

  public init(
    store: any CredentialGroupStore, generation: UInt64, current: String = "/",
    onChoose: @escaping (String) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.current = current.isEmpty ? "/" : current
    self.onChoose = onChoose
    reload()
  }

  public static func parent(of path: String) -> String {
    let parent = path.split(separator: "/").dropLast().joined(separator: "/")
    return parent.isEmpty ? "/" : "/" + parent
  }
  /// Root, then the expanded tree in depth-first order.
  public var rows: [Row] {
    var result = [
      Row(
        id: "/", name: "", depth: 0, entryCount: 0, hasChildren: children["/"].map { !$0.isEmpty },
        expanded: expanded.contains("/"))
    ]
    func walk(_ parent: String, depth: Int) {
      guard expanded.contains(parent), let groups = children[parent] else { return }
      for group in groups {
        result.append(
          Row(
            id: group.path, name: String(group.path.split(separator: "/").last ?? ""),
            depth: depth, entryCount: group.entryCount,
            hasChildren: children[group.path].map { !$0.isEmpty },
            expanded: expanded.contains(group.path)))
        walk(group.path, depth: depth + 1)
      }
    }
    walk("/", depth: 1)
    return result
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    cancelLoads()
    children = [:]
    issue = nil
    state = .loading
    // Open every level down to the current group so its tick is on screen.
    var ancestors: [String] = ["/"]
    var path = current
    while path != "/" {
      path = Self.parent(of: path)
      ancestors.append(path)
    }
    expanded = Set(ancestors)
    let root = ModelWork()
    work["/"] = root
    return root.start { [weak self] run in
      for parent in ancestors.reversed() {
        guard let self, run.isCurrent else { return }
        await self.load(parent, run: run)
      }
      guard let self, run.isCurrent else { return }
      if self.state == .loading { self.state = self.children["/"] == nil ? .failed : .ready }
    }
  }

  /// Loads one level for the caller's run; a superseded or revoked run applies nothing.
  private func load(_ parent: String, run: ModelRun) async {
    loading.insert(parent)
    defer { loading.remove(parent) }
    do {
      var offset: UInt32 = 0
      var result: [PassmanagerGroupSummary] = []
      for _ in 0..<20 {
        let page = try await store.groupPage(parent: parent, offset: offset, generation: generation)
        guard page.parent == parent else { throw CredentialStoreError.invalidPage }
        result.append(contentsOf: page.groups)
        guard let next = page.nextOffset.flatMap(UInt32.init(exactly:)), next > offset else {
          break
        }
        offset = next
      }
      guard run.isCurrent, state != .revoked else { return }
      children[parent] = result
      if parent == "/" { state = .ready }
    } catch {
      guard run.isCurrent, state != .revoked else { return }
      if error.isSessionRevoked {
        revoke()
        return
      }
      if parent == "/" { state = .failed } else { expanded.remove(parent) }
    }
  }

  public func toggle(_ path: String) {
    guard state == .ready, !busy else { return }
    if expanded.contains(path) {
      expanded.remove(path)
      return
    }
    expanded.insert(path)
    if children[path] == nil, work[path] == nil {
      let level = ModelWork()
      work[path] = level
      level.start { [weak self] run in
        await self?.load(path, run: run)
        guard let self, run.isCurrent else { return }
        self.work[path] = nil
      }
    }
  }

  public func choose(_ path: String) {
    guard state == .ready, !busy else { return }
    onChoose(path)
  }

  public func beginCreate() {
    guard state == .ready, !busy else { return }
    issue = nil
    creating = true
  }
  public func cancelCreate() { creating = false }
  /// Creates a group inside the current one and chooses it.
  @discardableResult
  public func create(name: String) -> Task<Void, Never>? {
    guard state == .ready, !busy else { return nil }
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !name.hasPrefix("."), !name.contains("/"), !name.contains("\\"),
      !name.contains("\0")
    else {
      issue = "Enter a group name without slashes or a leading dot."
      return nil
    }
    creating = false
    busy = true
    issue = nil
    let destination = current == "/" ? "/" + name : current + "/" + name
    return mutation.start { [weak self, store, generation] run in
      do {
        try await store.ensureGroup(path: destination, generation: generation)
        guard let self, run.isCurrent else { return }
        self.busy = false
        self.onChoose(destination)
      } catch {
        guard let self, run.isCurrent else { return }
        self.busy = false
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .conflict: self.issue = "A group or credential already uses this name."
        case .invalidInput: self.issue = "Check the group name and try again."
        case .denied: self.issue = "This vault does not allow this change."
        default:
          self.issue = "The group change could not be confirmed. Reload groups before trying again."
        }
      }
    }
  }

  private func cancelLoads() {
    for level in work.values { level.cancel() }
    work = [:]
  }

  public func revoke() {
    cancelLoads()
    mutation.cancel()
    state = .revoked
    children = [:]
    expanded = []
    loading = []
    creating = false
    busy = false
    issue = nil
  }
}

struct GroupPickerView: View {
  @AirLocalizedCopy private var copy
  var model: GroupPickerModel
  let dismiss: () -> Void
  @State private var name = ""

  var body: some View {
    NavigationStack {
      List {
        Section {
          switch model.state {
          case .loading: ProgressView(copy.text("Loading groups…"))
          case .failed:
            Text(copy.text("Couldn’t load groups."))
            Button(copy.text("Reload groups")) { model.reload() }
          case .revoked: Text(copy.text("Vault locked"))
          case .ready:
            ForEach(model.rows) { row in groupRow(row) }
          }
          if let issue = model.issue {
            Text(copy.text(issue)).font(.footnote).foregroundStyle(.red)
              .accessibilityIdentifier("groupIssue")
          }
        } footer: {
          Text(copy.text("Tap a group to use it. New groups are created inside the ticked one."))
        }
      }
      .airCanvas()
      .animation(AirMotion.layout, value: model.rows)
      .privacySensitive()
      .navigationTitle(copy.text("Choose group"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel"), action: dismiss)
            .disabled(model.busy)
            .accessibilityIdentifier("closeGroups")
        }
        ToolbarItem(placement: .primaryAction) {
          Button {
            name = ""
            model.beginCreate()
          } label: {
            Label(copy.text("New group"), systemImage: "folder.badge.plus")
          }
          .disabled(model.state != .ready || model.busy)
          .accessibilityIdentifier("addGroup")
        }
      }
      .alert(
        copy.text("New group"),
        isPresented: Binding(get: { model.creating }, set: { if !$0 { model.cancelCreate() } })
      ) {
        TextField(copy.text("Group name"), text: $name)
          .textInputAutocapitalization(.sentences).autocorrectionDisabled()
          .accessibilityIdentifier("groupName")
        Button(copy.text("Save")) { model.create(name: name) }
          .accessibilityIdentifier("saveGroup")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelCreate)
      } message: {
        Text(copy.text("Enter a name for the new group."))
      }
    }
    .interactiveDismissDisabled(model.busy)
  }

  private func groupRow(_ row: GroupPickerModel.Row) -> some View {
    let isRoot = row.id == "/"
    let title = isRoot ? copy.text("Vault root") : row.name
    return HStack(spacing: 8) {
      Button {
        model.toggle(row.id)
      } label: {
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.secondary)
          .rotationEffect(.degrees(row.expanded ? 90 : 0))
          .animation(AirMotion.feedback, value: row.expanded)
          .frame(width: 28, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .opacity(row.hasChildren == false ? 0 : 1)
      .disabled(row.hasChildren == false)
      .accessibilityLabel(copy.format(row.expanded ? "Collapse: %@" : "Expand: %@", title))
      .accessibilityIdentifier("expandGroup_" + row.id)
      Button {
        model.choose(row.id)
      } label: {
        HStack(spacing: 12) {
          Image(systemName: isRoot ? "lock.square.stack" : "folder.fill")
            .foregroundStyle(Color.accentColor)
            .frame(width: 24)
          Text(title).foregroundStyle(.primary)
          Spacer(minLength: 8)
          if model.loading.contains(row.id) {
            ProgressView()
          } else if !isRoot {
            Text(String(row.entryCount)).font(.subheadline.monospacedDigit())
              .foregroundStyle(.secondary)
          }
          if row.id == model.current {
            Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
              .accessibilityHidden(true)
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(model.busy)
      .accessibilityAddTraits(row.id == model.current ? .isSelected : [])
      .accessibilityIdentifier("pickGroup_" + row.id)
    }
    .padding(.leading, CGFloat(row.depth) * 20)
  }
}
