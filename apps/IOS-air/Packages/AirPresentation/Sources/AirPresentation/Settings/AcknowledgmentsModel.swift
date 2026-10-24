import Foundation
import Observation

struct AcknowledgmentsCatalog: Decodable, Sendable {
  struct Document: Decodable, Identifiable, Sendable {
    let source: String
    let textID: String
    let displayName: String?
    var id: String { source + "#" + textID }
    var title: String { displayName ?? source.components(separatedBy: "/").last ?? source }
  }

  struct Entry: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let version: String
    let license: String?
    let documents: [Document]
  }

  let entries: [Entry]
  let texts: [String: String]

  static func decode(_ data: Data) throws -> Self {
    let catalog = try JSONDecoder().decode(Self.self, from: data)
    guard !catalog.entries.isEmpty,
      Set(catalog.entries.map(\.id)).count == catalog.entries.count,
      catalog.entries.allSatisfy({ entry in
        !entry.documents.isEmpty
          && Set(entry.documents.map(\.id)).count == entry.documents.count
          && entry.documents.allSatisfy { catalog.texts[$0.textID]?.isEmpty == false }
      })
    else { throw CocoaError(.fileReadCorruptFile) }
    return catalog
  }

  // Bundle I/O and decoding run on the generic executor; no vault/session is accessed.
  static func bundled() async throws -> Self {
    guard
      let url = Bundle.module.url(forResource: "ThirdPartyAcknowledgments", withExtension: "json")
    else { throw CocoaError(.fileNoSuchFile) }
    return try decode(Data(contentsOf: url))
  }
}

@MainActor
@Observable
final class AcknowledgmentsModel {
  enum State {
    case idle, loading
    case ready(AcknowledgmentsCatalog)
    case failed
  }

  private(set) var state: State = .idle
  private(set) var query = ""

  var entries: [AcknowledgmentsCatalog.Entry] {
    guard case .ready(let catalog) = state else { return [] }
    let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return catalog.entries.filter {
      search.isEmpty || $0.name.localizedStandardContains(search)
        || ($0.license?.localizedStandardContains(search) ?? false)
    }
  }

  func setQuery(_ query: String) { self.query = query }

  func load() async {
    switch state {
    case .ready, .loading: return
    case .idle, .failed: break
    }
    state = .loading
    do {
      let catalog = try await AcknowledgmentsCatalog.bundled()
      try Task.checkCancellation()
      state = .ready(catalog)
    } catch {
      state = Task.isCancelled ? .idle : .failed
    }
  }
}
