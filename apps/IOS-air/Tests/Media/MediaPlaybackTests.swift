import AVFoundation
import ChromVoidBridge
import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct MediaPlaybackTests {
  @Test func rangeReadsAreBoundedAndStopAtEOFWithoutCopyingTheWholeFile() async throws {
    let store = MediaReadProbe()
    let source = try await MediaByteSource.open(store: store, nodeID: 4, generation: 3)
    var received = Data()
    try await source.read(offset: 5, length: 10) { received.append($0) }
    #expect(received == Data(5..<15))
    #expect(store.reads.map(\.offset) == [0, 5, 9, 13])
    #expect(store.reads.map(\.length) == [1, 4, 4, 2])
    received.removeAll()
    try await source.read(offset: 18, length: UInt64.max) { received.append($0) }
    #expect(received == Data([18, 19]))
    source.revoke()
    #expect(source.metadata == nil)
    await #expect(throws: MediaReadError.self) {
      try await source.read(offset: 0, length: 1) { _ in }
    }
  }

  @Test func changedRevisionAndLateChunkAfterRevokeNeverReachThePlayer() async throws {
    let store = MediaReadProbe()
    let source = try await MediaByteSource.open(store: store, nodeID: 4, generation: 3)
    store.revision = 2
    var received = Data()
    await #expect(throws: MediaReadError.self) {
      try await source.read(offset: 0, length: 4) { received.append($0) }
    }
    #expect(received.isEmpty)
    store.revision = 1
    store.suspend = true
    let reading = Task { try await source.read(offset: 4, length: 4) { received.append($0) } }
    await store.started()
    source.revoke()
    #expect(store.lastReader?.cancelled == true)
    store.release()
    await #expect(throws: MediaReadError.self) { try await reading.value }
    #expect(received.isEmpty && source.metadata == nil)
  }

  @Test func cancellingOneSeekDoesNotRevokeAnotherReader() async throws {
    let store = MediaReadProbe()
    let source = try await MediaByteSource.open(store: store, nodeID: 4, generation: 3)
    store.suspend = true
    let id = UUID()
    let reading = Task { try await source.read(id: id, offset: 4, length: 4) { _ in } }
    await store.started()
    let first = try #require(store.lastReader)
    var received = Data()
    let other = Task { try await source.read(offset: 12, length: 4) { received.append($0) } }
    await store.started(count: 2)
    source.cancelRead(id: id)
    reading.cancel()
    #expect(first.cancelled && store.lastReader?.cancelled == false)
    store.release()
    await #expect(throws: CancellationError.self) { try await reading.value }
    try await other.value
    #expect(received == Data(12..<16) && source.metadata != nil)
    source.revoke()
  }

  @Test func actualAVFoundationDecodesRustVideoAndPlayerRevokeDropsTheItem() async throws {
    try await withMediaRuntime { client in
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-media-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let url = try #require(
        Bundle(for: MediaFixtureBundle.self).url(forResource: "file-export", withExtension: "mp4"))
      let bytes = try Data(contentsOf: url)
      let writer = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "Video.mp4", mimeType: "video/mp4", byteCount: UInt64(bytes.count)),
        generation: generation)
      _ = try await writer.append(bytes)
      let file = try await writer.finish()
      let source = try await MediaByteSource.open(
        store: client, nodeID: UInt64(file.nodeID), generation: generation)
      let loader = try MediaAssetLoader(source: source)
      defer { loader.revoke() }
      #expect(loader.asset.referenceRestrictions == .forbidAll)
      #expect(try await loader.asset.load(.isPlayable))
      let duration = try await loader.asset.load(.duration)
      #expect(abs(duration.seconds - 1) < 0.1)
      let generator = AVAssetImageGenerator(asset: loader.asset)
      let frame = try await generator.image(at: CMTime(seconds: 0.5, preferredTimescale: 600))
      #expect(frame.image.width == 128 && frame.image.height == 96)
      generator.cancelAllCGImageGeneration()
      loader.revoke()
      #expect(source.metadata == nil)

      let model = MediaPreviewModel(
        store: client, nodeID: UInt64(file.nodeID), generation: generation, name: "Video.mp4")
      await model.load()?.value
      let player = try #require(model.player)
      #expect(model.state == .ready && player.rate == 0)
      #expect(
        await player.seek(
          to: CMTime(seconds: 0.5, preferredTimescale: 600),
          toleranceBefore: .zero, toleranceAfter: .zero))
      #expect(abs(player.currentTime().seconds - 0.5) < 0.1)
      model.revoke()
      #expect(model.state == .revoked && model.player == nil && player.currentItem == nil)
      #expect(model.name.isEmpty && model.load() == nil)
    }
  }
  @Test func actualAudioLoadsAndSeeksThroughTheSameRustReader() async throws {
    try await withMediaRuntime { client in
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-audio-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let bytes = wave()
      let writer = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "Audio.wav", mimeType: "audio/wav", byteCount: UInt64(bytes.count)),
        generation: generation)
      _ = try await writer.append(bytes)
      let file = try await writer.finish()
      let model = MediaPreviewModel(
        store: client, nodeID: UInt64(file.nodeID), generation: generation, name: "Audio.wav")
      await model.load()?.value
      let player = try #require(model.player)
      let asset = try #require(player.currentItem?.asset)
      #expect(try await asset.loadTracks(withMediaType: .audio).count == 1)
      #expect(try await asset.loadTracks(withMediaType: .video).isEmpty)
      #expect(player.rate == 0)
      #expect(
        await player.seek(
          to: CMTime(seconds: 0.75, preferredTimescale: 8000),
          toleranceBefore: .zero, toleranceAfter: .zero))
      #expect(abs(player.currentTime().seconds - 0.75) < 0.1)
      _ = try client.lock()
      model.revoke()
      #expect(player.currentItem == nil && model.player == nil && model.state == .revoked)
    }
  }

  @Test func lockDuringAVFoundationLoadingRejectsTheLateChunk() async throws {
    let store = MediaReadProbe()
    store.suspendAfterProbe = true
    let model = MediaPreviewModel(store: store, nodeID: 4, generation: 3, name: "Video.mp4")
    let loading = model.load()
    await store.started()
    model.revoke()
    #expect(store.lastReader?.cancelled == true && model.player == nil)
    store.release()
    await loading?.value
    #expect(
      model.state == .revoked && model.name.isEmpty && model.player == nil && model.issue == nil)
  }

  private func wave() -> Data {
    // One second of synthetic 8 kHz mono PCM silence; header and samples are test data only.
    var data = Data("RIFF".utf8)
    func append<T: FixedWidthInteger>(_ value: T) {
      var value = value.littleEndian
      withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
    }
    append(UInt32(16036))
    data.append(contentsOf: "WAVEfmt ".utf8)
    append(UInt32(16))
    append(UInt16(1))
    append(UInt16(1))
    append(UInt32(8000))
    append(UInt32(16000))
    append(UInt16(2))
    append(UInt16(16))
    data.append(contentsOf: "data".utf8)
    append(UInt32(16000))
    data.append(Data(repeating: 0, count: 16000))
    return data
  }

}

