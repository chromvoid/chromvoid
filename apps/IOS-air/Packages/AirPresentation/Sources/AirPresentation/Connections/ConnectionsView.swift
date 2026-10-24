import ChromVoidBridge
import SwiftUI

struct ConnectionsView: View {
  /// The section whose buttons the keyboard must not cover.
  private static let submitAnchor = "connectionsControls"
  @AirLocalizedCopy private var copy
  @Bindable var model: ConnectionsModel
  @FocusState private var relayFocused: Bool

  var body: some View {
    ScrollViewReader { scroll in
      Form {
        Section {
          VStack(alignment: .leading, spacing: 12) {
            Image(systemName: model.activeHost ? "antenna.radiowaves.left.and.right" : "iphone")
              .font(.largeTitle)
              .foregroundStyle(Color.accentColor)
            Text(copy.text(model.hostSummary)).font(.title2.bold())
            Text(copy.text("Use this device’s vault from a trusted computer."))
              .foregroundStyle(.secondary)
          }
          .padding(.vertical, 12)
          Label(
            copy.text(model.vaultOpen ? "Vault is open" : "Vault is closed"),
            systemImage: model.vaultOpen ? "lock.open" : "lock")
        } footer: {
          Text(
            copy.text(
              "Leaving the app pauses the host and locks the vault. Returning resumes the host unless you stopped it; the vault stays locked."
            ))
        }

        if model.state == .loading || model.state == .suspended {
          Section { ProgressView(copy.text("Loading connections…")) }
        } else if model.state == .failed {
          Section {
            Text(copy.text(model.issue?.rawValue ?? "Connections could not be loaded. Try again."))
            Button(copy.text("Try again")) { model.reload() }
            Button(copy.text("Stop host"), role: .destructive) { model.stop() }
              .disabled(model.busy)
          }
        } else {
          controls
          if let pin = model.snapshot?.pairingPin { pairing(pin: pin) }
          trustedDevices
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Connections"))
      .scrollDismissesKeyboard(.interactively)
      .onChange(of: model.validationRevision) { relayFocused = true }
      .confirmationDialog(
        copy.text("Revoke access to this device?"),
        isPresented: Binding(
          get: { model.revokeCandidate != nil },
          set: { if !$0 { model.revokeCandidate = nil } }), titleVisibility: .visible
      ) {
        Button(copy.text("Revoke access"), role: .destructive) { model.confirmRevoke() }
        Button(copy.text("Cancel"), role: .cancel) { model.revokeCandidate = nil }
      } message: {
        if let peer = model.revokeCandidate {
          Text(peer.label)
          Text(copy.text("The connection will close. Pair this device again to restore access."))
        }
      }
      .accessibilityIdentifier("connectionsScreen")
      .keepsSubmitVisible(Self.submitAnchor, in: scroll)
    }
  }

  private var controls: some View {
    Section {
      TextField(copy.text("Relay URL"), text: $model.relayURL)
        .textContentType(.URL)
        .keyboardType(.URL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($relayFocused)
        .submitLabel(.go)
        .onSubmit {
          relayFocused = false
          model.submitRelay()
        }
        .disabled(model.activeHost || model.busy)
        .accessibilityIdentifier("hostRelayURL")
      if let issue = model.issue {
        Text(copy.text(issue.rawValue)).foregroundStyle(.red)
      }
      if let message = model.hostFailureMessage {
        Text(copy.text(message))
          .foregroundStyle(.secondary)
      }
      if model.activeHost || model.savedEnabled {
        Button(copy.text("Stop host"), role: .destructive) { model.stop() }
          .disabled(model.busy)
          .accessibilityIdentifier("stopHost")
      }
      if !model.activeHost {
        if !model.peers.isEmpty {
          Button(copy.text("Start host")) {
            relayFocused = false
            model.start()
          }
          .disabled(model.busy)
          .accessibilityIdentifier("startHost")
        }
        Button(copy.text("Pair a device")) {
          relayFocused = false
          model.pair()
        }
        .disabled(model.busy)
        .accessibilityIdentifier("pairHost")
      }
      if model.busy { ProgressView(copy.text("Updating trusted devices…")) }
    } header: {
      Text(copy.text("This device as host"))
    } footer: {
      if model.activeHost && model.snapshot?.pairingPin == nil {
        Text(copy.text("To pair another device, stop the host first."))
      }
    }
    .id(Self.submitAnchor)
  }

  private func pairing(pin: String) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 16) {
        Text(
          copy.text(
            "Share the invitation with ChromVoid on your computer, then enter this code there."))
        Text(pin).font(.largeTitle.monospacedDigit().bold())
          .accessibilityIdentifier("hostPairingCode")
        if let offer = model.snapshot?.pairingOffer {
          HStack {
            Text(copy.text("Expires at"))
            Text(Date(timeIntervalSince1970: Double(offer.expiresAtMs) / 1_000), style: .time)
          }.font(.footnote).foregroundStyle(.secondary)
        }
        if let invitation = model.invitationURL {
          AirQRCode(value: invitation.absoluteString)
          ShareLink(item: invitation) {
            Label(copy.text("Share invitation"), systemImage: "square.and.arrow.up")
          }
        }
        Button(copy.text("Copy pairing code"), action: model.copyPairingCode)
        Button(copy.text("Cancel pairing"), role: .cancel, action: model.stop)
      }
      .padding(.vertical, 8)
    } header: {
      Text(copy.text("Pair a device"))
    }
  }

  private var trustedDevices: some View {
    Section {
      if model.peers.isEmpty {
        Text(copy.text("No trusted devices yet. Pair your computer to get started."))
          .foregroundStyle(.secondary)
      }
      ForEach(model.peers, id: \.peerId) { peer in
        VStack(alignment: .leading, spacing: 8) {
          Label(peer.label, systemImage: "desktopcomputer").font(.headline)
          Text(
            copy.text(
              model.isConnected(peerID: peer.peerId)
                ? "Connected" : "Not connected")
          )
          .font(.subheadline).foregroundStyle(.secondary)
          Button(copy.text("Revoke access"), role: .destructive) { model.requestRevoke(peer) }
            .disabled(model.busy)
        }
        .padding(.vertical, 4)
      }
    } header: {
      Text(copy.text("Trusted devices"))
    }
  }
}
