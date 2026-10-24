import Observation
import SwiftUI

@MainActor
@Observable
final class ShellModel {
  enum Destination: String, CaseIterable, Identifiable {
    case vault = "Vault"
    case files = "Files"
    case connections = "Connections"
    case settings = "Settings"
    var id: Self { self }
    var symbol: String {
      switch self {
      case .vault: "square.stack.3d.up"
      case .files: "folder"
      case .connections: "point.3.connected.trianglepath.dotted"
      case .settings: "gearshape"
      }
    }
  }
  var selection: Destination? = .vault
}

struct AirShellView: View {
  @AirLocalizedCopy private var copy
  var access: AccessModel
  @State private var model = ShellModel()
  @Environment(\.horizontalSizeClass) private var sizeClass

  var body: some View {
    Group {
      if sizeClass == .regular {
        NavigationSplitView {
          List(ShellModel.Destination.allCases, selection: $model.selection) { destination in
            NavigationLink(value: destination) { label(destination) }
          }
          .airCanvas()
          .navigationTitle("ChromVoid Air")
        } detail: {
          stack(model.selection ?? .vault)
        }
      } else {
        TabView(selection: $model.selection) {
          ForEach(ShellModel.Destination.allCases) { destination in
            stack(destination)
              .tabItem { label(destination) }
              .tag(Optional(destination))
          }
        }
        .modifier(AirTabBarBehavior())
      }
    }
    .accessibilityIdentifier("unlockedShell")
  }

  /// One navigation stack per destination. The vault's stack also hosts the wallet's sheets:
  /// they must hang off the stack container to present from any pushed wallet screen.
  @ViewBuilder
  private func stack(_ destination: ShellModel.Destination) -> some View {
    if destination == .vault, let wallet = access.wallet {
      NavigationStack { content(destination) }.walletSheets(wallet)
    } else {
      NavigationStack { content(destination) }
    }
  }

  @ViewBuilder
  private func label(_ destination: ShellModel.Destination) -> some View {
    if destination == .vault {
      Label {
        Text(copy.text(destination.rawValue))
      } icon: {
        Image("ChromVoidContour", bundle: .module)
      }
    } else {
      Label(copy.text(destination.rawValue), systemImage: destination.symbol)
    }
  }

