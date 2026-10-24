import SwiftUI
import UIKit

public struct AirRootView: View {
  private var model: AccessModel
  private var appearance: AppearancePreferences
  @Environment(\.locale) private var systemLocale

  public init(model: AccessModel, appearance: AppearancePreferences) {
    self.model = model
    self.appearance = appearance
  }

  public var body: some View {
    AirAccessRootView(model: model)
      .background { UserActivityObserver(onActivity: model.recordUserActivity) }
      .environment(appearance)
      .environment(\.locale, appearance.language.locale(system: systemLocale))
      .preferredColorScheme(appearance.theme.colorScheme)
  }
}

private struct AirAccessRootView: View {
  @AirLocalizedCopy private var copy
  @Bindable private var model: AccessModel
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(model: AccessModel) {
    self.model = model
    // A root mounted for an already-open session must not briefly build the entry navigation.
    let unlocked = model.phase == .unlocked
    _shellVisible = State(initialValue: unlocked)
    _entryVisible = State(initialValue: !unlocked)
  }

  @State private var shellVisible = false
  @State private var entryVisible = true

  private struct ShellPresentation: Equatable {
    let unlocked: Bool
    let generation: UInt64?
    let ringStartedAt: Date?
    let reduceMotion: Bool
  }

  private var shellPresentation: ShellPresentation {
    ShellPresentation(
      unlocked: model.phase == .unlocked, generation: model.vault?.generation,
      ringStartedAt: model.brandUnlockMotion?.ringStartedAt, reduceMotion: reduceMotion)
  }

  public var body: some View {
    let presentation = shellPresentation
    ZStack {
      // Opening fades the shell in over the entry screen; locking is immediate (LG05).
      ZStack {
        if entryVisible || model.phase != .unlocked {
          AccessView(model: model)
            .accessibilityHidden(shellVisible)
            .allowsHitTesting(!shellVisible)
        }
        if model.phase == .unlocked {
          // Prepare navigation at the result, so the ring's deadline only changes opacity.
          AirShellView(access: model)
            .opacity(shellVisible ? 1 : 0)
            .accessibilityHidden(!shellVisible)
            .allowsHitTesting(shellVisible)
        }
      }
      .task(id: presentation) { await presentShell(presentation) }
      .onChange(of: model.phase == .unlocked) { _, unlocked in
        if !unlocked { hideShell() }
      }
      .accessibilityHidden(model.privacyCovered)
      .allowsHitTesting(!model.privacyCovered)
      if model.privacyCovered {
        Color(uiColor: .systemBackground).ignoresSafeArea()
        VStack(spacing: 16) {
          Image(systemName: "lock.fill").font(.largeTitle).accessibilityHidden(true)
          Text("ChromVoid Air").font(.headline)
          Text(copy.text("Your private space is covered.")).foregroundStyle(.secondary)
        }
        .padding(24)
        .multilineTextAlignment(.center)
        .accessibilityIdentifier("privacyCover")
      }
    }
    .sheet(
      item: .presence({ model.autoFill }, close: { model.closeAutoFill() })
    ) { autoFill in
      AutoFillView(model: autoFill, dismiss: model.closeAutoFill)
        .overlay {
          if model.privacyCovered {
            Color(uiColor: .systemBackground).ignoresSafeArea()
          }
        }
        .accessibilityHidden(model.privacyCovered)
        .allowsHitTesting(!model.privacyCovered)
    }
    .sheet(
      item: .presence({ model.maintenance }, close: { model.closeMaintenance() })
    ) { route in
      Group {
        switch route {
        case .backup(let backup): StorageBackupView(model: backup, dismiss: model.closeMaintenance)
        case .restore(let restore):
          StorageRestoreView(model: restore, dismiss: model.closeMaintenance)
        case .erase(let erase):
          StorageEraseView(model: erase, dismiss: model.closeMaintenance)
        case .password(let password):
          PasswordMaintenanceView(model: password, dismiss: model.closeMaintenance)
        }
      }
      .overlay {
        if model.privacyCovered { Color(uiColor: .systemBackground).ignoresSafeArea() }
      }
      .accessibilityHidden(model.privacyCovered)
      .allowsHitTesting(!model.privacyCovered)
    }
    .alert(
      copy.text("Storage deletion"),
      isPresented: .presented(
        { model.eraseOutcomePresented }, close: { model.dismissEraseOutcome() })
    ) {
      Button(copy.text("Done"), action: model.dismissEraseOutcome)
    } message: {
      Text(copy.text(eraseMessage))
    }
    .task { updateScene(scenePhase) }
    .sheet(isPresented: $model.connectionsPresented) {
      NavigationStack {
        if let connections = model.connections {
          ConnectionsView(model: connections)
            .toolbar {
              ToolbarItem(placement: .cancellationAction) {
                Button(copy.text("Done")) { model.connectionsPresented = false }
              }
            }
        }
      }
      .overlay {
        if model.privacyCovered { Color(uiColor: .systemBackground).ignoresSafeArea() }
      }
      .accessibilityHidden(model.privacyCovered)
      .allowsHitTesting(!model.privacyCovered)
    }
    .onChange(of: scenePhase) { _, phase in updateScene(phase) }
    .onReceive(
      NotificationCenter.default.publisher(
        for: UIApplication.protectedDataWillBecomeUnavailableNotification)
    ) { _ in
      model.protectedDataLost()
    }
    .onReceive(
      NotificationCenter.default.publisher(
        for: UIApplication.protectedDataDidBecomeAvailableNotification)
    ) { _ in
      model.protectedDataRestored()
    }
  }

  private func presentShell(_ presentation: ShellPresentation) async {
    guard presentation.unlocked else {
      hideShell()
      return
    }
    guard !shellVisible else {
      entryVisible = false
      return
    }
    if !presentation.reduceMotion, let ringStartedAt = presentation.ringStartedAt {
      // The signal finishes in at most 220 ms; the shell begins 150 ms into its ring.
      let delay = max(0, ringStartedAt.addingTimeInterval(0.15).timeIntervalSinceNow)
      do { try await Task.sleep(for: .seconds(delay)) } catch { return }
    }
    guard !Task.isCancelled, presentation == shellPresentation else { return }
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    if presentation.reduceMotion {
      var immediate = Transaction()
      immediate.disablesAnimations = true
      withTransaction(immediate) {
        shellVisible = true
        entryVisible = false
      }
    } else {
      withAnimation(.easeOut(duration: 0.35)) { shellVisible = true }
      // Keep the mark's complete ring alive behind the shell, including its faint final frames.
      let remaining = max(
        0.35, presentation.ringStartedAt?.addingTimeInterval(0.55).timeIntervalSinceNow ?? 0)
      do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
      guard !Task.isCancelled, presentation == shellPresentation else { return }
      entryVisible = false
    }
  }

  private func hideShell() {
    var immediate = Transaction()
    immediate.disablesAnimations = true
    withTransaction(immediate) {
      shellVisible = false
      entryVisible = true
    }
  }

  private var eraseMessage: String {
    switch model.eraseOutcome {
    case .completed: "All local data has been deleted. You can set up this app again."
    case .incomplete:
      "Deletion did not finish completely. Some data or device keys could not be removed. Check storage access before continuing."
    case .unconfirmed:
      "The deletion result could not be confirmed. Check the storage state before starting another operation."
    case nil: ""
    }
  }

  private func updateScene(_ phase: ScenePhase) {
    switch phase {
    case .active:
      model.sceneActive(protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable)
    case .inactive: model.sceneInactive()
    case .background: model.sceneBackground()
    @unknown default: model.sceneBackground()
    }
  }
}
