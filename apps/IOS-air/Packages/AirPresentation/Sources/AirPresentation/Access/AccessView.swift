import SwiftUI
import UIKit

struct AccessView: View {
  @AirLocalizedCopy private var copy
  @Bindable var model: AccessModel
  /// The submit button: what the keyboard must not cover.
  private static let submitAnchor = "accessSubmitAnchor"
  @State private var passwordFocus: Int?
  @State private var confirmationFocus: Int?
  @State private var revealed = false
  @State private var utilitiesPresented = false
  @State private var pendingUtility: AccessUtility?

  var body: some View {
    NavigationStack {
      Group {
        switch model.phase {
        case .welcome: welcome
        case .setup, .locked, .unlocked:
          passwordForm.allowsHitTesting(model.phase != .unlocked)
        case .presenceRequired: presence
        case .unavailable: unavailable
        case .starting: ProgressView(copy.text("Preparing secure storage…"))
        }
      }
      .navigationTitle("ChromVoid Air")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        // Storage prepares itself before the vault can be opened; bar buttons that arrive
        // afterwards would push the title sideways, so they wait in place instead.
        let started = model.phase != .starting && model.phase != .unlocked
        ToolbarItem(placement: .navigationBarLeading) {
          NavigationLink {
            HelpView()
          } label: {
            Label(copy.text("Help"), systemImage: "questionmark.circle")
          }
          .disabled(!started)
          .animation(AirMotion.feedback, value: started)
          .accessibilityIdentifier("accessHelp")
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: model.openConnections) {
            Label(
              copy.text("Connections"), systemImage: "point.3.connected.trianglepath.dotted")
          }
          .disabled(model.phase != .locked)
          .animation(AirMotion.feedback, value: model.phase == .locked)
          .accessibilityIdentifier("lockedConnections")
        }
      }
      .background(AirPalette.canvas)
    }
  }

  private var welcome: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        VStack(alignment: .leading, spacing: 20) {
          BrandMarkView(size: 72, animated: true)
          Text(copy.text("Everything yours.\nClose at hand."))
            .font(.largeTitle.bold())
            .accessibilityAddTraits(.isHeader)
          Text(
            copy.text(
              "A quiet place for your private life. Your vault opens with your password and closes when you leave the app."
            )
          )
          .font(.title3)
          .foregroundStyle(.secondary)
        }
        VStack(alignment: .leading, spacing: 20) {
          Label(
            copy.text("Encrypted on your device"),
            systemImage: "iphone.gen3.radiowaves.left.and.right")
          Label(
            copy.text("A separate password for administrative actions"),
            systemImage: "key.horizontal")
          Label(copy.text("Device authentication is optional"), systemImage: "faceid")
        }
        Button(action: model.continueWelcome) {
          Text(copy.text("Set up this device"))
            .foregroundStyle(AirPalette.onButton)
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.borderedProminent)
        .tint(AirPalette.button)
        .accessibilityIdentifier("continueWelcome")
        Button(copy.text("Restore backup")) { model.openMaintenance(.restore) }
          .accessibilityIdentifier("welcomeRestoreBackup")
        Text(copy.text("Development edition · separate from your existing ChromVoid app"))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .padding(24)
      .frame(maxWidth: 560, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .accessibilityIdentifier("welcomeScreen")
  }

  private var passwordForm: some View {
    let setup = model.phase == .setup
    return GeometryReader { proxy in
      ScrollViewReader { scroll in
        ScrollView {
          VStack(spacing: 0) {
            Spacer(minLength: 16)
            VStack(spacing: 20) {
              BrandMarkView(
                size: 96, animated: true, unlockMotion: model.brandUnlockMotion)
              VStack(spacing: 10) {
                if !setup {
                  Text(copy.text("Device locked"))
                    .font(.caption.weight(.semibold))
                    .tracking(2)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                }
                Text(copy.text(setup ? "Set your administrative password" : "Unlock your vault"))
                  .font(.largeTitle.bold())
                  .multilineTextAlignment(.center)
                  .accessibilityAddTraits(.isHeader)
                Text(
                  copy.text(
                    setup
                      ? "Keep this password safe. It protects administrative actions. You’ll use a separate vault password to open your private space."
                      : "Enter a vault password to open its space on this device.")
                )
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 340)
              }
              .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            if !setup {
              HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lock.iphone")
                  .foregroundStyle(Color.accentColor)
                  .frame(width: 24)
                  .accessibilityHidden(true)
                Text(
                  copy.text(
                    "Unlock happens on this device. Secrets stay sealed until the local vault is opened."
                  )
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
              }
              .padding(.horizontal, 28)
              .padding(.top, 24)
            }
            // The form sits in the lower third, within thumb reach and right above the keyboard.
            Spacer(minLength: 28)
            VStack(spacing: 14) {
              VStack(spacing: 0) {
                entryField(symbol: setup ? "key.horizontal" : "lock") {
                  CredentialSecretInput(
                    text: $model.password, focusRequest: passwordFocus, revealed: revealed,
                    label: copy.text(setup ? "Administrative password" : "Vault password"),
                    identifier: "accessPassword", numeric: false,
                    returnKey: setup ? .next : .go,
                    onSubmit: {
                      if setup {
                        confirmationFocus = (confirmationFocus ?? 0) + 1
                      } else {
                        model.submit()
                      }
                    }
                  )
                }
                if setup {
                  Divider().padding(.leading, 52)
                  entryField(symbol: "key.horizontal") {
                    CredentialSecretInput(
                      text: $model.confirmation, focusRequest: confirmationFocus,
                      revealed: revealed,
                      label: copy.text("Repeat administrative password"),
                      identifier: "accessConfirmation", numeric: false,
                      returnKey: .go, onSubmit: model.submit)
                  }
                }
              }
              .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
              )
              .disabled(model.busy)
              if let issue = model.issue {
                Text(copy.text(issue.rawValue))
                  .font(.footnote)
                  .foregroundStyle(.red)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .padding(.horizontal, 4)
                  .transition(.opacity.combined(with: .move(edge: .top)))
                  .accessibilityIdentifier("accessValidation")
              }
              Button(action: model.submit) {
                HStack(spacing: 10) {
                  if model.busy { ProgressView().tint(AirPalette.onButton) }
                  Text(copy.text(setup ? "Save administrative password" : "Open vault"))
                    .fontWeight(.semibold)
                }
                .foregroundStyle(AirPalette.onButton)
                .frame(maxWidth: .infinity, minHeight: 32)
              }
              .buttonStyle(.borderedProminent)
              .tint(AirPalette.button)
              .disabled(model.busy)
              .accessibilityIdentifier("submitAccess")
              if model.busy {
                Button(copy.text("Cancel"), role: .cancel, action: model.cancelOperation)
                  .transition(.opacity)
                  .accessibilityIdentifier("cancelAccess")
              }
              if setup {
                // Informational only: nothing to tick, and the action never waits for it.
                Text(LegalDocument.setupNotice(copy))
                  .font(.footnote)
                  .foregroundStyle(.secondary)
                  .multilineTextAlignment(.center)
                  .frame(maxWidth: .infinity)
                  .fixedSize(horizontal: false, vertical: true)
                  .accessibilityIdentifier("setupLegalNotice")
              }
            }
            .id(Self.submitAnchor)
            .animation(AirMotion.layout, value: model.issue)
            .animation(AirMotion.layout, value: model.busy)
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
            // Rare actions live behind one row at the bottom, away from the primary path.
            if setup {
              Button(copy.text("Restore backup")) { model.openMaintenance(.restore) }
                .font(.subheadline)
                .disabled(model.busy)
                .padding(.bottom, 12)
                .accessibilityIdentifier("accessRestoreBackup")
            } else {
              Divider().padding(.horizontal, 24)
              Button {
                utilitiesPresented = true
              } label: {
                HStack(spacing: 14) {
                  Image(systemName: "slider.horizontal.3")
                    .foregroundStyle(.secondary)
                    .frame(width: 24)
                  VStack(alignment: .leading, spacing: 3) {
                    Text(copy.text("Device utilities")).font(.headline).foregroundStyle(.primary)
                    Text(copy.text("Backup, restore and dangerous operations"))
                      .font(.footnote)
                      .foregroundStyle(.secondary)
                  }
                  Spacer(minLength: 8)
                  Image(systemName: "chevron.up")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .disabled(model.busy)
              .accessibilityIdentifier("accessUtilities")
            }
          }
          .frame(maxWidth: 560)
          .frame(maxWidth: .infinity, minHeight: proxy.size.height)
        }
        .scrollDismissesKeyboard(.interactively)
        .keepsSubmitVisible(Self.submitAnchor, in: scroll)
      }
    }
    .onChange(of: model.validationRevision) { _, revision in
      switch model.invalidField {
      case .password: passwordFocus = revision
      case .confirmation: confirmationFocus = revision
      case nil: break
      }
    }
    .onChange(of: model.phase) { revealed = false }
    .sheet(
      isPresented: $utilitiesPresented,
      onDismiss: {
        guard let utility = pendingUtility else { return }
        pendingUtility = nil
        switch utility {
        case .backup: model.openMaintenance(.backup)
        case .restore: model.openMaintenance(.restore)
        case .administratorPassword: model.openMaintenance(.administratorPassword)
        case .erase: model.openMaintenance(.erase)
        }
      }
    ) {
      AccessUtilitiesSheet { utility in
        pendingUtility = utility
        utilitiesPresented = false
      }
    }
    .accessibilityIdentifier(setup ? "setupScreen" : "lockedScreen")
  }

  private func entryField<Field: View>(symbol: String, @ViewBuilder field: () -> Field) -> some View
  {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .foregroundStyle(.secondary)
        .frame(width: 24)
        .accessibilityHidden(true)
      field()
      Button {
        revealed.toggle()
      } label: {
        Image(systemName: revealed ? "eye.slash" : "eye")
          .foregroundStyle(.secondary)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(copy.text(revealed ? "Hide password" : "Show password"))
      .accessibilityIdentifier("revealAccessPassword")
    }
    .padding(.leading, 16)
    .padding(.trailing, 4)
    .frame(minHeight: 54)
  }

  private var presence: some View {
    messageScreen(
      icon: "person.crop.circle.badge.checkmark", title: "Confirm it’s you",
      message:
        "Device authentication protects entry to the app. Your vault will still need its own password.",
      action: "Continue", identifier: "authenticatePresence", perform: model.authenticatePresence)
  }

  private var unavailable: some View {
    messageScreen(
      icon: "lock.trianglebadge.exclamationmark", title: "Storage needs your attention",
      message: model.issue?.rawValue ?? AccessModel.Issue.storage.rawValue,
      action: "Try again", identifier: "retryStorage", perform: model.retry)
  }

  private func messageScreen(
    icon: String, title: String, message: String, action: String, identifier: String,
    perform: @escaping () -> Void
  ) -> some View {
    ScrollView {
      VStack(spacing: 20) {
        Image(systemName: icon).font(.largeTitle).foregroundStyle(.secondary).accessibilityHidden(
          true)
        Text(copy.text(title)).font(.title2.bold()).accessibilityAddTraits(.isHeader)
        Text(copy.text(message)).foregroundStyle(.secondary)
        if model.phase == .presenceRequired, let issue = model.issue {
          Text(copy.text(issue.rawValue)).foregroundStyle(.secondary)
        }
        Button(action: perform) {
          HStack {
            if model.busy { ProgressView() }
            Text(copy.text(action))
          }
          .foregroundStyle(AirPalette.onButton)
          .frame(minHeight: 32)
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.busy)
        .accessibilityIdentifier(identifier)
        if model.phase == .unavailable {
          NavigationLink(copy.text("Help with secure storage")) {
            HelpTopicView(topic: .storage)
          }
          .accessibilityIdentifier("storageHelp")
        }
      }
      .multilineTextAlignment(.center)
      .padding(32)
      .frame(maxWidth: 560)
      .frame(maxWidth: .infinity)
    }
  }
}

