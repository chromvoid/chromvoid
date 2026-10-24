import Foundation
import Observation

/// App-owned presentation choices. Core remains the authority for catalog access and mutations.
@MainActor
@Observable
public final class FilePreferences {
  public private(set) var showHidden: Bool
  public private(set) var confirmDeletion: Bool
  public private(set) var attachmentFolder: String
  private static let attachmentKey = "air.files.attachment-folder"
  private let defaults: UserDefaults
  private static let hiddenKey = "air.files.show-hidden"
  private static let deletionKey = "air.files.confirm-deletion"
  /// Open folder routes waiting for `showHidden` changes; entries whose owner released the
  /// observation are dropped on the next change.
  @ObservationIgnored private var showHiddenObservers: [ShowHiddenObserver] = []

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    attachmentFolder = defaults.string(forKey: Self.attachmentKey) ?? "/attachments"
    showHidden = defaults.bool(forKey: Self.hiddenKey)
    confirmDeletion = defaults.object(forKey: Self.deletionKey) as? Bool ?? true
  }

  /// Receives a folder selected in the catalog browser. Core revalidates it at upload time.
  public func setAttachmentFolder(_ path: String) {
    guard attachmentFolder != path else { return }
    attachmentFolder = path
    defaults.set(path, forKey: Self.attachmentKey)
  }

  public func setShowHidden(_ value: Bool) {
    guard showHidden != value else { return }
    showHidden = value
    defaults.set(value, forKey: Self.hiddenKey)
    showHiddenObservers.removeAll { $0.observation == nil }
    for observer in showHiddenObservers { observer.observation?.handler(value) }
  }

  public func setConfirmDeletion(_ value: Bool) {
    guard confirmDeletion != value else { return }
    confirmDeletion = value
    defaults.set(value, forKey: Self.deletionKey)
  }

  /// Delivers every later `showHidden` change, synchronously and in registration order, for
  /// as long as the returned observation is retained.
  func observeShowHidden(_ handler: @escaping @MainActor (Bool) -> Void)
    -> FilePreferenceObservation
  {
    let observation = FilePreferenceObservation(handler)
    showHiddenObservers.append(ShowHiddenObserver(observation: observation))
    return observation
  }

  private struct ShowHiddenObserver {
    weak var observation: FilePreferenceObservation?
  }
}

/// Keeps a `FilePreferences` observation alive; releasing it ends the observation.
@MainActor
final class FilePreferenceObservation {
  fileprivate let handler: @MainActor (Bool) -> Void

  fileprivate init(_ handler: @escaping @MainActor (Bool) -> Void) { self.handler = handler }
}
