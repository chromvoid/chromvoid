import UIKit

@MainActor
public protocol CredentialClipboard: AnyObject {
  func copy(_ value: String)
  func clearOwned()
}

/// An explicit export lasts briefly across app switching; no secret is retained here.
@MainActor
public final class SystemCredentialClipboard: CredentialClipboard {
  // Matches the current password-manager copy duration; native expiry is OS-owned.
  public static let lifetime: TimeInterval = 15
  private let pasteboard: UIPasteboard
  private let now: () -> Date
  private var ownedChangeCount: Int?

  public init(pasteboard: UIPasteboard = .general, now: @escaping () -> Date = Date.init) {
    self.pasteboard = pasteboard
    self.now = now
  }

  public func copy(_ value: String) {
    pasteboard.setObjects(
      [value], localOnly: true, expirationDate: now().addingTimeInterval(Self.lifetime))
    ownedChangeCount = pasteboard.changeCount
  }

  public func clearOwned() {
    defer { ownedChangeCount = nil }
    guard let ownedChangeCount, pasteboard.changeCount == ownedChangeCount else { return }
    // Read only the change counter, never another app's clipboard contents.
    pasteboard.items = []
  }
}
