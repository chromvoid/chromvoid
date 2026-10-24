import CoreGraphics
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest

@testable import ChromVoidBridge

final class NativeFileTransferTests: XCTestCase {
  @MainActor
  func testProviderDescriptorReadsAfterTheCallbackDeletesItsTemporaryPath() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".png")
    defer { try? FileManager.default.removeItem(at: url) }
    let bytes = Data((0..<150_003).map { UInt8(truncatingIfNeeded: $0 * 7) })
    try bytes.write(to: url)
    let source = ProviderDocumentSource(provider: EphemeralImageProvider(url: url))
    let metadata = try await source.open()
    // accept runs behind request on the source's serial queue, so the callback has returned.
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    XCTAssertEqual(metadata.size, UInt64(bytes.count))
    var received = Data()
    while true {
      let chunk = try await source.read(upToCount: 8192)
      XCTAssertLessThanOrEqual(chunk.count, 8192)
      if chunk.isEmpty { break }
      received.append(chunk)
    }
    await source.close()
    XCTAssertEqual(received, bytes)
    do {
      _ = try await source.read(upToCount: 1)
      XCTFail("Closed descriptor must not return bytes")
    } catch is CancellationError {}
  }

  @MainActor
  func testProviderImageStreamsThroughRustAfterItsTemporaryRepresentationIsReleased() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let original = directory.appendingPathComponent("source.png")
    let bytes = Data((0..<180_017).map { UInt8(truncatingIfNeeded: $0 * 17) })
    try bytes.write(to: original)
    let provider = NSItemProvider()
    provider.suggestedName = "Pasted image.png"
    provider.registerFileRepresentation(
      forTypeIdentifier: "public.png", fileOptions: [], visibility: .all
    ) { completion in
      completion(original, false, nil)
      return nil
    }
    let markdown = try await client.importMarkdownImage(
      .provider(provider), folder: "/Pasted", generation: generation, progress: { _, _ in })
    let parsed = try await MarkdownProcessor.parse(source: markdown)
    let image = try XCTUnwrap(parsed.nodes.first { $0.content.kind == .image })
    let page = try await client.filePage(
      CatalogFolderPageRequest(
        expectedVersion: nil, filter: nil, limit: 25, offset: 0, path: "/Pasted", sort: nil),
      generation: generation)
    let saved = try XCTUnwrap(page.items.first)
    XCTAssertEqual(page.items.count, 1)
    XCTAssertEqual(image.content.target?.path, "/Pasted/" + saved.name)
    XCTAssertTrue(saved.name.hasPrefix("Pasted-image-"))
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    defer { try? reader.cancel() }
    var digest = SHA256()
    var offset: UInt64 = 0
    while true {
      let chunk = try await reader.read(
        offset: offset, length: client.fileTransferLimits.readChunkBytes)
      if chunk.bytes.isEmpty { break }
      offset += UInt64(chunk.bytes.count)
      digest.update(data: chunk.bytes)
    }
    XCTAssertEqual(offset, UInt64(bytes.count))
    XCTAssertEqual(digest.finalize(), SHA256.hash(data: bytes))
  }

  @MainActor
  func testProviderCancellationFinishesWithoutWaitingForTheProviderToDeliverAFile() async throws {
    let started = expectation(description: "Provider loading")
    let canceled = expectation(description: "Provider canceled")
    let provider = NSItemProvider()
    provider.registerFileRepresentation(
      forTypeIdentifier: "public.png", fileOptions: [], visibility: .all
    ) { _ in
      let progress = Progress(totalUnitCount: 1)
      progress.cancellationHandler = { canceled.fulfill() }
      started.fulfill()
      return progress
    }
    let source = ProviderDocumentSource(provider: provider)
    let opening = Task { try await source.open() }
    await fulfillment(of: [started], timeout: 2)
    source.cancel()
    await source.close()
    do {
      _ = try await opening.value
      XCTFail("Canceled provider must not open an input")
    } catch is CancellationError {}
    await fulfillment(of: [canceled], timeout: 2)
    do {
      _ = try await source.read(upToCount: 1)
      XCTFail("Closed input must not yield bytes")
    } catch is CancellationError {}
  }

  @MainActor
  func testChunkedRoundtripPositionedReadsAndEOFThroughRust() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let limit = Int(client.fileTransferLimits.writeChunkBytes)
    let source = Data((0..<(2 * 1_024 * 1_024 + 193)).map { UInt8(truncatingIfNeeded: $0 * 31) })
    let writer = try client.beginFileWrite(
      target("roundtrip.bin", size: UInt64(source.count)), generation: generation)
    var offset = 0
    while offset < source.count {
      let end = min(offset + limit, source.count)
      let progress = try await writer.append(source.subdata(in: offset..<end))
      XCTAssertEqual(progress.uploadedBytes, end)
      XCTAssertFalse(progress.completed)
      offset = end
    }
    let committed = try await writer.finish()
    XCTAssertTrue(committed.completed)
    XCTAssertTrue(committed.created)
    XCTAssertEqual(committed.size, source.count)
    do {
      _ = try await writer.finish()
      XCTFail("Finishing twice must not execute another upload")
    } catch BridgeError.InvalidFileWriteState {}

    let reader = try client.beginFileRead(nodeID: UInt64(committed.nodeID), generation: generation)
    defer { try? reader.cancel() }
    let positioned = try await reader.read(offset: 71, length: 211)
    XCTAssertEqual(positioned.bytes, source.subdata(in: 71..<282))
    XCTAssertEqual(positioned.metadata.size, source.count)
    XCTAssertEqual(positioned.metadata.name, "roundtrip.bin")
    XCTAssertEqual(positioned.metadata.sourceRevision, committed.sourceRevision)
    var digest = SHA256()
    offset = 0
    while true {
      let chunk = try await reader.read(
        offset: UInt64(offset), length: client.fileTransferLimits.readChunkBytes)
      XCTAssertLessThanOrEqual(chunk.bytes.count, Int(client.fileTransferLimits.readChunkBytes))
      if chunk.bytes.isEmpty { break }
      digest.update(data: chunk.bytes)
      offset += chunk.bytes.count
    }
    XCTAssertEqual(offset, source.count)
    XCTAssertEqual(digest.finalize(), SHA256.hash(data: source))
    let eof = try await reader.read(offset: UInt64(source.count), length: 1)
    XCTAssertTrue(eof.bytes.isEmpty)
  }

  @MainActor
  func testEmptyFileAndCancellationReleaseTheWriterForRetry() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let canceled = try client.beginFileWrite(target("retry.bin", size: 3), generation: generation)
    _ = try await canceled.append(Data([1, 2, 3]))
    try canceled.cancel()
    try await canceled.close()
    // Retaining the Swift wrapper must not retain the closed Rust writer lease.
    let empty = try client.beginFileWrite(target("retry.bin", size: 0), generation: generation)
    let saved = try await empty.finish()
    XCTAssertTrue(saved.completed)
    XCTAssertEqual(saved.size, 0)
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    let chunk = try await reader.read(offset: 0, length: 1)
    XCTAssertTrue(chunk.bytes.isEmpty)
    XCTAssertEqual(chunk.metadata.size, 0)
    try reader.cancel()
    do {
      _ = try await reader.read(offset: 0, length: 1)
      XCTFail("A canceled reader must not return bytes")
    } catch BridgeError.InvalidFileReadState {}
  }

  @MainActor
  func testConflictsAndOversizedChunksDoNotReplaceCommittedBytes() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let original = try client.beginFileWrite(target("keep.bin", size: 3), generation: generation)
    _ = try await original.append(Data([7, 8, 9]))
    let saved = try await original.finish()
    let conflict = try client.beginFileWrite(target("keep.bin", size: 1), generation: generation)
    do {
      _ = try await conflict.append(Data([0]))
      XCTFail("Native file imports must not silently overwrite an existing file")
    } catch let error as RPCFailure {
      XCTAssertEqual(error.code, "NAME_EXIST")
    }
    try await conflict.close()
    let oversized = try client.beginFileWrite(
      target("large.bin", size: client.fileTransferLimits.writeChunkBytes + 1),
      generation: generation)
    do {
      _ = try await oversized.append(
        Data(repeating: 1, count: Int(client.fileTransferLimits.writeChunkBytes + 1)))
      XCTFail("The binary bridge must preserve Rust chunk limits")
    } catch BridgeError.InvalidFileLength {}
    try await oversized.close()
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    defer { try? reader.cancel() }
    let chunk = try await reader.read(offset: 0, length: 3)
    XCTAssertEqual(chunk.bytes, Data([7, 8, 9]))
  }

  @MainActor
  func testSwiftTaskCancellationCleansStagingAndLockRevokesReaders() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let writer = try client.beginFileWrite(target("task.bin", size: 2), generation: generation)
    _ = try await writer.append(Data([1]))
    let operation = Task { @MainActor in
      defer { try? writer.cancel() }
      do {
        _ = try await writer.append(Data([2]))
        XCTFail("The already canceled task must not append its second part")
      } catch is CancellationError {}
      try await writer.close()
    }
    // This MainActor task cannot start before this synchronous cancellation.
    operation.cancel()
    try await operation.value
    let retry = try client.beginFileWrite(target("task.bin", size: 1), generation: generation)
    _ = try await retry.append(Data([42]))
    let saved = try await retry.finish()
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    _ = try await reader.read(offset: 0, length: 1)
    let pending = try client.beginFileWrite(target("locked.bin", size: 2), generation: generation)
    _ = try await pending.append(Data([3]))
    _ = try client.lock()
    do {
      _ = try await reader.read(offset: 0, length: 1)
      XCTFail("Lock must revoke a previously successful reader")
    } catch BridgeError.SessionRevoked {}
    do {
      _ = try await pending.finish()
      XCTFail("Lock must revoke the staged writer")
    } catch BridgeError.SessionRevoked {}
    do {
      try await pending.close()
      XCTFail("A cleanup wait must report revoked session authority")
    } catch BridgeError.SessionRevoked {}
  }

  @MainActor
  func testMarkdownImagesUseSharedPreparedPathsAndTheBoundedFileWriter() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("Поездка (1).png")
    // Three writer chunks (two full, one partial) so progress reports intermediate totals
    // whatever chunk size Core advertises.
    let chunk = Int(client.fileTransferLimits.writeChunkBytes)
    let source = Data((0..<(chunk * 2 + 1_123)).map { UInt8(truncatingIfNeeded: $0 * 13) })
    try source.write(to: url)
    var progress: [UInt64] = []
    let folder = "/Заметки/Фото 100% (дом)"
    let markdown = try await client.importMarkdownImage(
      url, folder: folder, generation: generation
    ) { received, total in
      progress.append(received)
      XCTAssertEqual(total, UInt64(source.count))
    }
    XCTAssertEqual(progress.first, 0)
    XCTAssertEqual(progress.last, UInt64(source.count))
    XCTAssertGreaterThan(progress.count, 2)
    let parsed = try await MarkdownProcessor.parse(source: markdown)
    let image = try XCTUnwrap(parsed.nodes.first { $0.content.kind == .image })
    let path = try XCTUnwrap(image.content.target?.path)
    XCTAssertTrue(path.hasPrefix(folder + "/"))
    let page = try await client.filePage(
      CatalogFolderPageRequest(
        expectedVersion: nil, filter: nil, limit: 25, offset: 0, path: folder, sort: nil),
      generation: generation)
    XCTAssertEqual(page.items.count, 1)
    let file = try XCTUnwrap(page.items.first)
    XCTAssertEqual(path, folder + "/" + file.name)
    let reader = try client.beginFileRead(nodeID: UInt64(file.nodeID), generation: generation)
    defer { try? reader.cancel() }
    var bytes = Data()
    while bytes.count < source.count {
      let chunk = try await reader.read(
        offset: UInt64(bytes.count), length: client.fileTransferLimits.readChunkBytes)
      bytes.append(chunk.bytes)
    }
    XCTAssertEqual(SHA256.hash(data: bytes), SHA256.hash(data: source))
    let second = try await client.importMarkdownImage(
      url, folder: folder, generation: generation, progress: { _, _ in })
    XCTAssertNotEqual(second, markdown)
    _ = try client.lock()
    do {
      _ = try await client.importMarkdownImage(
        url, folder: folder, generation: generation, progress: { _, _ in })
      XCTFail("Old document generation must not import an image")
    } catch BridgeError.SessionRevoked {}
  }

  @MainActor
  private func openVault() async throws -> RuntimeClient {
    let client = try await RuntimeClient.open()
    addTeardownBlock { @MainActor in
      var snapshot = try client.close()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
    }
    do {
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-file-transfer-" + UUID().uuidString)
      return client
    } catch {
      _ = try? client.close()
      throw error
    }
  }

  private func target(_ name: String, size: UInt64) -> AirFileWriteTarget {
    AirFileWriteTarget(
      parentPath: "/", name: name, mimeType: "application/octet-stream", byteCount: size)
  }
}

