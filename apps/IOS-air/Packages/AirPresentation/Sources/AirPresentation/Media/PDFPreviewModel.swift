import ChromVoidBridge
import Foundation
import Observation
import PDFKit
import UniformTypeIdentifiers

/// Construction has no shared PDFKit objects. Ownership transfers once to the UI actor.
actor PDFPreviewDecoder {
  func decode(_ data: Data, password: String?) throws -> sending PDFDocument {
    guard let document = PDFDocument(data: data) else { throw PDFPreviewError.invalid }
    if let password, document.isLocked, !document.unlock(withPassword: password) {
      throw PDFPreviewError.password
    }
    guard document.isLocked || document.pageCount > 0 else { throw PDFPreviewError.invalid }
    return document
  }
}

enum PDFPreviewError: Error { case invalid, password }

@MainActor
@Observable
public final class PDFPreviewModel: Identifiable {
  public enum State: Equatable { case idle, loading, passwordRequired, ready, failed, revoked }
  public let id = UUID()
  public static let maximumSourceBytes = 32 * 1024 * 1024
  public private(set) var state: State = .idle
  /// Called synchronously at the end of `revoke()`; the PDFKit host empties its view here so
  /// no document outlives the model on screen (a deferred observation callback would leave a
  /// frame with the old pages).
  @ObservationIgnored var onRevoke: (() -> Void)?
  public private(set) var name: String
  public private(set) var document: PDFDocument?
  public private(set) var issue: String?
  public private(set) var pageIndex = 0
  public var password = ""
  private let store: any FileReadStore
  private let nodeID: UInt64
  private let generation: UInt64
  private let decoder = PDFPreviewDecoder()
  @ObservationIgnored private var encryptedData = Data()
  @ObservationIgnored private var reader: (any FileReading)?
  private let work = ModelWork()

  public init(store: any FileReadStore, nodeID: UInt64, generation: UInt64, name: String) {
    self.store = store
    self.nodeID = nodeID
    self.generation = generation
    self.name = name
  }

  public static func supports(name: String, mimeType: String?) -> Bool {
    let type =
      mimeType.flatMap { UTType(mimeType: $0) }
      ?? UTType(filenameExtension: (name as NSString).pathExtension)
    return type?.conforms(to: .pdf) == true
  }

  public var pageCount: Int { document?.pageCount ?? 0 }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard state == .idle || state == .failed || state == .passwordRequired else { return nil }
    let suppliedPassword: String? = state == .passwordRequired ? password : nil
    password = ""
    state = .loading
    issue = nil
    return work.start { [weak self, store, nodeID, generation, decoder] run in
      var data = self?.encryptedData ?? Data()
      defer { data.resetBytes(in: 0..<data.count) }
      do {
        try Task.checkCancellation()
        if data.isEmpty {
          let reader = try store.openFileReader(nodeID: nodeID, generation: generation)
          self?.reader = reader
          defer { try? reader.cancel() }
          data = try await BoundedPreviewRead.read(reader, maximumBytes: Self.maximumSourceBytes)
          self?.reader = nil
        }
        let document = try await decoder.decode(data, password: suppliedPassword)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .loading else { return }
        if document.isLocked {
          self.encryptedData = data
          self.state = .passwordRequired
        } else {
          self.clearEncryptedData()
          self.document = document
          self.pageIndex = 0
          self.state = .ready
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.reader = nil
        if case PDFPreviewError.password = error {
          self.state = .passwordRequired
          self.issue = "The PDF password is incorrect. Try again."
        } else {
          self.clearEncryptedData()
          self.state = .failed
          self.issue = Self.message(error)
        }
      }
    }
  }

  public func goToPage(_ index: Int) {
    guard state == .ready, (0..<pageCount).contains(index) else { return }
    pageIndex = index
  }

  func externalLink(_ url: URL) -> URL? {
    guard state == .ready else { return nil }
    guard let scheme = url.scheme?.lowercased(), ["https", "http", "mailto"].contains(scheme) else {
      unsupportedLink()
      return nil
    }
    return url
  }

  func unsupportedLink() {
    guard state == .ready else { return }
    issue = "This PDF link cannot be opened from the vault preview."
  }

  func clearIssue() { issue = nil }

  public func revoke() {
    work.cancel()
    try? reader?.cancel()
    reader = nil
    document?.cancelFindString()
    document = nil
    clearEncryptedData()
    password = ""
    name = ""
    issue = nil
    pageIndex = 0
    state = .revoked
    onRevoke?()
  }

  private func clearEncryptedData() {
    encryptedData.resetBytes(in: 0..<encryptedData.count)
    encryptedData.removeAll()
  }

  private static func message(_ error: Error) -> String {
    if case BoundedPreviewReadError.tooLarge = error {
      return "This PDF is too large to preview in memory."
    }
    if error is PDFPreviewError || error is BoundedPreviewReadError {
      return "This PDF could not be opened. The file may be damaged or incomplete."
    }
    return FilesModel.message(error)
  }
}