enum AccessUtility { case backup, restore, administratorPassword, erase }

/// Secondary actions for a locked device. Every entry re-authenticates with the administrative
/// password in Core; only the vault password change stays with the unlocked settings.
private struct AccessUtilitiesSheet: View {
  @AirLocalizedCopy private var copy
  @Environment(\.dismiss) private var dismiss
  let choose: (AccessUtility) -> Void

  var body: some View {
    NavigationStack {
      List {
        Section {
          Text(
            copy.text(
              "Secondary actions stay out of the way of unlocking. Each one asks for the administrative password."
            )
          )
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 8, trailing: 4))
        }
        Section {
          utilityRow(
            "Back up storage", detail: "Encrypted local copy · administrative password",
            symbol: "square.and.arrow.up", identifier: "accessBackup"
          ) { choose(.backup) }
          utilityRow(
            "Restore backup", detail: "Replaces this device’s data · administrative password",
            symbol: "square.and.arrow.down", identifier: "accessRestoreBackup"
          ) { choose(.restore) }
          utilityRow(
            "Change administrative password",
            detail: "Protects backups and administrative actions",
            symbol: "arrow.triangle.2.circlepath", identifier: "accessAdministratorPassword"
          ) { choose(.administratorPassword) }
        }
        Section(copy.text("Danger")) {
          Button(role: .destructive) {
            choose(.erase)
          } label: {
            utilityLabel(
              "Delete local data", detail: "Permanently deletes all local data", symbol: "trash",
              tint: .red)
          }
          .accessibilityIdentifier("accessStorageErase")
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Device utilities"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Close")) { dismiss() }
        }
      }
    }
    .presentationDetents([.fraction(0.74), .large])
    .modifier(OpaqueSheetBackground())
  }

  private func utilityRow(
    _ title: String, detail: String, symbol: String, identifier: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      utilityLabel(title, detail: detail, symbol: symbol)
    }
    .tint(.primary)
    .accessibilityIdentifier(identifier)
  }

  private func utilityLabel(
    _ title: String, detail: String, symbol: String, tint: Color = .accentColor
  ) -> some View {
    HStack(spacing: 14) {
      Image(systemName: symbol)
        .font(.body.weight(.medium))
        .foregroundStyle(tint)
        .frame(width: 28)
      VStack(alignment: .leading, spacing: 3) {
        Text(copy.text(title)).foregroundStyle(tint == .red ? .red : .primary)
        Text(copy.text(detail)).font(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 8)
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.tertiary)
        .accessibilityHidden(true)
    }
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }
}

/// Sheets on recent systems are translucent by default; a reading list stays legible on an opaque
/// grouped background.
private struct OpaqueSheetBackground: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 16.4, *) {
      content.presentationBackground(AirPalette.canvas)
    } else {
      content
    }
  }
}
