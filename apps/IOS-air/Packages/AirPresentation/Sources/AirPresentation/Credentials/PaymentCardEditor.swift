import ChromVoidBridge
import SwiftUI

/// The payment card as the form: number, holder, expiry and security code are typed on the
/// card face itself, in the clear. The vault is already open here, so nothing is masked and
/// there is no show/hide control whose swap used to jump the form. A field without a binding
/// (the number on an existing card) is drawn as the static face draws it.
struct PaymentCardEditor<Field: Hashable>: View {
  @AirLocalizedCopy private var copy
  let brand: PaymentCardBrand?
  var last4: String? = nil
  var number: Binding<String>? = nil
  let holder: Binding<String>
  let month: Binding<String>
  let year: Binding<String>
  var code: Binding<String>? = nil
  var focus: FocusState<Field?>.Binding
  /// The form's field ids for focus and the accessibility identifiers.
  let fields: Fields
  let identifier: (Field) -> String
  /// A changed value focuses the number; the other fields take focus through `focus`.
  var numberFocusRequest: Int? = nil
  /// The number field gained or lost focus; the form checks the number once it is left.
  var onNumberFocus: ((Bool) -> Void)? = nil
  /// Changes when the form kept less than was typed (a fourth digit of a year, a letter), so
  /// the fields are drawn again from the draft instead of showing the refused keystroke.
  var inputRevision = 0
  /// The number field is UIKit's, so it reports its own focus for the box around it.
  @State private var numberFocused = false

  struct Fields {
    var number: Field? = nil
    let holder: Field
    let month: Field
    let year: Field
    var code: Field? = nil
  }

  var body: some View {
    ZStack(alignment: .topLeading) {
      PaymentCardBackground(brand: brand)
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top) {
          PaymentCardChip()
          Spacer()
          PaymentCardWordmark(brand: brand)
            .accessibilityIdentifier("paymentCardBrand")
        }
        Spacer(minLength: 8)
        numberField
        Spacer(minLength: 8)
        HStack(alignment: .bottom, spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            caption("Cardholder")
            TextField(
              "", text: holder, prompt: prompt(copy.text("Name on card"))
            )
            .font(.system(size: 14, weight: .medium))
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .textContentType(.name)
            .focused(focus, equals: fields.holder)
            .accessibilityLabel(copy.text("Cardholder name"))
            .accessibilityIdentifier(identifier(fields.holder))
            .airCardInput(focused: focus.wrappedValue == fields.holder)
          }
          Spacer(minLength: 0)
          if let code, let codeField = fields.code {
            VStack(alignment: .trailing, spacing: 2) {
              caption("CVV")
              TextField("", text: code, prompt: prompt("•••"))
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 44)
                .focused(focus, equals: codeField)
                .accessibilityLabel(copy.text("Security code"))
                .accessibilityIdentifier(identifier(codeField))
                .airCardInput(focused: focus.wrappedValue == codeField)
            }
          }
          VStack(alignment: .trailing, spacing: 2) {
            caption("Expires")
            HStack(spacing: 4) {
              TextField("", text: month, prompt: prompt("MM"))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .frame(width: 26)
                .focused(focus, equals: fields.month)
                .accessibilityLabel(copy.text("Expiry month"))
                .accessibilityIdentifier(identifier(fields.month))
                .airCardInput(focused: focus.wrappedValue == fields.month)
              Text(verbatim: "/").opacity(0.7)
              TextField("", text: year, prompt: prompt("YY"))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                // Two digits as printed, or the full year; the narrow field keeps `MM / YY`
                // against the right edge.
                .frame(width: year.wrappedValue.count > 2 ? 40 : 26)
                .focused(focus, equals: fields.year)
                .accessibilityLabel(copy.text("Expiry year"))
                .accessibilityIdentifier(identifier(fields.year))
                .airCardInput(focused: focus.wrappedValue == fields.year)
            }
            .font(.system(size: 14, weight: .medium, design: .monospaced))
          }
        }
      }
      .padding(20)
      .foregroundStyle(.white)
      .tint(.white)
    }
    .aspectRatio(1.586, contentMode: .fit)
    .frame(maxWidth: 380)
    .shadow(color: PaymentCardStyle(brand).shadow, radius: 18, y: 10)
    .privacySensitive()
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("paymentCardFace")
  }

  @ViewBuilder private var numberField: some View {
    let font = Font.system(size: 21, weight: .medium, design: .monospaced)
    if let number, let numberField = fields.number {
      // UIKit owns the text while it is typed: the field groups the edit itself and keeps the
      // caret, so no keystroke is lost to a SwiftUI round trip (see PaymentCardNumberInput).
      PaymentCardNumberInput(
        digits: number, prompt: "•••• •••• •••• ••••", label: copy.text("Card number"),
        identifier: identifier(numberField), focusRequest: numberFocusRequest,
        onFocusChange: {
          numberFocused = $0
          onNumberFocus?($0)
        }
      )
      .frame(height: 26)
      .airCardInput(focused: numberFocused)
    } else {
      Text(
        PaymentCardText.masked(
          last4: last4, format: PaymentCardRules.format(brand: brand?.wire ?? ""))
      )
      .font(font)
      .tracking(1.5)
      .lineLimit(1)
      .minimumScaleFactor(0.6)
      .accessibilityIdentifier("paymentCardNumber")
    }
  }

  private func caption(_ key: String) -> some View {
    Text(copy.text(key)).font(.system(size: 9, weight: .semibold)).opacity(0.65)
      .textCase(.uppercase)
  }

  private func prompt(_ text: String) -> Text {
    Text(verbatim: text).foregroundStyle(.white.opacity(0.45))
  }
}

