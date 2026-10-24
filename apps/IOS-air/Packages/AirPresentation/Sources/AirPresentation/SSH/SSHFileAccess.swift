import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// In-memory handoff to the system exporter; no app-owned decrypted file cache.
public struct SSHKeyDocument: FileDocument {
  public static var readableContentTypes: [UTType] { [.data] }
  private let data: Data
  public init(content: String) { data = Data(content.utf8) }
  public init(configuration: ReadConfiguration) throws {
    throw CocoaError(.fileReadUnsupportedScheme)
  }
  public func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}

enum SSHFileAccess {
  static func read(_ url: URL) async throws -> String {
    try await Task.detached {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      var coordinationError: NSError?
      var result: Result<String, Error> = .failure(CocoaError(.fileReadUnknown))
      NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) {
        selected in
        result = Result {
          let handle = try FileHandle(forReadingFrom: selected)
          defer { try? handle.close() }
          var bytes = Data()
          while bytes.count <= 65536 {
            let chunk = try handle.read(upToCount: 65537 - bytes.count) ?? Data()
            if chunk.isEmpty { break }
            bytes.append(chunk)
          }
          guard bytes.count <= 65536, let value = String(data: bytes, encoding: .utf8) else {
            throw CocoaError(.fileReadCorruptFile)
          }
          return value
        }
      }
      if let coordinationError { throw coordinationError }
      return try result.get()
    }.value
  }
}
