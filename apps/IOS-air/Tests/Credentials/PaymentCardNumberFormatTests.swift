import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct PaymentCardNumberFormatTests {
  /// Typing digit by digit, as a keyboard delivers them, must never lose one: the field
  /// formats each edit itself instead of writing its own text back through SwiftUI.
  @Test func typingDigitByDigitKeepsEveryDigitAndTheCaret() {
    var text = ""
    var caret = 0
    for digit in "4111111111111111" {
      let result = PaymentCardNumberFormat.edit(
        text, range: NSRange(location: caret, length: 0), replacement: String(digit))
      text = result.text
      caret = result.caret
    }
    #expect(text == "4111 1111 1111 1111")
    #expect(caret == text.count)
    // American Express groups 4-6-5, by its prefix rather than by a length.
    var amex = ""
    var amexCaret = 0
    for digit in "378282246310005" {
      let result = PaymentCardNumberFormat.edit(
        amex, range: NSRange(location: amexCaret, length: 0), replacement: String(digit))
      amex = result.text
      amexCaret = result.caret
    }
    #expect(amex == "3782 822463 10005")
  }

  @Test func pasteInsertsInTheMiddleAndTheLimitHolds() {
    // A paste of the whole number at once.
    let pasted = PaymentCardNumberFormat.edit(
      "", range: NSRange(location: 0, length: 0), replacement: "4111 1111 1111 1111")
    #expect(pasted.text == "4111 1111 1111 1111")
    #expect(pasted.caret == pasted.text.count)
    // Typing in the middle moves the caret with the digit, not with the separators.
    let middle = PaymentCardNumberFormat.edit(
      "4111 1111", range: NSRange(location: 2, length: 0), replacement: "9")
    #expect(middle.text == "4191 1111 1")
    #expect(middle.caret == 3)
    // Nineteen digits is the longest number any network issues; the twentieth is dropped.
    let long = PaymentCardNumberFormat.edit(
      "", range: NSRange(location: 0, length: 0), replacement: String(repeating: "9", count: 25))
    #expect(long.text.filter(\.isNumber).count == 19)
    // A network stops at its own longest number: Mastercard at sixteen.
    let mastercard = PaymentCardNumberFormat.edit(
      "", range: NSRange(location: 0, length: 0), replacement: String(repeating: "5", count: 25))
    #expect(mastercard.text == "5555 5555 5555 5555")
    // Diners Club prints 4-6-4, as Core groups it.
    let diners = PaymentCardNumberFormat.edit(
      "", range: NSRange(location: 0, length: 0), replacement: "30569309025904")
    #expect(diners.text == "3056 930902 5904")
  }

  @Test func backspaceOverASeparatorTakesTheDigitBeforeIt() {
    // The caret sits just after the space; backspace must remove the "1", not the space.
    let result = PaymentCardNumberFormat.edit(
      "4111 1111", range: NSRange(location: 4, length: 1), replacement: "")
    #expect(result.text == "4111 111")
    #expect(result.caret == 3)
    let plain = PaymentCardNumberFormat.edit(
      "4111 1111", range: NSRange(location: 8, length: 1), replacement: "")
    #expect(plain.text == "4111 111")
    #expect(plain.caret == plain.text.count)
    let selection = PaymentCardNumberFormat.edit(
      "4111 1111 1111 1111", range: NSRange(location: 0, length: 19), replacement: "")
    #expect(selection.text.isEmpty && selection.caret == 0)
  }
}
