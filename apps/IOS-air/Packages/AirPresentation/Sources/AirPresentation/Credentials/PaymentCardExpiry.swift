import Foundation

/// Reading and showing a card's expiry. The card prints `MM/YY`, so the year may be typed as
/// on the card or in full; both are stored as the full year.
enum PaymentCardExpiry {
  static let monthIssue = "Enter a month from 1 to 12."
  static let yearIssue = "Enter the year as two or four digits."

  /// The month as typed, 1 to 12; nil for anything else.
  static func month(_ text: String) -> Int? {
    guard let value = number(text, digits: 1...2), (1...12).contains(value) else { return nil }
    return value
  }

  /// `35` and `2035` are both 2035. A card valid in the last century has long expired, so two
  /// digits always mean this one.
  static func year(_ text: String) -> Int? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard let value = number(trimmed, digits: 2...2) ?? number(trimmed, digits: 4...4) else {
      return nil
    }
    return value < 100 ? 2000 + value : value
  }

  /// A stored year as the editor opens it: two digits, as on the card.
  static func shortYear(_ year: Int) -> String {
    (2000..<2100).contains(year) ? String(format: "%02d", year % 100) : String(year)
  }

  /// `03 / 2035` for the detail page and the copied text. A year saved as two digits by an
  /// earlier version reads as the full year.
  static func display(month: Int, year: Int) -> String {
    String(format: "%02d / %d", month, year < 100 ? 2000 + year : year)
  }

  private static func number(_ text: String, digits: ClosedRange<Int>) -> Int? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard digits.contains(trimmed.count), trimmed.allSatisfy(\.isASCII),
      trimmed.allSatisfy(\.isNumber)
    else { return nil }
    return Int(trimmed)
  }
}
