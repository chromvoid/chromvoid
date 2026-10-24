import Foundation

/// Checks a one-time-code setup key against the chosen key encoding before it reaches Core.
/// Core decodes leniently (a Base32 key with a character missing still decodes, into different
/// bytes), so a typo would be saved and every code after it would be wrong. The rules follow
/// Core's decoders: whitespace is ignored, Base32 is case-insensitive with optional `=`,
/// Base64 is standard with or without padding, UTF-8 keys are used as typed.
enum OTPSetupKey {
  struct Finding: Equatable {
    enum Kind: Equatable {
      /// A character the encoding does not have: wrong whatever is typed next.
      case characters
      /// The key cannot end here: a character is missing or extra.
      case length
      /// Valid, but unusual enough to ask before saving.
      case warning
    }
    let kind: Kind
    let message: String
    /// A likelier encoding, when the key reads as one.
    var hint: String? = nil
    var isWarning: Bool { kind == .warning }
  }

  static let base32Characters = "Base32 keys use only the letters A–Z and the digits 2–7."
  static let base32Length =
    "This Base32 key has a character missing or extra. Check that it was copied in full."
  static let base64Characters = "Base64 keys use only letters, digits, + and /, with = at the end."
  static let base64Length =
    "This Base64 key is cut short or has an extra character. Check that it was copied in full."
  static let base16Characters = "Hexadecimal keys use only the digits 0–9 and the letters A–F."
  static let base16Length =
    "A hexadecimal key has an even number of characters. Check that it was copied in full."
  static let short =
    "This key is unusually short: services give at least 80 bits. Check that it was copied in full."
  static let looksBase32 =
    "This key looks like Base32, the usual encoding of setup keys. Check the key encoding."
  static let hintBase32 = "It looks like Base32: choose base32 in Key encoding."
  static let hintBase64 = "It looks like Base64: choose base64 in Key encoding."
  static let hintBase16 = "It looks like hexadecimal: choose base16 in Key encoding."

  /// Everything, for Save. Nil for an empty key: whether one is required is the form's rule.
  static func check(_ key: String, encoding: String) -> Finding? {
    let compact = key.filter { !$0.isWhitespace }
    guard !compact.isEmpty else { return nil }
    let bytes: Int
    switch encoding.lowercased() {
    case "base32":
      var body = compact.uppercased()
      while body.hasSuffix("=") { body.removeLast() }
      guard !body.isEmpty, body.allSatisfy(isBase32) else {
        return Finding(
          kind: .characters, message: base32Characters, hint: hint(compact, besides: "base32"))
      }
      // Five bits a character: 1, 3 or 6 characters past a full block encode no whole byte.
      guard ![1, 3, 6].contains(body.count % 8) else {
        return Finding(kind: .length, message: base32Length)
      }
      bytes = body.count * 5 / 8
    case "base64":
      var body = Substring(compact)
      var padding = 0
      while body.hasSuffix("=") {
        body.removeLast()
        padding += 1
      }
      guard !body.isEmpty, padding <= 2, body.allSatisfy(isBase64) else {
        return Finding(
          kind: .characters, message: base64Characters, hint: hint(compact, besides: "base64"))
      }
      let rest = body.count % 4
      // Padding completes a block of four; the unused low bits of the last character are zero.
      let unusedBits = rest == 2 ? 0x0F : rest == 3 ? 0x03 : 0
      guard rest != 1, padding == 0 || compact.count % 4 == 0,
        let last = body.last.flatMap(base64Value), last & unusedBits == 0
      else { return Finding(kind: .length, message: base64Length) }
      bytes = body.count * 3 / 4
    case "base16", "hex":
      guard compact.allSatisfy({ $0.isASCII && $0.isHexDigit }) else {
        return Finding(
          kind: .characters, message: base16Characters, hint: hint(compact, besides: "base16"))
      }
      guard compact.count.isMultiple(of: 2) else {
        return Finding(kind: .length, message: base16Length)
      }
      bytes = compact.count / 2
    case "utf-8", "utf8":
      bytes = key.utf8.count
    default:
      return nil
    }
    // Base32 is what services hand out; the same text read as another encoding makes other
    // bytes and codes that never match.
    if encoding.lowercased() != "base32", encoding.lowercased() != "base16",
      looksLikeBase32(compact)
    {
      return Finding(kind: .warning, message: looksBase32)
    }
    if bytes < 10 { return Finding(kind: .warning, message: short) }
    return nil
  }

  /// While typing: only what typing more cannot fix, so a half-typed key is not flagged.
  static func typingIssue(_ key: String, encoding: String) -> Finding? {
    guard let finding = check(key, encoding: encoding), finding.kind == .characters else {
      return nil
    }
    return finding
  }

  private static func hint(_ key: String, besides encoding: String) -> String? {
    if encoding != "base16", key.count.isMultiple(of: 2),
      key.allSatisfy({ $0.isASCII && $0.isHexDigit })
    {
      return hintBase16
    }
    if encoding != "base32", looksLikeBase32(key) { return hintBase32 }
    if encoding != "base64", key.contains(where: { $0 == "+" || $0 == "/" }),
      key.allSatisfy({ isBase64($0) || $0 == "=" })
    {
      return hintBase64
    }
    return nil
  }

  /// Upper-case Base32 of a realistic length: what a service shows as a setup key.
  private static func looksLikeBase32(_ key: String) -> Bool {
    var body = Substring(key)
    while body.hasSuffix("=") { body.removeLast() }
    return body.count >= 16
      && body.allSatisfy { ("A"..."Z").contains($0) || ("2"..."7").contains($0) }
  }

  private static func isBase32(_ character: Character) -> Bool {
    ("A"..."Z").contains(character) || ("2"..."7").contains(character)
  }

  private static func isBase64(_ character: Character) -> Bool {
    base64Value(character) != nil
  }

  private static func base64Value(_ character: Character) -> Int? {
    guard let ascii = character.asciiValue else { return nil }
    switch ascii {
    case 65...90: return Int(ascii) - 65
    case 97...122: return Int(ascii) - 71
    case 48...57: return Int(ascii) + 4
    case 43: return 62
    case 47: return 63
    default: return nil
    }
  }
}
