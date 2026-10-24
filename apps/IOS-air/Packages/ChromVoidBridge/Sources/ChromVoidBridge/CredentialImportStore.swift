import Foundation

@MainActor
public protocol CredentialImportStore: AnyObject {
  func reviewCredentialFile(
    _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String?
  ) async throws
    -> any CredentialImportReview
}

@MainActor
public protocol CredentialImportReview: AnyObject {
  var preview: PassmanagerRootImportPreview { get }
  func commit() async throws
  func cancel()
}

@MainActor
final class ReviewedCredentialImport: CredentialImportReview {
  let preview: PassmanagerRootImportPreview
  private let transfer: CredentialImportTransfer
  init(preview: PassmanagerRootImportPreview, transfer: CredentialImportTransfer) {
    self.preview = preview
    self.transfer = transfer
  }
  func commit() async throws { try await transfer.commit() }
  func cancel() { try? transfer.cancel() }
}

enum CredentialImportFile {
  // File-provider coordination and blocking reads stay off MainActor. No app-owned plaintext copy.
  static func read(
    _ url: URL, runtime: any AirRuntimeProtocol, mode: AirImportMode, generation: UInt64
  )
    async throws -> AirImport
  {
    let task = Task.detached {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      var result: Result<AirImport, Error>?
      var coordinationError: NSError?
      NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) {
        source in
        result = Result {
          try Task.checkCancellation()
          // URL resource values may retain an earlier size when a source file is replaced.
          let attributes = try FileManager.default.attributesOfItem(atPath: source.path)
          guard attributes[.type] as? FileAttributeType == .typeRegular,
            let size = attributes[.size] as? NSNumber
          else {
            throw CocoaError(.fileReadUnknown)
          }
          let handle = try runtime.beginRootImport(
            generation: generation, byteCount: size.uint64Value, mode: mode)
          do {
            let file = try FileHandle(forReadingFrom: source)
            defer { try? file.close() }
            let chunkSize = Int(runtime.credentialImportLimits().chunkBytes)
            while let bytes = try file.read(upToCount: chunkSize), !bytes.isEmpty {
              try Task.checkCancellation()
              _ = try handle.append(chunk: bytes)
            }
            try Task.checkCancellation()
            return handle
          } catch {
            try? handle.cancel()
            throw error
          }
        }
      }
      if let coordinationError { throw coordinationError }
      guard let result else { throw CocoaError(.fileReadUnknown) }
      return try result.get()
    }
    return try await withTaskCancellationHandler {
      let handle = try await task.value
      if Task.isCancelled {
        try? handle.cancel()
        throw CancellationError()
      }
      return handle
    } onCancel: {
      task.cancel()
    }
  }
}