private final class MediaFixtureBundle: NSObject {}

@MainActor
private final class MediaReadProbe: FileReadStore {
  var revision = 1
  var reads: [(offset: UInt64, length: UInt64)] = []
  weak var lastReader: Reader?
  var suspend = false
  var suspendAfterProbe = false
  private var pending: [CheckedContinuation<Void, Never>] = []
  private var observer: CheckedContinuation<Void, Never>?
  private var awaitingCount = 1
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    #expect(nodeID == 4 && generation == 3)
    let reader = Reader(store: self)
    lastReader = reader
    return reader
  }
  func started(count: Int = 1) async {
    if pending.count >= count { return }
    awaitingCount = count
    await withCheckedContinuation { observer = $0 }
  }
  func release() {
    suspend = false
    suspendAfterProbe = false
    for continuation in pending { continuation.resume() }
    pending.removeAll()
  }
  func read(offset: UInt64, length: UInt64) async -> FileReadChunk {
    reads.append((offset, length))
    if suspend || (suspendAfterProbe && reads.count > 1) {
      await withCheckedContinuation {
        pending.append($0)
        if pending.count >= awaitingCount {
          observer?.resume()
          observer = nil
        }
      }
    }
    return FileReadChunk(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "video/mp4", name: "Video.mp4",
        nodeID: 4,
        nodeType: 0, size: 20, sourceRevision: revision, sourceRevisionInitialized: true),
      bytes: Data(UInt8(offset)..<UInt8(min(offset + length, 20))))
  }
  final class Reader: FileReading {
    let maximumChunkBytes: UInt64 = 4
    let store: MediaReadProbe
    var cancelled = false
    init(store: MediaReadProbe) { self.store = store }
    func cancel() throws { cancelled = true }
    func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
      #expect(!cancelled)
      return await store.read(offset: offset, length: length)
    }
  }
}
