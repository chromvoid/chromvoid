import ChromVoidBridge
import Foundation
import Observation

/// A transient catalog route for choosing the shared Markdown attachment preference.
@MainActor
@Observable
public final class AttachmentFolderModel: Identifiable {
  public let id = UUID()
  public let browser: FilesModel
  public private(set) var issue: String?
  private let preferences: FilePreferences
  @ObservationIgnored private var onSelected: (() -> Void)?

  init(browser: FilesModel, preferences: FilePreferences, onSelected: @escaping () -> Void) {
    self.browser = browser
    self.preferences = preferences
    self.onSelected = onSelected
  }

  public func folders(in folder: FilesModel) -> [CatalogListItem] {
    folder.items.filter(\.isDir)
  }

  public func open(_ item: CatalogListItem, in folder: FilesModel) {
    guard owns(folder), folder.state == .ready,
      folders(in: folder).contains(where: { $0.nodeID == item.nodeID })
    else { return }
    issue = nil
    folder.open(item)
  }

  public func select(_ folder: FilesModel) {
    guard owns(folder), onSelected != nil else { return }
    guard folder.state == .ready else {
      issue = "Wait for the destination folder to load."
      return
    }
    guard folder.path != "/" else {
      issue = "Choose a folder inside the vault."
      return
    }
    preferences.setAttachmentFolder(folder.path)
    onSelected?()
  }

  public func revoke() {
    onSelected = nil
    issue = nil
    browser.revoke()
  }

  private func owns(_ folder: FilesModel) -> Bool {
    var current: FilesModel? = browser
    while let route = current {
      if route === folder { return true }
      current = route.child
    }
    return false
  }
}
