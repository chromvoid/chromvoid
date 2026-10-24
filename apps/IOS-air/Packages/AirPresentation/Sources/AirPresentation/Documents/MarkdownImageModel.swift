import ChromVoidBridge
import Foundation
import Observation

/// Resolves a document attachment through Core before admitting a revocable image reader.
@MainActor
@Observable
public final class MarkdownImageModel {
  public private(set) var preview: ImagePreviewModel?
  public private(set) var issue: String?
  private let store: any DocumentStore & FileReadStore
  private let sourceNodeID: UInt64
  private let generation: UInt64
  @ObservationIgnored private var target: MarkdownTarget?
  private let work = ModelWork()
  @ObservationIgnored private var revoked = false

  public init(
    store: any DocumentStore & FileReadStore, sourceNodeID: UInt64, generation: UInt64,
    target: MarkdownTarget
  ) {
    self.store = store
    self.sourceNodeID = sourceNodeID
    self.generation = generation
    self.target = target
  }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard !revoked, !work.isRunning, preview?.state != .ready, let target,
      target.kind == .catalog || target.kind == .note, let path = target.path
    else { return nil }
    issue = nil
    return work.start { [weak self, store, sourceNodeID, generation] run in
      do {
        let result = try await store.resolveDocumentLink(
          nodeID: sourceNodeID, path: path, kind: target.kind == .catalog ? .file : .note,
          generation: generation)
        try Task.checkCancellation()
        guard let self, run.isCurrent else { return }
        guard result.kind == .found, let item = result.item,
          let nodeID = UInt64(exactly: item.nodeID),
          ImagePreviewDecoder.supports(name: item.name, mimeType: item.mimeType)
        else {
          self.issue = "Image unavailable"
          return
        }
        self.preview?.revoke()
        let preview = ImagePreviewModel(
          store: store, nodeID: nodeID, generation: generation, name: item.name)
        self.preview = preview
        await preview.load()?.value
      } catch {
        guard let self, run.isCurrent else { return }
        self.issue = "Image unavailable"
      }
    }
  }

  public func revoke() {
    revoked = true
    work.cancel()
    preview?.revoke()
    preview = nil
    target = nil
    issue = nil
  }
}
