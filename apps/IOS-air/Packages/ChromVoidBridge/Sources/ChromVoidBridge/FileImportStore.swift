import Foundation

public enum MarkdownImageInput {
  case file(URL)
  case provider(NSItemProvider)
}

@MainActor
public protocol FileImportStore: AnyObject {
  /// Returns insertion text only after the image upload is confirmed. Core owns its destination.
  func importMarkdownImage(
    _ input: MarkdownImageInput, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String

  /// Returns only after commit or awaited cleanup. Source access is transient and user-selected.
  func importFile(
    _ url: URL, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse

  /// A photo-picker or camera item: the provider's own file representation streams into the
  /// same bounded writer, bytes untouched.
  func importProvider(
    _ provider: NSItemProvider, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse
}

extension FileImportStore {
  public func importProvider(
    _ provider: NSItemProvider, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    throw BridgeError.CapabilityUnavailable
  }
}

extension FileImportStore {
  public func importMarkdownImage(
    _ url: URL, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String {
    try await importMarkdownImage(
      .file(url), folder: folder, generation: generation, progress: progress)
  }
}

extension RuntimeClient: FileImportStore {
  public func importFile(
    _ url: URL, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    let (saved, _) = try await uploadFile(
      CoordinatedDocumentSource(url: url), generation: generation, progress: progress
    ) {
      metadata in
      (
        AirFileWriteTarget(
          parentPath: parent, name: metadata.name, mimeType: metadata.mimeType,
          byteCount: metadata.size), ()
      )
    }
    return saved
  }

  public func importProvider(
    _ provider: NSItemProvider, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    let (saved, _) = try await uploadFile(
      ProviderDocumentSource(provider: provider, kinds: [.image, .movie, .audio]),
      generation: generation, progress: progress
    ) { metadata in
      (
        AirFileWriteTarget(
          parentPath: parent, name: metadata.name, mimeType: metadata.mimeType,
          byteCount: metadata.size), ()
      )
    }
    return saved
  }

  public func importMarkdownImage(
    _ input: MarkdownImageInput, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String {
    let source: any DocumentImportSource
    switch input {
    case .file(let url): source = CoordinatedDocumentSource(url: url)
    case .provider(let provider): source = ProviderDocumentSource(provider: provider)
    }
    let (_, markdown) = try await uploadFile(source, generation: generation, progress: progress) {
      metadata in
      let destination: CatalogAttachmentResponse = try await self.perform(
        "catalog:attachment:prepare",
        data: CatalogAttachmentRequest(
          fileName: metadata.name, folderPath: folder, mimeType: metadata.mimeType ?? ""),
        phase: .unlocked, generation: generation)
      return (
        AirFileWriteTarget(
          parentPath: destination.parentPath, name: destination.name,
          mimeType: destination.mimeType, byteCount: metadata.size), destination.markdown
      )
    }
    return markdown
  }

  /// Each input owns transient access; all imports share the bounded create-only Rust writer.
  private func uploadFile<Output: Sendable>(
    _ source: any DocumentImportSource, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void,
    prepare: (DocumentSourceMetadata) async throws -> (AirFileWriteTarget, Output)
  ) async throws -> (UploadResponse, Output) {
    return try await withTaskCancellationHandler {
      var writer: FileWriteTransfer?
      do {
        try Task.checkCancellation()
        let metadata = try await source.open()
        try Task.checkCancellation()
        let (target, output) = try await prepare(metadata)
        try Task.checkCancellation()
        let transfer = try beginFileWrite(target, generation: generation)
        writer = transfer
        progress(0, metadata.size)
        while true {
          try Task.checkCancellation()
          var chunk = try await source.read(upToCount: Int(fileTransferLimits.writeChunkBytes))
          defer { chunk.resetBytes(in: 0..<chunk.count) }
          if chunk.isEmpty { break }
          let update = try await transfer.append(chunk)
          progress(UInt64(update.uploadedBytes), metadata.size)
        }
        try Task.checkCancellation()
        let saved = try await transfer.finish()
        await source.close()
        return (saved, output)
      } catch {
        await source.close()
        // A failed cleanup is authoritative too: do not start another writer over a live lease.
        try await writer?.close()
        throw error
      }
    } onCancel: {
      source.cancel()
    }
  }
}
