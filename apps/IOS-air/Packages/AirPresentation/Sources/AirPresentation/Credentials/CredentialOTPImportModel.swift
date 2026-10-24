import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class CredentialOTPImportModel: Identifiable {
  public enum State: Equatable {
    case input, authorizing
    case scanning(UUID)
    case parsing, revoked
  }
  public let id = UUID()
  public private(set) var state: State = .input
  public private(set) var uri = ""
  public private(set) var issue: String?
  public private(set) var focusRevision = 0
  private let store: any CredentialOTPStore
  private let camera: any OTPScanAccess
  private let generation: UInt64
  private let onImport: (PassmanagerOtpURIResponse) -> Void
  private let work = ModelWork()
  public init(
    store: any CredentialOTPStore, generation: UInt64,
    camera: any OTPScanAccess = SystemOTPScanAccess(),
    onImport: @escaping (PassmanagerOtpURIResponse) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.camera = camera
    self.onImport = onImport
  }
  public func changeURI(_ value: String) {
    guard state == .input, value != uri else { return }
    uri = value
    issue = nil
  }
  @discardableResult
  public func review() -> Task<Void, Never>? {
    guard state == .input else { return nil }
    guard !uri.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      issue = "Enter an otpauth setup link."
      focusRevision += 1
      return nil
    }
    return parse(uri)
  }
  @discardableResult
  private func parse(_ value: String) -> Task<Void, Never> {
    state = .parsing
    uri = ""
    issue = nil
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.parseOTPURI(value, generation: generation)
        guard let self, run.isCurrent else { return }
        self.onImport(result)
        self.revoke()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = .input
        self.uri = value
        self.issue =
          "This setup link could not be read. Check that it is an otpauth link with a valid key and supported settings."
        self.focusRevision += 1
      }
    }
  }
  @discardableResult
  public func scan() -> Task<Void, Never>? {
    guard state == .input else { return nil }
    issue = nil
    state = .authorizing
    return work.start { [weak self, camera] run in
      let access = await camera.request()
      guard let self, run.isCurrent else { return }
      switch access {
      case .ready: self.state = .scanning(UUID())
      case .denied:
        self.state = .input
        self.issue = "Allow camera access in Settings to scan a code, or paste the setup link."
      case .unavailable:
        self.state = .input
        self.issue = "QR scanning is unavailable on this device. Paste the setup link instead."
      }
    }
  }
  public func receive(_ value: String, session: UUID) {
    guard state == .scanning(session) else { return }
    parse(value)
  }
  public func scanFailed(session: UUID) {
    guard state == .scanning(session) else { return }
    useLink()
    issue = "QR scanning stopped. Try again or paste the setup link."
  }
  public func useLink() {
    guard state != .revoked else { return }
    work.cancel()
    state = .input
  }
  public func revoke() {
    work.cancel()
    state = .revoked
    uri = ""
    issue = nil
  }
}