  @ViewBuilder
  private func content(_ destination: ShellModel.Destination) -> some View {
    Group {
      if destination == .vault {
        if let credentials = access.credentials, let wallet = access.wallet {
          // Wallet and passkeys are sub-screens of the vault, like codes and SSH keys: the
          // collection tiles push them onto this stack, nothing lives in the tab bar. The
          // wallet declares its own pushes; only its sheets hang off the stack (see `stack`).
          CredentialsView(
            model: credentials, lock: access.lock, openPasskeys: access.openPasskeys,
            openWallet: access.openWallet,
            walletCount: wallet.state == .ready ? String(wallet.accounts.count) : nil
          )
          .navigationDestination(
            isPresented: .presented({ access.walletPresented }, close: { access.closeWallet() })
          ) {
            WalletView(model: wallet, lock: access.lock)
          }
          .navigationDestination(
            isPresented: .presented({ access.passkeys != nil }, close: { access.closePasskeys() })
          ) {
            if let passkeys = access.passkeys {
              PasskeysView(model: passkeys, lock: access.lock)
            }
          }
        } else {
          ProgressView(copy.text("Loading credentials…"))
        }
      } else if destination == .files {
        if let files = access.files {
          FilesView(model: files, lock: access.lock)
        } else {
          ProgressView(copy.text("Loading files…"))
        }
      } else if destination == .settings {
        settings
      } else if destination == .connections, let connections = access.connections {
        ConnectionsView(model: connections)
      } else {
        List {
          Section {
            Label(
              copy.text("Not available in this build"),
              systemImage: destination.symbol
            )
            .font(.headline)
            Text(
              copy.text(
                "This section will become available when its native integration is ready.")
            )
            .foregroundStyle(.secondary)
          }
        }
        .airCanvas()
      }
    }
    .navigationTitle(copy.text(destination.rawValue))
    .toolbar {
      // toolbar-mode: fixed per tab: Files carries its own lock button
      if destination != .files {
        ToolbarItem(placement: .primaryAction) {
          Button(action: access.lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
            .accessibilityIdentifier("lockVault")
        }
      }
    }
  }

  private var settings: some View {
    Form {
      AppearanceSettingsSection()
      FileSettingsSection(
        preferences: access.filePreferences, files: access.files, lock: access.lock)
      Section {
        Toggle(
          copy.text("Keep screen awake"),
          isOn: Binding(
            get: { access.keepScreenAwakeEnabled },
            set: { access.setKeepScreenAwakeEnabled($0) })
        )
        .accessibilityIdentifier("keepScreenAwakeSetting")
        Toggle(
          copy.text("Lock when leaving the app"),
          isOn: Binding(
            get: { access.lockOnBackgroundEnabled },
            set: { access.setLockOnBackgroundEnabled($0) })
        )
        .accessibilityIdentifier("lockOnBackgroundSetting")
      } header: {
        Text(copy.text("Session"))
      } footer: {
        Text(
          copy.text(
            "The screen stays awake only while the vault is open and the app is active. With locking off, the screen is covered while you are away and the vault stays open until the auto-lock timeout; locking the device always locks the vault."
          ))
      }
      Section {
        Button(action: access.openAutoFill) {
          Label(copy.text("AutoFill"), systemImage: "key.horizontal")
        }
        .accessibilityIdentifier("openAutoFill")
      } header: {
        Text(copy.text("Passwords and passkeys"))
      }
      Section {
        Picker(
          copy.text("Lock after inactivity"),
          selection: Binding(
            get: { access.autoLockTimeout }, set: { access.setAutoLockTimeout($0) })
        ) {
          ForEach(AutoLockTimeout.allCases, id: \.self) { timeout in
            Text(copy.text(timeout.label)).tag(timeout)
          }
        }
        .accessibilityIdentifier("autoLockSetting")
        Toggle(
          copy.text("Require device authentication"),
          isOn: Binding(
            get: { access.presenceEnabled }, set: { access.setPresenceEnabled($0) })
        )
        .disabled(access.busy)
        .accessibilityIdentifier("presenceSetting")
        if access.busy { ProgressView(copy.text("Waiting for device authentication…")) }
        if let issue = access.issue {
          Text(copy.text(issue.rawValue)).foregroundStyle(.secondary)
        }
      } header: {
        Text(copy.text("App access"))
      } footer: {
        Text(
          copy.text(
            "Face ID, Touch ID or your device passcode protects entry to the app. It never opens a vault."
          ))
      }
      Section(copy.text("Storage and recovery")) {
        Button {
          access.openMaintenance(.backup)
        } label: {
          Label(copy.text("Back up storage"), systemImage: "externaldrive.badge.plus")
        }.accessibilityIdentifier("openStorageBackup")
        Button {
          access.openMaintenance(.restore)
        } label: {
          Label(copy.text("Restore backup"), systemImage: "arrow.counterclockwise")
        }.accessibilityIdentifier("openStorageRestore")
      }
      Section(copy.text("Passwords")) {
        Button(copy.text("Change vault password")) { access.openMaintenance(.vaultPassword) }
          .accessibilityIdentifier("openVaultPasswordMaintenance")
        Button(copy.text("Change administrative password")) {
          access.openMaintenance(.administratorPassword)
        }
        .accessibilityIdentifier("openMasterPasswordMaintenance")
      }
      Section {
        Button(copy.text("Delete local data"), role: .destructive) {
          access.openMaintenance(.erase)
        }
        .accessibilityIdentifier("openStorageErase")
      }
      Section {
        NavigationLink {
          HelpView()
        } label: {
          Label(copy.text("Help"), systemImage: "questionmark.circle")
        }
        .accessibilityIdentifier("settingsHelp")
        LegalDocumentLinks()
        NavigationLink {
          AcknowledgmentsView()
        } label: {
          Label(copy.text("Third-party components"), systemImage: "doc.text")
        }
        .accessibilityIdentifier("openAcknowledgments")
        LabeledContent(
          copy.text("App version"),
          value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? "—")
        LabeledContent(
          copy.text("Build"),
          value: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—")
        Text(copy.text("Development edition · separate from your existing ChromVoid app"))
          .foregroundStyle(.secondary)
      } header: {
        Text(copy.text("About"))
      }
    }
    .airCanvas()
  }
}

/// On iOS 26 the tab bar shrinks while the content scrolls down and comes back on the way
/// up; earlier systems keep their fixed bar.
private struct AirTabBarBehavior: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content.tabBarMinimizeBehavior(.onScrollDown)
    } else {
      content
    }
  }
}
