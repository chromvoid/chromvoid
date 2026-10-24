import ChromVoidBridge
import Foundation
import Observation
import Photos
import PhotosUI
import UniformTypeIdentifiers

/// Sequential imports preserve each confirmed result; cancellation never promises batch rollback.
@MainActor
@Observable
public final class FileImportModel: Identifiable {
  public enum State: Equatable { case choosing, running, stopping, finished, revoked }
  public enum Picker: Equatable { case files, photos, camera }
  public enum Outcome: Equatable {
    case pending, transferring, imported
    case failed(String)
    case interrupted
  }
  public struct Item: Identifiable {
    public let id = UUID()
    public let name: String
    public var received: UInt64 = 0
    public var total: UInt64 = 0
    public var outcome: Outcome = .pending
  }
  public let id = UUID()
  public private(set) var state: State = .choosing
  public private(set) var picker: Picker?
  public var pickerPresented: Bool { picker == .files }
  public private(set) var items: [Item] = []
  public private(set) var issue: String?
  private let store: any FileImportStore
  private var parent: String
  private let generation: UInt64
  private let onFinished: () -> Void
  private let work = ModelWork()
  public var destination: String { parent }
  public var busy: Bool { state == .running || state == .stopping }
  public var importedCount: Int { items.filter { $0.outcome == .imported }.count }

  public init(
    store: any FileImportStore, parent: String, generation: UInt64,
    onFinished: @escaping () -> Void
  ) {
    self.store = store
    self.parent = parent
    self.generation = generation
    self.onFinished = onFinished
  }

  public func chooseFiles() { choose(.files) }
  public func choosePhotos() { choose(.photos) }
  public func chooseCamera() { choose(.camera) }
  private func choose(_ picker: Picker) {
    guard state == .choosing || state == .finished else { return }
    items = []
    issue = nil
    state = .choosing
    self.picker = picker
  }
  public func dismissPicker() { picker = nil }

  /// Photo-library items. Each provider streams its stored representation unchanged.
  @discardableResult
  public func receiveProviders(_ providers: [NSItemProvider]) -> Task<Void, Never>? {
    guard state == .choosing else { return nil }
    picker = nil
    guard !providers.isEmpty else { return nil }
    return run(
      providers.map { provider in
        (
          name: provider.suggestedName.flatMap { $0.isEmpty ? nil : $0 } ?? "Photo",
          upload: { @MainActor store, parent, generation, progress in
            try await store.importProvider(
              provider, parent: parent, generation: generation, progress: progress)
          }
        )
      })
  }

  /// Picker results: with library access the asset's original resource is read through PhotoKit
  /// (bytes as captured, location included); otherwise the picker's own representation is used.
  @discardableResult
  public func receivePhotoResults(_ results: [PHPickerResult]) -> Task<Void, Never>? {
    guard state == .choosing else { return nil }
    picker = nil
    guard !results.isEmpty else { return nil }
    return run(
      results.map { result in
        (
          name: result.itemProvider.suggestedName.flatMap { $0.isEmpty ? nil : $0 } ?? "Photo",
          upload: { @MainActor store, parent, generation, progress in
            if let (provider, directory) = await Self.originalProvider(for: result) {
              defer { try? FileManager.default.removeItem(at: directory) }
              return try await store.importProvider(
                provider, parent: parent, generation: generation, progress: progress)
            }
            return try await store.importProvider(
              result.itemProvider, parent: parent, generation: generation, progress: progress)
          }
        )
      })
  }

