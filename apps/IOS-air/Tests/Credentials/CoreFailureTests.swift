import Foundation
import Testing

@testable import AirPresentation
@testable import ChromVoidBridge

struct CoreFailureTests {
  private static let table: [(code: String, kind: CoreFailure.Kind)] = [
    ("INVALID_INPUT", .invalidInput), ("EMPTY_PAYLOAD", .invalidInput),
    ("INVALID_PATH", .invalidInput),
    ("ACCESS_DENIED", .denied),
    ("WALLET_DISABLED", .unavailable), ("UNSUPPORTED_CHAIN", .unavailable),
    ("UNSUPPORTED_ACCOUNT_MODEL", .unavailable), ("PROVIDER_UNAVAILABLE", .unavailable),
    ("UNSUPPORTED_ASSET", .unavailable), ("UNSUPPORTED_PROVIDER_SURFACE", .unavailable),
    ("NODE_NOT_FOUND", .missing),
    ("NAME_EXIST", .conflict),
    ("PREPARATION_STALE", .stale), ("PREPARATION_EXPIRED", .stale),
    ("PREPARATION_NOT_FOUND", .stale),
    ("EXPORT_REAUTH_FAILED", .reauthRequired), ("CONFIRM_REQUIRED", .reauthRequired),
    ("VAULT_REQUIRED", .revoked), ("SESSION_REVOKED", .revoked),
  ]

  @Test func everyTabledCodeMapsToItsKind() {
    for entry in Self.table {
      let failure = CoreFailure(code: entry.code)
      #expect(failure.kind == entry.kind, "\(entry.code)")
      #expect(failure.code == entry.code)
      let error: any Error = RPCFailure(code: entry.code)
      #expect(error.coreFailureKind == entry.kind, "\(entry.code)")
      #expect(error.coreFailure == failure)
    }
  }

  @Test func unknownCodeStaysUnknownAndKeepsItsCode() {
    let error: any Error = RPCFailure(code: "SYNC_CONFLICT")
    #expect(error.coreFailureKind == .unknown)
    #expect(error.coreFailure?.code == "SYNC_CONFLICT")
    #expect(CoreFailure(code: nil) == CoreFailure(code: nil))
    #expect(CoreFailure(code: nil).kind == .unknown)
    #expect((RPCFailure(code: nil) as any Error).coreFailure?.code == nil)
  }

  @Test func nonCoreErrorsHaveNoCoreFailure() {
    #expect(CancellationError().coreFailure == nil)
    #expect(CancellationError().coreFailureKind == nil)
    #expect(URLError(.cancelled).coreFailure == nil)
    #expect(CancellationError().isSessionRevoked == false)
  }

  @Test func revokedCodesReadAsSessionRevoked() {
    #expect(RPCFailure(code: "VAULT_REQUIRED").isSessionRevoked)
    #expect(RPCFailure(code: "SESSION_REVOKED").isSessionRevoked)
    #expect(RPCFailure(code: "ACCESS_DENIED").isSessionRevoked == false)
    #expect(RPCFailure(code: nil).isSessionRevoked == false)
  }
}
