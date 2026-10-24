import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class CredentialImportModel: Identifiable {
  public enum State: Equatable {
    case choosing, password, preparing, review, confirming, committing, finished, failed, uncertain,
      revoked
  }
  public struct Warning: Identifiable {
    public let id: String
    public let message: String
    public let count: Int
  }
  public var warnings: [Warning] {
    (preview?.warnings ?? []).map { warning in
      let message: String
      switch warning.code {
      case .unsupportedRecords: message = "Unsupported records skipped, including SSH keys"
      case .passkeysOmitted: message = "Passkeys are not imported"
      case .otpInNote: message = "OTP setup saved in notes; configure codes manually"
      case .cardInNote: message = "Incomplete card details saved in notes"
      case .entryLimit: message = "Entries beyond the 10,000-item limit skipped"
      case .invalidRows: message = "CSV rows with missing fields or invalid data skipped"
      case .attachmentsOmitted: message = "Documents and attachments were not imported"
      case .iconsOmitted: message = "Some custom icons could not be imported"
      case .unmappedColumns: message = "CSV columns with unrecognized names were not imported"
      case .recordsOmitted: message = "Deleted or excluded records were not imported"
      case .legacyIdentifiersMatched: message = "Records from an earlier import will be updated"
      }
      return Warning(id: warning.code.rawValue, message: message, count: warning.count)
    }
  }
  public var reviewExplanation: String {
    preview?.source == "csv"
      ? "Importing this CSV again in merge mode adds new credentials, even when names match."
      : "Counts include supported entries that may update existing credentials."
  }
  public let id = UUID()
  public private(set) var state: State = .choosing
  public private(set) var replacing = false
  public private(set) var pickerPresented = false
  public private(set) var filename = ""
  public private(set) var preview: PassmanagerRootImportPreview?
  public private(set) var issue: String?
  public private(set) var sourcePassword = ""
  private let store: any CredentialImportStore
  private let generation: UInt64
  private let onImported: () -> Void
  @ObservationIgnored private var reviewed: (any CredentialImportReview)?
  private let work = ModelWork()
  @ObservationIgnored private var selectedURL: URL?

  public init(
    store: any CredentialImportStore, generation: UInt64, onImported: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.onImported = onImported
  }

  public func setReplacing(_ value: Bool) {
    guard state == .choosing || state == .failed else { return }
    replacing = value
  }
  public func chooseFile() {
    guard [.choosing, .password, .failed, .review].contains(state) else { return }
    reviewed?.cancel()
    reviewed = nil
    preview = nil
    filename = ""
    issue = nil
    sourcePassword = ""
    selectedURL = nil
    state = .choosing
    pickerPresented = true
  }
  public func cancelPicker() { pickerPresented = false }

  @discardableResult
  public func receiveFile(_ result: Result<URL, Error>) -> Task<Void, Never>? {
    guard state == .choosing else { return nil }
    pickerPresented = false
    let url: URL
    do { url = try result.get() } catch {
      if (error as NSError).code != NSUserCancelledError {
        state = .failed
        issue = "The file could not be opened. Choose it again from Files."
      }
      return nil
    }
    filename = url.lastPathComponent
    selectedURL = url
    return prepare(url, password: nil)
  }

  public func setSourcePassword(_ value: String) {
    guard state == .password else { return }
    sourcePassword = value
    issue = nil
  }

  @discardableResult
  public func submitPassword() -> Task<Void, Never>? {
    guard state == .password, let selectedURL else { return nil }
    // Empty passwords are valid for a source database; Core validates the actual file.
    let password = sourcePassword
    sourcePassword = ""
    return prepare(selectedURL, password: password)
  }

  private func prepare(_ url: URL, password: String?) -> Task<Void, Never> {
    issue = nil
    state = .preparing
    let mode: AirImportMode = replacing ? .replace : .merge
    return work.start { [weak self, store, generation] run in
      do {
        let reviewed = try await store.reviewCredentialFile(
          url, mode: mode, generation: generation, sourcePassword: password)
        guard let self, run.isCurrent, self.state == .preparing else {
          reviewed.cancel()
          return
        }
        self.reviewed = reviewed
        self.preview = reviewed.preview
        self.state = .review
        self.selectedURL = nil
      } catch {
        guard let self, run.isCurrent, self.state == .preparing else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        if let code = error.coreFailure?.code,
          ["CREDENTIAL_IMPORT_PASSWORD_REQUIRED", "CREDENTIAL_IMPORT_PASSWORD_INVALID"].contains(
            code)
        {
          self.state = .password
          self.issue =
            code == "CREDENTIAL_IMPORT_PASSWORD_INVALID"
            ? "That password could not open the KeePass database. Try again." : nil
          return
        }
        self.state = .failed
        self.selectedURL = nil
        switch error {
        case BridgeError.ImportTooLarge:
          self.issue = "This file is larger than 16 MiB. Choose a smaller credential export."
        case BridgeError.ImportLengthMismatch:
          self.issue = "The file could not be read completely. Choose it again."
        case is RPCFailure:
          self.issue =
            "This file could not be imported. Choose a supported export with valid credential data."
        default:
          self.issue = "The file could not be opened. Choose it again from Files."
        }
      }
    }
  }

  @discardableResult
  public func requestImport() -> Task<Void, Never>? {
    guard state == .review else { return nil }
    if replacing {
      state = .confirming
      return nil
    }
    return commit()
  }
  public func cancelConfirmation() { if state == .confirming { state = .review } }
  @discardableResult
  public func confirmReplacement() -> Task<Void, Never>? {
    guard state == .confirming else { return nil }
    return commit()
  }
  private func commit() -> Task<Void, Never>? {
    guard let reviewed else { return nil }
    state = .committing
    return work.start { [weak self] run in
      do {
        try await reviewed.commit()
        guard let self, run.isCurrent, self.state == .committing else { return }
        self.reviewed = nil
        self.state = .finished
        self.onImported()
      } catch {
        guard let self, run.isCurrent, self.state == .committing else { return }
        reviewed.cancel()
        self.reviewed = nil
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        if error.coreFailure?.code == "SYNC_CONFLICT" {
          self.state = .failed
          self.preview = nil
          self.issue =
            "Credentials changed after review. Choose the file again to review the current vault."
        } else {
          self.state = .uncertain
          self.issue =
            "The import result could not be confirmed. Close this screen and check the vault before trying again."
        }
      }
    }
  }
  public func revoke() {
    state = .revoked
    work.cancel()
    reviewed?.cancel()
    reviewed = nil
    pickerPresented = false
    filename = ""
    preview = nil
    issue = nil
    sourcePassword = ""
    selectedURL = nil
  }
}
