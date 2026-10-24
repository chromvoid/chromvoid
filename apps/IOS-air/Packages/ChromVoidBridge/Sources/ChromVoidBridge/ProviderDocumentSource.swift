import Darwin
import Foundation
import UniformTypeIdentifiers

/// Opens the provider's temporary file before its callback returns. The owned descriptor remains
/// valid after unlink; no temporary URL or extra disk copy escapes the callback.
/// File I/O is serialized on queue. Lock protects cancellation, progress and the open reply only;
/// those invariants justify unchecked Sendable. Provider callbacks never wait for the upload.
final class ProviderDocumentSource: DocumentImportSource, @unchecked Sendable {
  private let provider: NSItemProvider
  private let identifier: String?
  private let suggestedName: String?
  private let queue = DispatchQueue(
    label: "com.chromvoid.iosair.provider-source", qos: .userInitiated)
  private let lock = NSLock()
  private var stopped = false
  private var started = false
  private var progress: Progress?
  private var opening: CheckedContinuation<DocumentSourceMetadata, Error>?
  // Queue-owned after the framework callback transfers the open descriptor.
  private var file: FileHandle?

  /// `kinds` limits which registered representation is loaded; Markdown accepts images only.
  init(provider: NSItemProvider, kinds: [UTType] = [.image]) {
    self.provider = provider
    identifier = provider.registeredTypeIdentifiers.first { identifier in
      guard let type = UTType(identifier) else { return false }
      return kinds.contains { type.conforms(to: $0) }
    }
    suggestedName = provider.suggestedName
  }

  func open() async throws -> DocumentSourceMetadata {
    try await withCheckedThrowingContinuation { reply in
      lock.lock()
      guard !started, !stopped else {
        lock.unlock()
        reply.resume(throwing: CancellationError())
        return
      }
      started = true
      opening = reply
      lock.unlock()
      queue.async { self.request() }
    }
  }

  private func request() {
    guard !isStopped, let identifier else {
      finish(.failure(isStopped ? CancellationError() : CocoaError(.fileReadUnsupportedScheme)))
      return
    }
    let progress = provider.loadFileRepresentation(forTypeIdentifier: identifier) {
      [weak self] url, error in
      guard let self else { return }
      let opened = Result { () throws -> (FileHandle, DocumentSourceMetadata) in
        guard !self.isStopped else { throw CancellationError() }
        if let error { throw error }
        guard let url else { throw CocoaError(.fileReadUnknown) }
        let handle = try FileHandle(forReadingFrom: url)
        do {
          var info = stat()
          guard fstat(handle.fileDescriptor, &info) == 0,
            info.st_mode & S_IFMT == S_IFREG, info.st_size >= 0
          else { throw CocoaError(.fileReadUnsupportedScheme) }
          // Photo pickers suggest a bare asset name; keep the representation's own extension.
          var name = self.suggestedName.flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
          if (name as NSString).pathExtension.isEmpty, !url.pathExtension.isEmpty {
            name += "." + url.pathExtension
          }
          let mime =
            UTType(identifier)?.preferredMIMEType
            ?? UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
          return (
            handle, DocumentSourceMetadata(name: name, size: UInt64(info.st_size), mimeType: mime)
          )
        } catch {
          try? handle.close()
          throw error
        }
      }
      self.queue.async { self.accept(opened) }
    }
    lock.lock()
    let canceled = stopped
    if !canceled { self.progress = progress }
    lock.unlock()
    if canceled { progress.cancel() }
  }

  private func accept(_ result: Result<(FileHandle, DocumentSourceMetadata), Error>) {
    switch result {
    case .success(let (handle, metadata)):
      guard !isStopped else {
        try? handle.close()
        finish(.failure(CancellationError()))
        return
      }
      file = handle
      finish(.success(metadata))
    case .failure(let error): finish(.failure(error))
    }
  }

  private func finish(_ result: Result<DocumentSourceMetadata, Error>) {
    lock.lock()
    let reply = opening
    opening = nil
    progress = nil
    lock.unlock()
    reply?.resume(with: result)
  }

  func read(upToCount count: Int) async throws -> Data {
    try await withCheckedThrowingContinuation { reply in
      queue.async {
        do {
          guard !self.isStopped, let file = self.file, count > 0 else { throw CancellationError() }
          var bytes = try file.read(upToCount: count) ?? Data()
          if self.isStopped {
            bytes.resetBytes(in: 0..<bytes.count)
            throw CancellationError()
          }
          reply.resume(returning: bytes)
        } catch { reply.resume(throwing: error) }
      }
    }
  }

  func cancel() {
    lock.lock()
    stopped = true
    let progress = progress
    self.progress = nil
    let reply = opening
    opening = nil
    lock.unlock()
    reply?.resume(throwing: CancellationError())
    progress?.cancel()
  }

  func close() async {
    cancel()
    await withCheckedContinuation { reply in
      queue.async {
        try? self.file?.close()
        self.file = nil
        reply.resume()
      }
    }
  }

  private var isStopped: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped
  }
}
