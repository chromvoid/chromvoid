import ChromVoidBridge
import SwiftUI

struct PasskeysView: View {
  @AirLocalizedCopy private var copy
  var model: PasskeysModel
  let lock: () -> Void

  var body: some View {
    // Pushed from the vault root; the detail push below joins the same stack.
    List {
      Section {
      } footer: {
        VStack(alignment: .leading, spacing: 4) {
          Text(copy.text("Sign in with passkeys saved in this vault."))
          Text(copy.text("AutoFill integration is still in development in this build."))
        }
      }
      if let notice = model.notice {
        Section { Text(copy.text(notice.rawValue)) }
      }
      if model.state == .loading {
        Section { ProgressView(copy.text("Loading passkeys…")) }
      } else if model.state == .failed || model.state == .uncertain {
        Section {
          if model.state == .failed {
            Text(copy.text("Couldn’t load passkeys. Try again."))
          }
          Button(copy.text("Refresh passkeys")) { model.reload() }
            .accessibilityIdentifier("retryPasskeys")
        }
      } else if model.state == .ready || model.state == .deleting {
        Section {
          if model.matches.isEmpty {
            Label(
              copy.text(
                model.rows.isEmpty ? "No passkeys in this vault" : "No matching passkeys"),
              systemImage: "person.badge.key"
            ).font(.headline).accessibilityIdentifier("passkeysEmpty")
            Text(
              copy.text(
                model.rows.isEmpty
                  ? "Passkeys are created when you register with a website or app."
                  : "Search by website or account.")
            )
            .foregroundStyle(.secondary)
          }
          ForEach(model.matches, id: \.credentialIDB64URL) { passkey in
            Button {
              model.select(passkey.credentialIDB64URL)
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "person.badge.key").foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 4) {
                  Text(passkey.rpID).font(.headline)
                  Text(account(passkey)).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
              }.contentShape(Rectangle())
            }.buttonStyle(.plain)
              .accessibilityIdentifier("passkey_" + passkey.credentialIDB64URL)
          }
        }
      }
    }
    .airCanvas()
    .privacySensitive().accessibilityIdentifier("passkeysCatalog")
    .navigationTitle(copy.text("Passkeys"))
    .searchable(
      text: Binding(get: { model.query }, set: { model.search($0) }),
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: Text(copy.text("Website or account"))
    )
    .keepsToolbarDuringSearch()
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          model.reload()
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .accessibilityLabel(copy.text("Refresh passkeys"))
        .disabled(model.state == .loading || model.state == .deleting)
      }
      ToolbarItem(placement: .primaryAction) {
        Button(action: lock) { Image(systemName: "lock") }
          .accessibilityLabel(copy.text("Lock vault"))
          .accessibilityIdentifier("lockPasskeys")
      }
    }
    .navigationDestination(
      isPresented: .presented({ model.selectedID != nil }, close: { model.closeDetail() })
    ) {
      if let passkey = model.selected { detail(passkey) }
    }
  }

  private func detail(_ passkey: VaultPasskeySummary) -> some View {
    Form {
      Section(copy.text("Website")) {
        Text(passkey.rpID).font(.headline)
        if !passkey.rpName.isEmpty && passkey.rpName != passkey.rpID {
          Text(passkey.rpName).foregroundStyle(.secondary)
        }
      }
      Section(copy.text("Account")) {
        Text(account(passkey))
        if !passkey.userDisplayName.isEmpty && passkey.userDisplayName != account(passkey) {
          Text(passkey.userDisplayName).foregroundStyle(.secondary)
        }
      }
      Section(copy.text("Details")) {
        date("Created", milliseconds: passkey.createdAtEpochMS)
        date("Last used", milliseconds: passkey.lastUsedEpochMS)
        Text(
          copy.text(
            passkey.portable
              ? "Included in compatible vault backups."
              : "This passkey cannot be transferred to another device.")
        )
        .foregroundStyle(.secondary)
      }
      Section {
        Button(copy.text("Delete passkey"), role: .destructive, action: model.requestDelete)
          .disabled(model.state != .ready)
          .accessibilityIdentifier("deletePasskey")
        if model.state == .deleting { ProgressView(copy.text("Deleting passkey…")) }
      } footer: {
        Text(
          copy.text(
            "Deleting removes this passkey from this vault. It does not delete your account or revoke the registration on the website."
          ))
      }
    }
    .airCanvas()
    .privacySensitive().accessibilityIdentifier("passkeyDetail")
    .navigationTitle(copy.text("Passkey")).navigationBarTitleDisplayMode(.inline)
    .alert(
      copy.text("Delete passkey from this vault?"),
      isPresented: .presented({ model.confirmingDelete }, close: { model.cancelDelete() })
    ) {
      Button(copy.text("Delete passkey"), role: .destructive) { model.confirmDelete() }
        .accessibilityIdentifier("confirmDeletePasskey")
      Button(copy.text("Cancel"), role: .cancel, action: model.cancelDelete)
    } message: {
      Text(copy.text("Make sure you have another way to sign in to this account."))
    }
  }

  private func account(_ passkey: VaultPasskeySummary) -> String {
    if !passkey.userName.isEmpty { return passkey.userName }
    if !passkey.userDisplayName.isEmpty { return passkey.userDisplayName }
    return copy.text("Unnamed account")
  }
  private func date(_ title: String, milliseconds: Int) -> some View {
    HStack {
      Text(copy.text(title))
      Spacer()
      if milliseconds > 0 {
        Text(Date(timeIntervalSince1970: Double(milliseconds) / 1_000), style: .date)
          .foregroundStyle(.secondary)
      } else {
        Text(copy.text("Not recorded")).foregroundStyle(.secondary)
      }
    }
  }
}
