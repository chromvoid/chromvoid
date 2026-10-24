import Foundation

struct DocumentSourceMetadata: Sendable {
  let name: String
  let size: UInt64
  let mimeType: String?
}

/// One transient Apple input, consumed by the same bounded Core writer.
protocol DocumentImportSource: Sendable {
  func open() async throws -> DocumentSourceMetadata
  func read(upToCount count: Int) async throws -> Data
  func cancel()
  func close() async
}
