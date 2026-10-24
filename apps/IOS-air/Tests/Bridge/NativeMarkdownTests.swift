import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct NativeMarkdownTests {
  @Test func generatedTreeAndTaskEditsRoundTripThroughRust() async throws {
    let source = "# План\r\n\r\n- [ ] Проверить 😀\r\n\r\n[[Journal|Дневник]]\r\n"
    let document = try await MarkdownProcessor.parse(source: source)
    #expect(document.nodes.contains { $0.content.kind == .heading && $0.content.anchor == "план" })
    let marker = try #require(document.nodes.first { $0.content.kind == .task })
    #expect(marker.content.checked == false)
    let changed = try await MarkdownProcessor.toggleTask(
      source: source, sourceDigest: document.sourceDigest,
      markerStart: UInt32(marker.start), checked: false)
    #expect(changed == "# План\r\n\r\n- [x] Проверить 😀\r\n\r\n[[Journal|Дневник]]\r\n")
    do {
      _ = try await MarkdownProcessor.toggleTask(
        source: changed, sourceDigest: document.sourceDigest,
        markerStart: UInt32(marker.start), checked: false)
      Issue.record("A marker from an older source must be rejected")
    } catch AirMarkdownError.StaleTask {}
  }

  @Test func previewRetainsInertContentAndClassifiedLinks() async throws {
    let document = try await MarkdownProcessor.parse(
      source:
        "[File](/Docs/file.pdf) [Anchor](#Intro) Visit https://example.com\n\n![Remote](https://example.com/image.png)\n\n<script>alert(1)</script>\n"
    )
    let links = document.nodes.filter { $0.content.kind == .link }
    #expect(links.count == 3)
    #expect(links.contains { $0.content.target?.kind == .catalog })
    #expect(links.contains { $0.content.target?.kind == .anchor })
    #expect(links.contains { $0.content.target?.kind == .external })
    let image = try #require(document.nodes.first { $0.content.kind == .image })
    #expect(image.content.target?.kind == .blocked)
    #expect(document.nodes.contains { $0.content.text == "<script>alert(1)</script>\n" })
  }

  @Test func canceledPreviewDoesNotReturnDerivedState() async throws {
    let operation = Task { @MainActor in
      withUnsafeCurrentTask { $0?.cancel() }
      _ = try await MarkdownProcessor.parse(source: "# Private document")
    }
    do {
      try await operation.value
      Issue.record("Canceled preview must not return content")
    } catch is CancellationError {}
  }
}
