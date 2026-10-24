import ChromVoidBridge
import Foundation
import Observation
import SwiftUI
import UniformTypeIdentifiers

/// Transient snapshot for an explicit system document export; no app-owned plaintext file.
public struct CredentialExportDocument: FileDocument {
  public static var readableContentTypes: [UTType] { [.json] }
  private let data: Data
  public init(data: Data) { self.data = data }
  public init(configuration: ReadConfiguration) throws {
    throw CocoaError(.fileReadUnsupportedScheme)
  }
  public func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}

@Observable
@MainActor
public final class CredentialExportModel: Identifiable {
  public enum State: Equatable {
    case ready, preparing, choosingDestination, finished, failed, revoked
  }
  public let id = UUID()
  public private(set) var state: State = .ready
  public private(set) var document: CredentialExportDocument?
  public private(set) var exporterPresented = false
  public private(set) var savedFilename = ""
  public private(set) var issue: String?
  public private(set) var attemptID: UUID?
  private let store: any CredentialExportStore
  private let generation: UInt64
  private let work = ModelWork()

  public init(store: any CredentialExportStore, generation: UInt64) {
    self.store = store
    self.generation = generation
  }

  @discardableResult
  public func chooseDestination() -> Task<Void, Never>? {
    guard state == .ready || state == .failed else { return nil }
    attemptID = UUID()
    state = .preparing
    issue = nil
    return work.start { [weak self, store, generation] run in
      do {
        let data = try await store.exportCredentialDocument(generation: generation)
        guard let self, run.isCurrent, self.state == .preparing else { return }
        self.document = CredentialExportDocument(data: data)
        self.state = .choosingDestination
        self.exporterPresented = true
      } catch {
        guard let self, run.isCurrent, self.state == .preparing else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = .failed
        self.issue =
          error.coreFailure?.code == "CREDENTIAL_EXPORT_TOO_LARGE"
          ? "This credential export is larger than 16 MiB and cannot be saved here."
          : "The credential export could not be prepared. Your vault has not changed."
      }
    }
  }

  // iOS 16 dismisses the binding before completion and sends no callback for cancellation.
  public func dismissExporter() {
    exporterPresented = false
    document = nil
    if state == .choosingDestination { state = .ready }
  }

  public func finishExport(_ result: Result<URL, Error>, attempt: UUID?) {
    guard let attempt, attempt == attemptID,
      state == .choosingDestination || state == .ready
    else { return }
    attemptID = nil
    exporterPresented = false
    document = nil
    switch result {
    case .success(let url):
      savedFilename = url.lastPathComponent
      state = .finished
    case .failure(let error):
      if (error as NSError).domain == NSCocoaErrorDomain,
        (error as NSError).code == NSUserCancelledError
      {
        state = .ready
      } else {
        state = .failed
        issue = "The export could not be saved. Check the selected location and try again."
      }
    }
  }

  public func revoke() {
    state = .revoked
    attemptID = nil
    work.cancel()
    document = nil
    exporterPresented = false
    savedFilename = ""
    issue = nil
  }
}
