import ChromVoidBridge
import SwiftUI

/// A payment card drawn as the physical object: network colours, chip, grouped number,
/// holder and expiry. Only the last four digits show unless the number was revealed.
struct PaymentCardFace: View {
  @AirLocalizedCopy private var copy
  let brand: PaymentCardBrand?
  let last4: String?
  let holder: String
  let month: Int?
  let year: Int?
  var number: String? = nil
  /// Security code as revealed; nil keeps it masked. `onToggleCode` shows the eye.
  var code: String? = nil
  var onToggleCode: (() -> Void)? = nil

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
        Text(digits)
          .font(.system(size: 21, weight: .medium, design: .monospaced))
          .tracking(1.5)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
          .accessibilityIdentifier("paymentCardNumber")
        Spacer(minLength: 8)
        HStack(alignment: .bottom) {
          VStack(alignment: .leading, spacing: 2) {
            Text(copy.text("Cardholder")).font(.system(size: 9, weight: .semibold)).opacity(0.65)
              .textCase(.uppercase)
            Text(holder.isEmpty ? "—" : holder.uppercased())
              .font(.system(size: 14, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
          }
          Spacer()
          if let onToggleCode {
            // The eye stands beside the code, not under its caption, so CVV and EXPIRES read
            // on one line.
            HStack(alignment: .bottom, spacing: 6) {
              VStack(alignment: .trailing, spacing: 2) {
                Text(copy.text("CVV")).font(.system(size: 9, weight: .semibold)).opacity(0.65)
                Text(code ?? "•••").font(.system(size: 14, weight: .medium, design: .monospaced))
                  .frame(minWidth: 30, alignment: .trailing)
                  .accessibilityIdentifier("paymentCardCode")
              }
              Button(action: onToggleCode) {
                Image(systemName: code == nil ? "eye" : "eye.slash")
                  .font(.system(size: 13, weight: .semibold)).symbolReplace()
                  .frame(width: 28, height: 28).contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .accessibilityLabel(copy.format(code == nil ? "Show: %@" : "Hide: %@", "CVV"))
              .accessibilityIdentifier("showSecret_card_cvv")
            }
            .padding(.trailing, 12)
          }
          VStack(alignment: .trailing, spacing: 2) {
            Text(copy.text("Expires")).font(.system(size: 9, weight: .semibold)).opacity(0.65)
              .textCase(.uppercase)
            Text(expiry).font(.system(size: 14, weight: .medium, design: .monospaced))
          }
        }
      }
      .padding(20)
      .foregroundStyle(.white)
    }
    .aspectRatio(1.586, contentMode: .fit)
    .frame(maxWidth: 380)
    .shadow(color: PaymentCardStyle(brand).shadow, radius: 18, y: 10)
    .privacySensitive()
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("paymentCardFace")
  }

  /// The number in the network's groups once revealed; until then dots and the last four.
  private var digits: String {
    if let number {
      let clean = PaymentCardText.digits(number)
      if !clean.isEmpty { return PaymentCardText.grouped(clean) }
    }
    return PaymentCardText.masked(
      last4: last4, format: PaymentCardRules.format(brand: brand?.wire ?? ""))
  }

  private var expiry: String {
    guard let month, let year else { return "••/••" }
    return String(format: "%02d/%02d", month, year % 100)
  }
}

/// Network mark drawn with type and simple shapes so it needs no bundled logo assets.
struct PaymentCardWordmark: View {
  let brand: PaymentCardBrand?

  var body: some View {
    switch brand {
    case .mastercard, .maestro:
      // Two interlocking circles with the overlap in its own colour, as the network draws them.
      let maestro = brand == .maestro
      let second =
        maestro
        ? Color(red: 0.00, green: 0.60, blue: 0.87) : Color(red: 0.97, green: 0.62, blue: 0.11)
      let overlap =
        maestro
        ? Color(red: 0.45, green: 0.36, blue: 0.75) : Color(red: 1.00, green: 0.37, blue: 0.00)
      ZStack {
        Circle().fill(Color(red: 0.92, green: 0.00, blue: 0.11)).offset(x: -8)
        Circle().fill(second).offset(x: 8)
        Circle().fill(overlap).offset(x: 8).mask(Circle().offset(x: -8))
      }
      .frame(width: 26, height: 26)
      .frame(width: 42)
      .accessibilityElement()
      .accessibilityLabel(brand?.name ?? "")
    case .visa:
      Text(verbatim: "VISA")
        .font(.system(size: 22, weight: .black))
        .italic()
        .tracking(0.5)
    case .some(let brand):
      Text(brand.name)
        .font(.system(size: brand == .amex ? 12 : 17, weight: .heavy))
        .textCase(brand == .jcb || brand == .mir ? .uppercase : nil)
    case .none:
      Image(systemName: "creditcard").font(.system(size: 18, weight: .medium))
        .accessibilityLabel("")
    }
  }
}
