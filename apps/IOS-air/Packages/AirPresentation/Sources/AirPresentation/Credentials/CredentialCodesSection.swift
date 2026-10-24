import ChromVoidBridge
import SwiftUI

/// One-time codes on the credential page. The first time-based code is requested as soon as
/// records load; the digits are grouped, the remaining time is a number with a ring, and copy
/// stays a single tap. Counter-based codes are on demand only. Adding and changing codes
/// belongs to the edit form; the page only reads them.
struct CredentialCodesSection: View {
  @AirLocalizedCopy private var copy
  var model: CredentialOTPModel
  var body: some View {
    Section {
      CredentialCodesRows(model: model)
    } header: {
      Text(copy.text("One-time codes"))
    } footer: {
      if let issue = model.issue { Text(copy.text(issue)) }
    }
  }
}

/// The code rows of one login: grouped digits, remaining time and one-tap copy. Shared by the
/// credential page and the Codes list.
struct CredentialCodesRows: View {
  @AirLocalizedCopy private var copy
  var model: CredentialOTPModel
  var body: some View {
    switch model.state {
    case .loading:
      ProgressView(copy.text("Loading codes…"))
    case .failed:
      Text(copy.text("Couldn’t load codes.")).foregroundStyle(.secondary)
      Button(copy.text("Try again")) { model.reload() }
    case .revoked, .ready:
      ForEach(model.records, id: \.label) { record in
        CredentialCodeRow(model: model, record: record, identifiers: .inline)
      }
    }
  }

  /// "123 456" and "1234 5678" read faster than an unbroken run of digits.
  static func grouped(_ code: String) -> String {
    let digits = Array(code)
    guard digits.count >= 6, digits.count % 2 == 0 else { return code }
    let half = digits.count / 2
    return String(digits[..<half]) + " " + String(digits[half...])
  }
}

/// One record's live code: label, grouped digits, remaining time and copy. The code is
/// requested on appearance and never hidden while the row is on screen.
struct CredentialCodeRow: View {
  /// Accessibility identifiers differ between the credential page and the code manager.
  struct Identifiers {
    let value: String
    let copy: String
    static let inline = Identifiers(value: "otpInlineValue", copy: "copyOTPInline_")
    static let manager = Identifiers(value: "otpValue", copy: "copyOTP_")
  }
  @AirLocalizedCopy private var copy
  var model: CredentialOTPModel
  let record: CredentialOtpSummary
  var identifiers: Identifiers = .inline
  var showsLabel = true

  var body: some View {
    let shown = model.shown[record.label]
    HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 3) {
        if showsLabel { Text(record.label).font(.footnote).foregroundStyle(.secondary) }
        if let shown {
          Text(CredentialCodesRows.grouped(shown.code))
            .font(.system(.title, design: .rounded).weight(.semibold))
            .monospacedDigit()
            .numericText()
            .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .leading)))
            .accessibilityLabel(shown.code.map(String.init).joined(separator: " "))
            .accessibilityIdentifier(identifiers.value)
        } else if model.loading.contains(record.label) {
          ProgressView().frame(height: 34)
        } else {
          Text("••• •••")
            .font(.system(.title, design: .rounded).weight(.semibold))
            .foregroundStyle(.tertiary)
            .accessibilityLabel(copy.text("Loading codes…"))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let shown {
        if let deadline = shown.deadline {
          CodeCountdown(deadline: deadline, period: max(1, record.period))
        } else if record.otpType == "HOTP", let counter = record.counter {
          Text(copy.format("Counter %@", counter)).font(.caption).foregroundStyle(.secondary)
        }
      }
      Button {
        if shown != nil {
          model.copyShownCode(record.label)
        } else {
          model.code(record.label, copy: true)
        }
      } label: {
        Image(systemName: "doc.on.doc")
          .font(.body.weight(.medium))
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .disabled(shown == nil && !model.canInteract)
      .accessibilityLabel(copy.format("Copy: %@", record.label))
      .accessibilityIdentifier(identifiers.copy + record.label)
    }
    .padding(.vertical, 2)
    .onAppear { if shown == nil { model.code(record.label) } }
  }
}

/// Seconds left as a number, with a ring for the glance. The number is the signal; the ring
/// and its late-window colour only support it.
private struct CodeCountdown: View {
  @AirLocalizedCopy private var copy
  let deadline: Date
  let period: Int
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let remaining = max(0, deadline.timeIntervalSince(context.date))
      let seconds = Int(remaining.rounded(.up))
      let late = seconds <= 5
      ZStack {
        Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 3)
        Circle()
          .trim(from: 0, to: min(1, remaining / Double(period)))
          .stroke(
            late ? Color.orange : Color.accentColor,
            style: StrokeStyle(lineWidth: 3, lineCap: .round)
          )
          .rotationEffect(.degrees(-90))
          .animation(.linear(duration: 1), value: seconds)
        Text("\(seconds)")
          .font(.caption2.weight(.semibold))
          .monospacedDigit()
          .numericText()
          .foregroundStyle(late ? Color.orange : Color.secondary)
          .animation(AirMotion.feedback, value: seconds)
      }
      .frame(width: 34, height: 34)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(copy.format("Expires in %@ s", copy.count(seconds)))
      .accessibilityIdentifier("otpInlineCountdown")
    }
  }
}

#if DEBUG
  #Preview("Codes") {
    List { CredentialCodesSection(model: CredentialPreviewFixtures.otpModel()) }
  }
#endif
