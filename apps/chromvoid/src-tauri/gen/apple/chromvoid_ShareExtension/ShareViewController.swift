import UIKit
import UniformTypeIdentifiers

private struct StagedSharedFile {
  let stagedName: String
  let displayName: String
  let size: UInt64
  let mimeType: String?
}

final class ShareViewController: UIViewController {
  private let appGroupIdentifier = "group.com.chromvoid.app.shared"
  private var didStart = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !didStart else {
      return
    }
    didStart = true
    stageSharedItems()
  }

  private func stageSharedItems() {
    guard
      let appGroupUrl = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      completeExtension()
      return
    }

    let sessionId = "shared-\(UUID().uuidString)"
    let sessionRoot = appGroupUrl
      .appendingPathComponent("NativeStaging", isDirectory: true)
      .appendingPathComponent("shared-files", isDirectory: true)
      .appendingPathComponent(sessionId, isDirectory: true)

    do {
      try FileManager.default.createDirectory(
        at: sessionRoot,
        withIntermediateDirectories: true
      )
    } catch {
      completeExtension()
      return
    }

    let providers = extensionContext?.inputItems
      .compactMap { $0 as? NSExtensionItem }
      .flatMap { $0.attachments ?? [] } ?? []
    guard !providers.isEmpty else {
      completeExtension()
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var stagedFiles: [StagedSharedFile] = []

    for (index, provider) in providers.enumerated() {
      guard let typeIdentifier = preferredTypeIdentifier(for: provider) else {
        continue
      }

      group.enter()
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _ in
        defer {
          group.leave()
        }
        guard let url else {
          return
        }
        guard let staged = self.copySharedFile(
          source: url,
          typeIdentifier: typeIdentifier,
          index: index,
          sessionRoot: sessionRoot
        ) else {
          return
        }
        lock.lock()
        stagedFiles.append(staged)
        lock.unlock()
      }
    }

    group.notify(queue: .main) {
      guard !stagedFiles.isEmpty else {
        self.completeExtension()
        return
      }
      self.writeManifest(sessionId: sessionId, sessionRoot: sessionRoot, files: stagedFiles)
      self.completeExtension()
    }
  }

  private func preferredTypeIdentifier(for provider: NSItemProvider) -> String? {
    let supported = [
      UTType.item.identifier,
      UTType.content.identifier,
      UTType.data.identifier,
      UTType.image.identifier,
      UTType.movie.identifier,
      UTType.audio.identifier,
      UTType.pdf.identifier,
      UTType.text.identifier,
      UTType.url.identifier,
    ]
    return supported.first { provider.hasItemConformingToTypeIdentifier($0) }
  }

  private func copySharedFile(
    source: URL,
    typeIdentifier: String,
    index: Int,
    sessionRoot: URL
  ) -> StagedSharedFile? {
    let displayName = source.lastPathComponent.isEmpty ? "Shared file \(index + 1)" : source.lastPathComponent
    let extensionPart = source.pathExtension.isEmpty ? "" : ".\(source.pathExtension)"
    let stagedName = "item-\(index + 1)-\(UUID().uuidString)\(extensionPart)"
    let destination = sessionRoot.appendingPathComponent(stagedName, isDirectory: false)

    do {
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
      }
      try FileManager.default.copyItem(at: source, to: destination)
      let attributes = try FileManager.default.attributesOfItem(atPath: destination.path)
      let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
      let mimeType = UTType(typeIdentifier)?.preferredMIMEType
        ?? (source.pathExtension.isEmpty ? nil : UTType(filenameExtension: source.pathExtension)?.preferredMIMEType)
      return StagedSharedFile(
        stagedName: stagedName,
        displayName: displayName,
        size: size,
        mimeType: mimeType
      )
    } catch {
      return nil
    }
  }

  private func writeManifest(sessionId: String, sessionRoot: URL, files: [StagedSharedFile]) {
    let payload: [String: Any] = [
      "sessionId": sessionId,
      "createdAtUnixMs": Int64(Date().timeIntervalSince1970 * 1000),
      "files": files.map { file in
        [
          "stagedName": file.stagedName,
          "displayName": file.displayName,
          "size": file.size,
          "mimeType": file.mimeType ?? NSNull(),
        ] as [String: Any]
      },
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) else {
      return
    }
    try? data.write(to: sessionRoot.appendingPathComponent("manifest.json"))
  }

  private func completeExtension() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}