/// The gold contact chip shared by the static face and the editor.
struct PaymentCardChip: View {
  var body: some View {
    RoundedRectangle(cornerRadius: 5, style: .continuous)
      .fill(
        LinearGradient(
          colors: [
            Color(red: 0.93, green: 0.80, blue: 0.45), Color(red: 0.72, green: 0.55, blue: 0.22),
          ],
          startPoint: .topLeading, endPoint: .bottomTrailing)
      )
      .frame(width: 40, height: 30)
      .overlay {
        Path { path in
          path.move(to: CGPoint(x: 0, y: 10))
          path.addLine(to: CGPoint(x: 40, y: 10))
          path.move(to: CGPoint(x: 0, y: 20))
          path.addLine(to: CGPoint(x: 40, y: 20))
          path.move(to: CGPoint(x: 14, y: 0))
          path.addLine(to: CGPoint(x: 14, y: 30))
          path.move(to: CGPoint(x: 26, y: 0))
          path.addLine(to: CGPoint(x: 26, y: 30))
        }
        .stroke(.black.opacity(0.25), lineWidth: 1)
      }
      .accessibilityHidden(true)
  }
}

#if DEBUG
  private struct PaymentCardEditorPreview: View {
    @State private var number = "4111111111111111"
    @State private var holder = "Alice Miller"
    @State private var month = "12"
    @State private var year = "2030"
    @State private var code = ""
    @FocusState private var focus: String?
    var body: some View {
      Form {
        Section {
          PaymentCardEditor(
            brand: PaymentCardBrand.detect(number), number: $number, holder: $holder,
            month: $month, year: $year, code: $code, focus: $focus,
            fields: .init(
              number: "number", holder: "holder", month: "month", year: "year", code: "code"),
            identifier: { "preview_" + $0 }
          )
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
        }
      }
      .airCanvas()
    }
  }

  #Preview("Card editor") { PaymentCardEditorPreview() }
#endif

/// What the card face has no room for, under it: each field's error, then a warning about the
/// number, which does not stop the save.
struct PaymentCardNotes: View {
  @AirLocalizedCopy private var copy
  /// Caption and message keys, in the order of the fields on the card.
  let errors: [(label: String, message: String)]
  let warning: String?

  var body: some View {
    ForEach(errors, id: \.label) { label, message in
      Text(verbatim: copy.text(label) + ": " + copy.text(message))
        .font(.footnote).foregroundStyle(.red)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
    }
    if let warning {
      Label(copy.text(warning), systemImage: "exclamationmark.triangle")
        .font(.footnote).foregroundStyle(.orange)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
        .accessibilityIdentifier("cardNumberWarning")
    }
  }
}
