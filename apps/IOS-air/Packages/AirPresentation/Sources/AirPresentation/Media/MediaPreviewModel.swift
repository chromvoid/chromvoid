import AVFoundation
import ChromVoidBridge
import Foundation
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
public final class MediaPreviewModel: Identifiable {
  public enum State: Equatable { case idle, loading, ready, failed, revoked }
  public let id = UUID()
  public private(set) var name: String
  public private(set) var state: State = .idle
  public private(set) var player: AVPlayer?
  public private(set) var issue: String?
  private let store: any FileReadStore
  private let nodeID: UInt64
  private let generation: UInt64
  @ObservationIgnored private var loader: MediaAssetLoader?
  private let work = ModelWork()
  @ObservationIgnored private var statusObservation: NSKeyValueObservation?

  public init(store: any FileReadStore, nodeID: UInt64, generation: UInt64, name: String) {
    self.store = store
    self.nodeID = nodeID
    self.generation = generation
    self.name = name
  }

  public static func supports(name: String, mimeType: String?) -> Bool {
    let type =
      mimeType.flatMap { UTType(mimeType: $0) }
      ?? UTType(filenameExtension: (name as NSString).pathExtension)
    return type?.conforms(to: .movie) == true || type?.conforms(to: .audio) == true
  }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard state == .idle || state == .failed else { return nil }
    clearPlayer()
    state = .loading
    issue = nil
    // The loader and player-item callbacks outlive this body; `run` stays current until the
    // next load or revoke, so it also fences those late failures.
    return work.start { [weak self, store, nodeID, generation] run in
      do {
        let source = try await MediaByteSource.open(
          store: store, nodeID: nodeID, generation: generation)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .loading else {
          source.revoke()
          return
        }
        let loader = try MediaAssetLoader(source: source)
        self.loader = loader
        loader.onFailure = { [weak self] error in
          if run.isCurrent { self?.fail(error) }
        }
        guard try await loader.asset.load(.isPlayable) else { throw MediaReadError.incomplete }
        try Task.checkCancellation()
        guard run.isCurrent, self.state == .loading else { return }
        let item = AVPlayerItem(asset: loader.asset)
        item.preferredForwardBufferDuration = 5
        let player = AVPlayer(playerItem: item)
        // Apple's resource-loader contract recommends disabling network-throughput prediction.
        player.automaticallyWaitsToMinimizeStalling = false
        player.allowsExternalPlayback = false
        player.audiovisualBackgroundPlaybackPolicy = .pauses
        self.player = player
        self.statusObservation = item.observe(\.status, options: [.new]) { [weak self] _, _ in
          Task { @MainActor [weak self] in
            if run.isCurrent, self?.player?.currentItem?.status == .failed {
              self?.fail(MediaReadError.incomplete)
            }
          }
        }
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        self.fail(error)
      }
    }
  }

  private func fail(_ error: Error) {
    guard state != .revoked else { return }
    clearPlayer()
    state = .failed
    issue =
      error is MediaReadError
      ? "This media could not be played. Reopen it or choose another file."
      : FilesModel.message(error)
  }

  private func clearPlayer() {
    statusObservation?.invalidate()
    statusObservation = nil
    player?.pause()
    player?.currentItem?.cancelPendingSeeks()
    player?.replaceCurrentItem(with: nil)
    player = nil
    loader?.revoke()
    loader = nil
  }

  public func revoke() {
    work.cancel()
    state = .revoked
    clearPlayer()
    issue = nil
    name = ""
  }
}
