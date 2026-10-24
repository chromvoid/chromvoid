import Foundation

/// Pure shared Rust transformations of an already opened, transient document.
/// Does not read or save vault data. The presentation owner must discard results
/// after its document is closed/revoked, just as for any other derived view state.
@MainActor
public enum MarkdownProcessor {
  public static func parse(source: String) async throws -> MarkdownDocument {
    try Task.checkCancellation()
    var bytes = try await Task.detached(priority: .userInitiated) {
      try parseAirMarkdown(source: source)
    }.value
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    try Task.checkCancellation()
    return try JSONDecoder().decode(MarkdownDocument.self, from: bytes)
  }

  public static func toggleTask(
    source: String, sourceDigest: String, markerStart: UInt32, checked: Bool
  ) async throws -> String {
    try Task.checkCancellation()
    let result = try await Task.detached(priority: .userInitiated) {
      try toggleAirMarkdownTask(
        source: source, sourceDigest: sourceDigest, markerStart: markerStart, checked: checked)
    }.value
    try Task.checkCancellation()
    return result
  }
}
