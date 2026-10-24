import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct AcknowledgmentsTests {
  @Test func bundledNoticesAreAvailableAndSearchableWithoutAVault() async throws {
    let catalog = try await AcknowledgmentsCatalog.bundled()
    #expect(catalog.entries.count == 353)
    let runtime = try #require(
      catalog.entries.first { $0.id == "rust-runtime:compiler_builtins@0.1.160" })
    #expect(runtime.license == "MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)")
    #expect(
      runtime.documents.map(\.title) == [
        "compiler-builtins/LICENSE.txt", "libm/LICENSE.txt", "compiler-rt/CREDITS.TXT",
      ])
    let credits = try #require(runtime.documents.first { $0.title == "compiler-rt/CREDITS.TXT" })
    #expect(catalog.texts[credits.textID]?.contains("Howard Hinnant") == true)
    let crc = try #require(catalog.entries.first { $0.id == "crc32c@0.6.8" })
    #expect(crc.license == "Apache-2.0/MIT")
    #expect(crc.documents.contains { $0.source == "src/combine.rs#L1-L22" })
    let notice = try #require(crc.documents.first { $0.source == "src/combine.rs#L1-L22" })
    #expect(catalog.texts[notice.textID]?.contains("Mark Adler") == true)
    let model = AcknowledgmentsModel()
    await model.load()
    #expect(model.entries.count == catalog.entries.count)
    model.setQuery("  CRC32C  ")
    #expect(model.entries.map(\.id) == ["crc32c@0.6.8"])
    model.setQuery("MITNFA")
    #expect(model.entries.contains { $0.name == "hex_lit" })
    model.setQuery("not-a-real-component-XYZ")
    #expect(model.entries.isEmpty)
    model.setQuery("")
    #expect(model.entries.count == catalog.entries.count)
  }

  @Test func missingTextDoesNotSilentlyHideANotice() throws {
    let data = Data(
      """
      {"entries":[{"id":"test@1","name":"test","version":"1","license":"MIT",
        "documents":[{"source":"LICENSE","textID":"missing"}]}],"texts":{}}
      """.utf8)
    #expect(throws: CocoaError.self) { try AcknowledgmentsCatalog.decode(data) }
  }
}