  /// The untouched original as a file provider, or nil when access is not granted or the asset
  /// is unavailable. The temporary copy lives in the app's own container and is removed after
  /// the import.
  private static func originalProvider(for result: PHPickerResult) async -> (
    NSItemProvider, URL
  )? {
    guard let identifier = result.assetIdentifier else { return nil }
    let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    guard status == .authorized || status == .limited else { return nil }
    guard
      let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        .firstObject
    else { return nil }
    let resources = PHAssetResource.assetResources(for: asset)
    guard
      let resource = resources.first(where: { $0.type == .photo })
        ?? resources.first(where: { $0.type == .video }) ?? resources.first
    else { return nil }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "photo-import-" + UUID().uuidString, isDirectory: true)
    let file = directory.appendingPathComponent(resource.originalFilename)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let options = PHAssetResourceRequestOptions()
      options.isNetworkAccessAllowed = true
      try await withCheckedThrowingContinuation { (reply: CheckedContinuation<Void, Error>) in
        PHAssetResourceManager.default().writeData(for: resource, toFile: file, options: options) {
          error in
          if let error { reply.resume(throwing: error) } else { reply.resume() }
        }
      }
    } catch {
      try? FileManager.default.removeItem(at: directory)
      return nil
    }
    let provider = NSItemProvider()
    provider.suggestedName = resource.originalFilename
    let type = UTType(resource.uniformTypeIdentifier) ?? .data
    provider.registerFileRepresentation(
      forTypeIdentifier: type.identifier, fileOptions: [], visibility: .all
    ) { completion in
      completion(file, false, nil)
      return nil
    }
    return (provider, directory)
  }

  /// A fresh camera capture already encoded once; nil means the camera was dismissed.
  @discardableResult
  public func receiveCapture(_ data: Data?, takenAt: Date = Date()) -> Task<Void, Never>? {
    guard state == .choosing else { return nil }
    picker = nil
    guard let data else { return nil }
    let provider = NSItemProvider()
    provider.suggestedName = "Photo " + Self.captureStamp(takenAt) + ".jpg"
    provider.registerDataRepresentation(
      forTypeIdentifier: UTType.jpeg.identifier, visibility: .all
    ) { completion in
      completion(data, nil)
      return nil
    }
    return receiveProviders([provider])
  }

  public static func captureStamp(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd HH.mm.ss"
    return formatter.string(from: date)
  }

  @discardableResult
  public func receiveFiles(_ result: Result<[URL], Error>) -> Task<Void, Never>? {
    guard state == .choosing else { return nil }
    picker = nil
    let urls: [URL]
    do { urls = try result.get() } catch {
      if (error as NSError).code != NSUserCancelledError {
        issue = "The files could not be opened. Choose them again from Files."
      }
      return nil
    }
    guard !urls.isEmpty else { return nil }
    return run(
      urls.map { url in
        (
          name: url.lastPathComponent,
          upload: { @MainActor store, parent, generation, progress in
            try await store.importFile(
              url, parent: parent, generation: generation, progress: progress)
          }
        )
      })
  }

  private typealias Upload =
    @MainActor (
      any FileImportStore, String, UInt64, @escaping @MainActor (UInt64, UInt64) -> Void
    ) async throws -> UploadResponse

  private func run(_ entries: [(name: String, upload: Upload)]) -> Task<Void, Never> {
    items = entries.map { Item(name: $0.name) }
    state = .running
    return work.start { [weak self, store, parent, generation] run in
      for (index, entry) in entries.enumerated() {
        guard let self, run.isCurrent else { break }
        self.items[index].outcome = .transferring
        do {
          let saved = try await entry.upload(store, parent, generation) {
            [weak self] received, total in
            guard let self, self.state == .running else { return }
            self.items[index].received = received
            self.items[index].total = total
          }
          guard self.state != .revoked else { return }
          // A confirmed finish remains a success even when Stop raced with its reply.
          self.items[index].outcome = saved.completed ? .imported : .interrupted
        } catch {
          guard self.state != .revoked else { return }
          if Task.isCancelled || error is CancellationError {
            self.items[index].outcome = .interrupted
            break
          }
          self.items[index].outcome = .failed(Self.message(error))
          if error is BridgeError { break }
        }
      }
      guard let self, self.state != .revoked else { return }
      self.state = .finished
      self.onFinished()
    }
  }

  public func stop() {
    guard state == .running else { return }
    state = .stopping
    work.cancel()
  }

  public func revoke() {
    work.cancel()
    state = .revoked
    parent = ""
    picker = nil
    items = []
    issue = nil
  }

  private static func message(_ error: Error) -> String {
    if error is RPCFailure {
      return FilesModel.message(error)
    }
    if let cocoa = error as? CocoaError {
      if cocoa.code == .fileReadUnsupportedScheme {
        return "Choose individual files. Folders and packages are not supported."
      }
      return "The file could not be read. Choose it again from Files."
    }
    return "Import could not finish. Check the folder before trying this file again."
  }
}
