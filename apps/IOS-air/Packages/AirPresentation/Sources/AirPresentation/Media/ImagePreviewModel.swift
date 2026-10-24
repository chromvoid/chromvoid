import ChromVoidBridge
import CoreGraphics
import Foundation
import Observation

@MainActor
@Observable
public final class ImagePreviewModel: Identifiable {
  public enum State: Equatable { case idle, loading, ready, failed, revoked }
  public let id = UUID()
  public private(set) var name: String
  public private(set) var state: State = .idle
  public private(set) var image: CGImage?
  /// The camera's embedded thumbnail, shown blurred while the full image still reads.
  public private(set) var placeholder: CGImage?
  /// Pixel and camera records read from the bytes; nil until decoded.
  public private(set) var details: ImageDetails?
  public let catalog: ImageCatalogFacts?
  public private(set) var firstFrameOnly = false
  public private(set) var issue: String?
  public private(set) var canAnimate = false
  public private(set) var isPlaying = false
  @ObservationIgnored private var animation: ImageAnimation?
  private let playback = ModelWork()
  @ObservationIgnored private var frameIndex = 0
  @ObservationIgnored private var completedPlays = 0
  private let waitForFrame: @MainActor (TimeInterval) async throws -> Void
  private let store: any FileReadStore
  private let nodeID: UInt64
  private let generation: UInt64
  private let sourceRevision: UInt64?
  private let posters: ImagePosterCache?
  private let derivatives: (any DerivativeStore)?
  private let placeholderWork = ModelWork()
  /// Stays a plain task: it runs at utility priority, which `ModelWork` cannot request.
  @ObservationIgnored private var ensureWork: Task<Void, Never>?
  private let detailsWork = ModelWork()
  private let decode: @MainActor (Data) async throws -> DecodedImagePreview
  @ObservationIgnored private var reader: (any FileReading)?
  private let work = ModelWork()
  /// Handle of the latest read, kept so `currentLoad` can hand it to a gallery.
  @ObservationIgnored private var loadTask: Task<Void, Never>?

  public init(
    store: any FileReadStore, nodeID: UInt64, generation: UInt64, name: String,
    sourceRevision: UInt64? = nil, posters: ImagePosterCache? = nil,
    catalog: ImageCatalogFacts? = nil, derivatives: (any DerivativeStore)? = nil,
    decode: @escaping @MainActor (Data) async throws -> DecodedImagePreview = {
      try await ImagePreviewDecoder.decode($0)
    },
    waitForFrame: @escaping @MainActor (TimeInterval) async throws -> Void = {
      try await ContinuousClock().sleep(for: .seconds($0))
    }
  ) {
    self.store = store
    self.nodeID = nodeID
    self.generation = generation
    self.name = name
    self.sourceRevision = sourceRevision
    self.posters = posters
    self.catalog = catalog
    self.derivatives = derivatives
    self.decode = decode
    self.waitForFrame = waitForFrame
  }

  /// Stored previews are worth it for large stills. Animated formats keep their frames, and
  /// PNG may be animated, so those always read the original.
  private var usesDerivative: Bool {
    guard derivatives != nil, let sourceRevision, sourceRevision > 0, let catalog,
      catalog.size >= 1024 * 1024
    else { return false }
    let ext = (name as NSString).pathExtension.lowercased()
    let mime = catalog.mimeType?.lowercased() ?? ""
    return !["gif", "png", "apng", "svg"].contains(ext) && !mime.contains("gif")
      && !mime.contains("png") && !mime.contains("svg")
  }

  /// Reads an existing vault-encrypted preview; nil when none is stored yet or it is unusable.
  private func storedPreview() async -> DecodedImagePreview? {
    guard usesDerivative, let derivatives, let sourceRevision else { return nil }
    do {
      var stored = try await derivatives.derivative(
        nodeID: nodeID, sourceRevision: sourceRevision, tier: .preview, ensure: false,
        generation: generation)
      defer { stored.bytes.resetBytes(in: 0..<stored.bytes.count) }
      try Task.checkCancellation()
      return try await decode(stored.bytes)
    } catch {
      return nil
    }
  }

  /// After the original has been shown once, Core converts and stores its preview at low
  /// priority so later openings, including after a relaunch, read the small encrypted copy.
  private func ensureStoredPreview() {
    guard usesDerivative, ensureWork == nil, let derivatives, let sourceRevision else { return }
    ensureWork = Task(priority: .utility) { [weak self, nodeID, generation] in
      guard
        var stored = try? await derivatives.derivative(
          nodeID: nodeID, sourceRevision: sourceRevision, tier: .preview, ensure: true,
          generation: generation)
      else { return }
      stored.bytes.resetBytes(in: 0..<stored.bytes.count)
      _ = self
    }
  }

  /// Fills `details` from the original's head when the poster came from a stored preview.
  public func loadDetails() {
    guard state == .ready, details == nil, !detailsWork.isRunning else { return }
    detailsWork.start { [weak self, store, nodeID, generation] run in
      guard let reader = try? store.openFileReader(nodeID: nodeID, generation: generation)
      else { return }
      defer { try? reader.cancel() }
      guard var chunk = try? await reader.read(offset: 0, length: reader.maximumChunkBytes)
      else { return }
      defer { chunk.bytes.resetBytes(in: 0..<chunk.bytes.count) }
      let head = chunk.bytes
      let details = await Task.detached(priority: .userInitiated) {
        var head = head
        defer { head.resetBytes(in: 0..<head.count) }
        return ImageDetails.read(head: head)
      }.value
      guard let self, run.isCurrent, self.state == .ready, self.details == nil else { return }
      self.details = details ?? ImageDetails()
    }
  }

