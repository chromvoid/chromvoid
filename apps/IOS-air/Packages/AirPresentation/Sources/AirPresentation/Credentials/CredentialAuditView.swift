import SwiftUI

struct CredentialAuditView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialAuditModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      List {
        Section {
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            Text(
              copy.text("Review weak or reused passwords and open a credential to update it."))
            Text(
              copy.text(
                "Strength is an estimate. Saved one-time codes do not confirm that a website requires two-factor authentication."
              ))
          }
        }
        if let counts = model.counts {
          Section(copy.text("Across your vault")) {
            count("Credentials", value: counts.total)
            count("Weak passwords", value: counts.weak)
            count("Reused passwords", value: counts.reused)
            count("With one-time codes", value: counts.otp)
            if counts.failed > 0 {
              count("Not checked", value: counts.failed)
              Text(
                copy.text("Some passwords could not be checked. These results are incomplete.")
              )
              .foregroundStyle(.secondary)
            }
          }.accessibilityIdentifier("auditCounts")
        }
        Section {
          Picker(
            copy.text("Show"),
            selection: Binding(get: { model.filter }, set: { model.setFilter($0) })
          ) {
            ForEach(CredentialAuditModel.Filter.allCases, id: \.self) { filter in
              Text(copy.text(filter.label)).tag(filter)
            }
          }.accessibilityIdentifier("auditFilter")
        }
        if model.state == .loading {
          Section { ProgressView(copy.text("Checking credentials…")) }
        } else if model.state == .failed || model.state == .stale {
          Section {
            Text(
              copy.text(
                model.state == .stale
                  ? "Credentials changed. Run the audit again."
                  : "Couldn’t check credentials. Try again."))
            Button(copy.text("Run audit again")) { model.reload() }
              .accessibilityIdentifier("retryAudit")
          }
        } else if model.state == .ready {
          Section(copy.text(model.filter.label)) {
            if model.rows.isEmpty {
              Text(
                copy.text(
                  model.counts?.total == 0
                    ? "Your vault is empty" : "No credentials match this check.")
              )
              .foregroundStyle(.secondary)
            }
            ForEach(model.rows, id: \.credential.id) { row in
              Button {
                model.select(row.credential.id)
              } label: {
                HStack {
                  VStack(alignment: .leading, spacing: 4) {
                    Text(
                      row.credential.title.isEmpty
                        ? copy.text("Untitled credential") : row.credential.title
                    )
                    .font(.headline)
                    if !row.credential.username.isEmpty {
                      Text(row.credential.username).foregroundStyle(.secondary)
                    }
                    if let audit = row.audit {
                      if audit.weakPassword {
                        Text(copy.text("Weak password")).font(.caption).foregroundStyle(
                          .secondary)
                      }
                      if audit.reusedPassword {
                        Text(copy.text("Password used in another credential")).font(.caption)
                          .foregroundStyle(.secondary)
                      }
                      if audit.hasTwoFactor {
                        Text(copy.text("With one-time codes")).font(.caption).foregroundStyle(
                          .secondary)
                      }
                    } else {
                      Text(copy.text("Not checked")).font(.caption).foregroundStyle(.secondary)
                    }
                  }
                  Spacer()
                  Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
                }.contentShape(Rectangle())
              }.buttonStyle(.plain).accessibilityIdentifier("auditCredential_" + row.credential.id)
            }
            if model.loadingMore {
              ProgressView()
            } else if model.canLoadMore {
              Button(copy.text("Load more")) { model.loadMore() }.accessibilityIdentifier(
                "loadMoreAudit")
            }
          }
        }
      }
      .airCanvas()
      .privacySensitive().accessibilityIdentifier("credentialAudit")
      .navigationTitle(copy.text("Security audit")).navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss)
        }
        ToolbarItem(placement: .primaryAction) {
          Button {
            model.reload()
          } label: {
            Image(systemName: "arrow.clockwise")
          }
          .accessibilityLabel(copy.text("Run audit again")).disabled(model.state == .loading)
        }
      }
      .navigationDestination(
        isPresented: Binding(
          get: { model.selected != nil }, set: { if !$0 { model.closeDetail() } })
      ) {
        if let detail = model.selected { CredentialDetailView(model: detail, lock: lock) }
      }
    }
  }
  private func count(_ label: String, value: Int) -> some View {
    HStack {
      Text(copy.text(label))
      Spacer()
      Text(copy.count(value)).foregroundStyle(.secondary)
    }
  }
}
