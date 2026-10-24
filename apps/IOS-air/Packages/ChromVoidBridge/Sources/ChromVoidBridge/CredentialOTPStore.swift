import Foundation

@MainActor
public protocol CredentialOTPStore: AnyObject {
  func parseOTPURI(_ uri: String, generation: UInt64) async throws -> PassmanagerOtpURIResponse
  func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse
  func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws
  func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
  func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
}