  /// The read in flight, so a gallery can defer its neighbours until this image is on screen.
  public var currentLoad: Task<Void, Never>? { state == .loading ? loadTask : nil }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard state == .idle || state == .failed else { return nil }
    if let posters, let sourceRevision, sourceRevision > 0,
      let cached = posters.poster(for: .init(nodeID: nodeID, sourceRevision: sourceRevision))
    {
      image = cached.image
      details = cached.details
      animation = nil
      canAnimate = false
      firstFrameOnly = false
      issue = nil
      state = .ready
      return nil
    }
    state = .loading
    issue = nil
    let task = work.start { [weak self, store, nodeID, generation, decode] run in
      guard run.isCurrent, self?.state == .loading else { return }
      if let stored = await self?.storedPreview() {
        guard let self, run.isCurrent, self.state == .loading else { return }
        self.image = stored.image
        self.placeholder = nil
        self.animation = nil
        self.canAnimate = false
        self.firstFrameOnly = false
        self.state = .ready
        if let posters = self.posters, let sourceRevision = self.sourceRevision {
          posters.store(
            .init(image: stored.image, details: nil),
            for: .init(nodeID: nodeID, sourceRevision: sourceRevision))
        }
        return
      }
      guard run.isCurrent, self?.state == .loading else { return }
      do {
        let reader = try store.openFileReader(nodeID: nodeID, generation: generation)
        self?.reader = reader
        defer { try? reader.cancel() }
        var source = try await BoundedPreviewRead.readSource(
          reader, maximumBytes: ImagePreviewDecoder.maximumSourceBytes
        ) { head in self?.showEmbeddedThumbnail(head) }
        defer { source.data.resetBytes(in: 0..<source.data.count) }
        let result = try await decode(source.data)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .loading else { return }
        self.placeholderWork.cancel()
        self.image = result.image
        self.details = result.details
        self.placeholder = nil
        self.animation = result.animation
        self.canAnimate = result.animation != nil
        self.firstFrameOnly = result.frameCount > 1 && result.animation == nil
        self.state = .ready
        self.reader = nil
        self.ensureStoredPreview()
        if result.frameCount == 1, let posters = self.posters,
          let revision = UInt64(exactly: source.metadata.sourceRevision), revision > 0
        {
          posters.store(
            .init(image: result.image, details: result.details),
            for: .init(nodeID: nodeID, sourceRevision: revision))
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.placeholderWork.cancel()
        self.placeholder = nil
        self.reader = nil
        self.state = .failed
        self.issue =
          error is ImagePreviewError || error is BoundedPreviewReadError
          ? Self.message(error) : FilesModel.message(error)
      }
    }
    loadTask = task
    return task
  }

  private func showEmbeddedThumbnail(_ head: Data) {
    guard state == .loading, image == nil, !placeholderWork.isRunning else { return }
    placeholderWork.start { [weak self] run in
      let thumbnail = await Task.detached(priority: .userInitiated) {
        var head = head
        defer { head.resetBytes(in: 0..<head.count) }
        return ImagePreviewDecoder.embeddedThumbnail(head)
      }.value
      guard let self, run.isCurrent, self.state == .loading, self.image == nil else { return }
      self.placeholder = thumbnail
    }
  }

  @discardableResult
  public func play() -> Task<Void, Never>? {
    guard state == .ready, !isPlaying, let animation else { return nil }
    isPlaying = true
    issue = nil
    return playback.start { [weak self, waitForFrame] run in
      do {
        while !Task.isCancelled {
          guard let index = self?.frameIndex else { return }
          let frame = try await animation.source.frame(at: index)
          try Task.checkCancellation()
          guard let self, run.isCurrent, self.state == .ready else { return }
          self.image = frame.image
          try await waitForFrame(frame.duration)
          try Task.checkCancellation()
          guard run.isCurrent else { return }
          self.frameIndex += 1
          if self.frameIndex == animation.frameCount {
            self.frameIndex = 0
            self.completedPlays += 1
            if let limit = animation.playCount, self.completedPlays >= limit {
              self.completedPlays = 0
              self.isPlaying = false
              return
            }
          }
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.isPlaying = false
        self.issue = "This animation could not be played. Try again."
      }
    }
  }

  func togglePlayback() {
    if isPlaying { pause() } else { play() }
  }

  public func pause() {
    playback.cancel()
    isPlaying = false
  }

  public func revoke() {
    pause()
    if let source = animation?.source { Task { await source.close() } }
    animation = nil
    canAnimate = false
    frameIndex = 0
    completedPlays = 0
    work.cancel()
    loadTask = nil
    placeholderWork.cancel()
    ensureWork?.cancel()
    ensureWork = nil
    detailsWork.cancel()
    try? reader?.cancel()
    reader = nil
    image = nil
    placeholder = nil
    details = nil
    name = ""
    firstFrameOnly = false
    issue = nil
    state = .revoked
  }

  private static func message(_ error: Error) -> String {
    switch error {
    case ImagePreviewError.tooLarge, BoundedPreviewReadError.tooLarge:
      return "This image is too large to preview in memory."
    default:
      return "This image could not be opened. Its format may be unsupported or the file incomplete."
    }
  }
}
