import ChromVoidBridge
import SwiftUI

struct WalletHistoryView: View {
  @AirLocalizedCopy private var copy
  var model: WalletHistoryModel
  let accountName: String

  var body: some View {
    List {
      Section {
        LabeledContent(copy.text("Account"), value: accountName)
        LabeledContent(copy.text("Network"), value: model.network)
      }
      if let issue = model.issue { historyIssue(issue) }
      Section(copy.text("Transactions")) {
        if model.entries.isEmpty && model.state == .ready {
          Label(copy.text("No transactions yet"), systemImage: "clock")
        }
        ForEach(model.entries, id: \.txRef) { entry in
          Button {
            model.open(entry.txRef)
          } label: {
            HStack(alignment: .top, spacing: 12) {
              Image(systemName: transactionSymbol(entry.direction)).foregroundStyle(.secondary)
              VStack(alignment: .leading, spacing: 4) {
                Text(entry.amount + " " + entry.amountUnit).foregroundStyle(.primary)
                  .monospacedDigit()
                Text(copy.text(transactionStatus(entry.status))).font(.subheadline).foregroundStyle(
                  .secondary)
                if let counterparty = entry.counterparty {
                  Text(counterparty).font(.caption.monospaced()).lineLimit(1)
                    .truncationMode(.middle).foregroundStyle(.secondary)
                }
                Text(copy.date(Date(timeIntervalSince1970: Double(entry.createdAt) / 1_000))).font(
                  .caption
                ).foregroundStyle(.secondary)
              }
              Spacer()
              Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
          }
        }
        if model.activity != .idle {
          ProgressView(
            copy.text(model.activity == .synchronizing ? "Syncing transactions…" : "Loading…"))
        } else if model.nextCursor != nil {
          Button(copy.text("Load more")) { model.loadMore() }
        }
      }
      if !model.canSynchronize {
        Section {
          Text(copy.text("Showing saved transactions. Network history sync is unavailable."))
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      if model.state == .revoked { Text(copy.text("Vault locked")) }
    }
    .airCanvas()
    .navigationTitle(copy.text("Activity"))
    .privacySensitive()
    .task { await model.loadIfNeeded()?.value }
    .refreshable { await model.reload()?.value }
    .toolbar {
      Button {
        model.reload()
      } label: {
        Label(copy.text("Refresh"), systemImage: "arrow.clockwise")
      }.disabled(model.activity != .idle || model.state == .revoked)
    }
    .navigationDestination(
      isPresented: Binding(
        get: { model.selectedID != nil }, set: { if !$0 { model.closeDetail() } })
    ) {
      WalletTransactionDetailView(model: model, accountName: accountName)
    }
  }
  private func historyIssue(_ issue: WalletHistoryModel.Issue) -> some View {
    Section {
      Text(copy.text(historyIssueText(issue)))
      Button(copy.text("Try again")) { model.reload() }
        .disabled(model.activity != .idle)
    }
  }
}

private struct WalletTransactionDetailView: View {
  @AirLocalizedCopy private var copy
  var model: WalletHistoryModel
  let accountName: String
  @FocusState private var passwordFocused: Bool

  var body: some View {
    List {
      if let entry = model.selected {
        Section {
          Text(entry.amount + " " + entry.amountUnit).font(.title2.weight(.semibold))
            .monospacedDigit()
          Label(
            copy.text(transactionStatus(entry.status)),
            systemImage: transactionSymbol(entry.direction))
          LabeledContent(
            copy.text("Direction"), value: copy.text(transactionDirection(entry.direction)))
          LabeledContent(copy.text("Fee"), value: entry.fee + " " + entry.amountUnit)
        }
        Section(copy.text("Account details")) {
          LabeledContent(copy.text("Account"), value: accountName)
          LabeledContent(copy.text("Network"), value: entry.network)
          LabeledContent(copy.text("Account ID"), value: entry.accountID).font(.footnote)
        }
        Section(copy.text("Transaction details")) {
          if let counterparty = entry.counterparty {
            LabeledContent(copy.text("Counterparty")) {
              Text(counterparty).font(.footnote.monospaced())
            }
            Button(copy.text("Copy counterparty address")) { model.copy(.counterparty) }
          }
          LabeledContent(copy.text("Transaction reference")) {
            Text(entry.txHash ?? entry.messageRef ?? entry.txRef).font(.footnote.monospaced())
          }
          Button(copy.text("Copy transaction reference")) { model.copy(.reference) }
          if model.copied { Text(copy.text("Copied")).foregroundStyle(.secondary) }
          LabeledContent(
            copy.text("Created"),
            value: copy.date(Date(timeIntervalSince1970: Double(entry.createdAt) / 1_000)))
          LabeledContent(
            copy.text("Last updated"),
            value: copy.date(Date(timeIntervalSince1970: Double(entry.updatedAt) / 1_000)))
          if let validUntil = entry.validUntil {
            LabeledContent(
              copy.text("Valid until"),
              value: copy.date(Date(timeIntervalSince1970: Double(validUntil))))
          }
        }
        Section {
          if let issue = model.issue { Text(copy.text(historyIssueText(issue))) }
          Button {
            model.refreshSelected()
          } label: {
            Label(copy.text("Refresh status"), systemImage: "arrow.clockwise")
          }.disabled(!model.providerReady || model.activity != .idle || model.reviewingRebroadcast)
          if model.activity != .idle { ProgressView(copy.text("Updating…")) }
          if !model.providerReady {
            Text(copy.text("Status updates are unavailable. The saved status is shown."))
              .font(.footnote).foregroundStyle(.secondary)
          }
        }
        if model.canOfferRebroadcast {
          Section(copy.text("Rebroadcast transaction")) {
            Text(
              copy.text(
                "Rebroadcast sends the same signed transaction again. It does not create a new payment."
              )
            )
            .font(.footnote).foregroundStyle(.secondary)
            if model.requiresRebroadcastRefresh {
              Text(
                copy.text("Refresh the transaction status before trying to rebroadcast again."))
            } else if model.reviewingRebroadcast {
              SecureField(
                copy.text("Administrative password"),
                text: Binding(
                  get: { model.rebroadcastPassword },
                  set: { model.changeRebroadcastPassword($0) })
              ).textContentType(.password).focused($passwordFocused)
              Button(copy.text("Confirm rebroadcast")) {
                passwordFocused = false
                model.confirmRebroadcast()
              }.disabled(!model.canRebroadcast || model.activity != .idle)
              Button(copy.text("Cancel")) {
                passwordFocused = false
                model.cancelRebroadcast()
              }.disabled(model.activity != .idle)
            } else {
              Button(copy.text("Rebroadcast transaction")) { model.beginRebroadcast() }
                .disabled(!model.canRebroadcast || model.activity != .idle)
            }
            if !model.canRebroadcast && !model.requiresRebroadcastRefresh {
              Text(copy.text("Rebroadcast is unavailable for this account or network."))
                .font(.footnote).foregroundStyle(.secondary)
            }
          }
        }
      } else {
        Text(copy.text("Transaction unavailable"))
      }
    }
    .airCanvas()
    .navigationTitle(copy.text("Transaction"))
    .privacySensitive()
    .scrollDismissesKeyboard(.interactively)
    .navigationBarBackButtonHidden(model.activity == .rebroadcasting)
    .onChange(of: model.passwordFocusRevision) { passwordFocused = true }
  }
}

private func transactionSymbol(_ direction: WalletTransactionDirection?) -> String {
  switch direction {
  case .incoming: "arrow.down.left"
  case .outgoing: "arrow.up.right"
  case .unknown, .none: "arrow.left.arrow.right"
  }
}
private func transactionDirection(_ direction: WalletTransactionDirection?) -> String {
  switch direction {
  case .incoming: "Incoming"
  case .outgoing: "Outgoing"
  case .unknown, .none: "Unknown"
  }
}
private func transactionStatus(_ status: String) -> String {
  switch status {
  case "pending": "Pending"
  case "confirmed": "Confirmed"
  case "failed": "Failed"
  case "broadcasting": "Broadcasting"
  case "broadcast_unknown": "Broadcast status unknown"
  default: status
  }
}
private func historyIssueText(_ issue: WalletHistoryModel.Issue) -> String {
  switch issue {
  case .load: "Couldn’t load transactions. Try again."
  case .synchronization:
    "Couldn’t sync transactions. Saved transactions are still available."
  case .refresh: "Couldn’t update the transaction status. Try again."
  case .unavailable:
    "The network provider is unavailable. Saved transactions are still available."
  case .denied: "This operation is unavailable with your current access."
  case .passwordRequired: "Enter the administrative password."
  case .reauthentication:
    "The administrative password could not authorize this transfer."
  case .rebroadcastUnknown:
    "The rebroadcast outcome is unknown. Refresh the status before continuing."
  case .rebroadcastIneligible:
    "This transaction can no longer be rebroadcast. Refresh its status."
  }
}
