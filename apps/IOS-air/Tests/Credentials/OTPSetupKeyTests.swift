import Testing

@testable import AirPresentation

@Suite @MainActor
struct OTPSetupKeyTests {
  @Test func base32FollowsCoreAndCatchesAMissingCharacter() {
    #expect(OTPSetupKey.check("JBSWY3DPEHPK3PXP", encoding: "base32") == nil)
    // Lower case, spaces and padding are what services and Core accept.
    #expect(OTPSetupKey.check("jbsw y3dp ehpk 3pxp====", encoding: "base32") == nil)
    // Fourteen characters cannot end a Base32 key: two were lost or one added.
    #expect(OTPSetupKey.check("JBSWY3DPEHPK3P", encoding: "base32")?.kind == .length)
    // Fifteen can, but they carry only 72 bits: kept after a warning.
    #expect(OTPSetupKey.check("JBSWY3DPEHPK3PX", encoding: "base32")?.kind == .warning)
    let wrong = OTPSetupKey.check("JBSWY3DPEHPK3PX1", encoding: "base32")
    #expect(wrong?.kind == .characters)
    #expect(OTPSetupKey.typingIssue("JBSW1", encoding: "base32") != nil)
    // Half typed but not wrong yet: nothing to say while typing.
    #expect(OTPSetupKey.typingIssue("JBSWY3D", encoding: "base32") == nil)
  }

  @Test func otherEncodingsAndTheirHints() {
    let hex = "3132333435363738393031323334353637383930"
    #expect(OTPSetupKey.check(hex, encoding: "base16") == nil)
    #expect(OTPSetupKey.check(hex.dropLast().description, encoding: "base16")?.kind == .length)
    #expect(OTPSetupKey.check(hex, encoding: "base32")?.hint == OTPSetupKey.hintBase16)
    #expect(
      OTPSetupKey.check("JBSWY3DPEHPK3PXP", encoding: "base16")?.hint == OTPSetupKey.hintBase32)
    #expect(OTPSetupKey.check("MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=", encoding: "base64") == nil)
    #expect(OTPSetupKey.check("MTIzNDU2Nzg5MDEyMzQ1Njc4OTA", encoding: "base64") == nil)
    // Nonzero unused bits in the last character: a character was changed or cut.
    #expect(OTPSetupKey.check("MTIzNDU2Nzg5MDEyMzQ1Njc4OTB", encoding: "base64")?.kind == .length)
    #expect(OTPSetupKey.check("ab+/cd==x", encoding: "base64")?.kind == .characters)
    #expect(
      OTPSetupKey.check("a/b+c/d+e/f+g/h+", encoding: "base32")?.hint == OTPSetupKey.hintBase64)
    #expect(OTPSetupKey.check("12345678901234567890", encoding: "utf-8") == nil)
  }

  @Test func warningsAskOnceAndThenSave() async {
    #expect(OTPSetupKey.check("JBSWY3DP", encoding: "base32")?.kind == .warning)
    #expect(
      OTPSetupKey.check("JBSWY3DPEHPK3PXP", encoding: "utf-8")?.message == OTPSetupKey.looksBase32)
  }
}