/// A deterministic framework boundary: the temporary path expires as soon as the callback returns.
/// Immutable URL is the only added state; the source serial queue invokes this loader.
private final class EphemeralImageProvider: NSItemProvider, @unchecked Sendable {
  let url: URL
  init(url: URL) {
    self.url = url
    super.init()
  }
  override var registeredTypeIdentifiers: [String] { ["public.png"] }
  override func loadFileRepresentation(
    forTypeIdentifier typeIdentifier: String,
    completionHandler: @escaping @Sendable (URL?, (any Error)?) -> Void
  ) -> Progress {
    completionHandler(url, nil)
    try? FileManager.default.removeItem(at: url)
    return Progress(totalUnitCount: 1)
  }
}

extension NativeFileTransferTests {
  @MainActor
  func testDerivativePreviewIsStoredOnceAndReadEncryptedAfterwards() async throws {
    let client = try await openVault()
    let generation = try client.snapshot().generation
    let jpeg = try Self.noisyJPEG(width: 2400, height: 1600)
    let limit = Int(client.fileTransferLimits.writeChunkBytes)
    let writer = try client.beginFileWrite(
      target("photo.jpg", size: UInt64(jpeg.count)), generation: generation)
    var offset = 0
    while offset < jpeg.count {
      let end = min(offset + limit, jpeg.count)
      _ = try await writer.append(jpeg.subdata(in: offset..<end))
      offset = end
    }
    let committed = try await writer.finish()
    let node = UInt64(committed.nodeID)
    let revision = try XCTUnwrap(committed.sourceRevision.flatMap(UInt64.init(exactly:)))
    do {
      _ = try await client.derivative(
        nodeID: node, sourceRevision: revision, tier: .preview, ensure: false,
        generation: generation)
      XCTFail("A preview must not exist before ensure")
    } catch let failure as RPCFailure {
      XCTAssertEqual(failure.code, "NODE_NOT_FOUND")
    }
    let ensured = try await client.derivative(
      nodeID: node, sourceRevision: revision, tier: .preview, ensure: true, generation: generation)
    XCTAssertTrue(ensured.mimeType.hasPrefix("image/"))
    XCTAssertLessThan(ensured.bytes.count, jpeg.count)
    let source = try XCTUnwrap(CGImageSourceCreateWithData(ensured.bytes as CFData, nil))
    let properties = try XCTUnwrap(
      CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    let width = try XCTUnwrap((properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue)
    XCTAssertTrue(width <= 1920 && width >= 1024, "\(width)")
    let read = try await client.derivative(
      nodeID: node, sourceRevision: revision, tier: .preview, ensure: false, generation: generation)
    XCTAssertEqual(read.bytes, ensured.bytes)
    do {
      _ = try await client.derivative(
        nodeID: node, sourceRevision: revision + 1, tier: .preview, ensure: false,
        generation: generation)
      XCTFail("A stale revision must not read a derivative")
    } catch is RPCFailure {}
  }

  private static func noisyJPEG(width: Int, height: Int) throws -> Data {
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    var seed: UInt64 = 0x9E37_79B9_7F4A_7C15
    for index in stride(from: 0, to: pixels.count, by: 4) {
      seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
      pixels[index] = UInt8(truncatingIfNeeded: seed >> 56)
      pixels[index + 1] = UInt8(truncatingIfNeeded: seed >> 48)
      pixels[index + 2] = UInt8(truncatingIfNeeded: seed >> 40)
      pixels[index + 3] = 255
    }
    let provider = try XCTUnwrap(CGDataProvider(data: Data(pixels) as CFData))
    let image = try XCTUnwrap(
      CGImage(
        width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
        provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
    let output = NSMutableData()
    let destination = try XCTUnwrap(
      CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(
      destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    return output as Data
  }
}
