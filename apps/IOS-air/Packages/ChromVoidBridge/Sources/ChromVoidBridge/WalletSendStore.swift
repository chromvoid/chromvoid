import Foundation

/// Core owns fee quotes, prepared intent, authorization, signing and exact rebroadcast.
@MainActor
public protocol WalletSendStore: AnyObject {
  func quoteWalletTransaction(_ request: WalletTransactionQuoteRequest, generation: UInt64)
    async throws -> WalletTransactionQuoteResponse
  func prepareWalletTransaction(_ request: WalletTransactionPrepareRequest, generation: UInt64)
    async throws -> WalletTransactionPrepareResponse
  func confirmWalletTransaction(_ request: WalletTransactionConfirmRequest, generation: UInt64)
    async throws -> WalletTransactionConfirmResponse
  func cancelWalletTransaction(_ request: WalletTransactionCancelRequest, generation: UInt64)
    async throws -> WalletTransactionCancelResponse
  func rebroadcastWalletTransaction(
    _ request: WalletTransactionRebroadcastRequest, generation: UInt64
  )
    async throws -> WalletTransactionRebroadcastResponse
  /// Address-first Send: Core asks every registered network whether it accepts the address.
  func detectWalletAddress(_ address: String, generation: UInt64) async throws
    -> WalletAddressDetectResponse
}

extension RuntimeClient: WalletSendStore {
  public func detectWalletAddress(_ address: String, generation: UInt64) async throws
    -> WalletAddressDetectResponse
  {
    try await perform(
      "wallet:address:detect", data: WalletAddressDetectRequest(address: address),
      phase: .unlocked, generation: generation)
  }
  public func quoteWalletTransaction(_ request: WalletTransactionQuoteRequest, generation: UInt64)
    async throws -> WalletTransactionQuoteResponse
  {
    try await perform(
      "wallet:transaction:quote", data: request, phase: .unlocked, generation: generation)
  }
  public func prepareWalletTransaction(
    _ request: WalletTransactionPrepareRequest, generation: UInt64
  )
    async throws -> WalletTransactionPrepareResponse
  {
    try await perform(
      "wallet:transaction:prepare", data: request, phase: .unlocked, generation: generation)
  }
  public func confirmWalletTransaction(
    _ request: WalletTransactionConfirmRequest, generation: UInt64
  )
    async throws -> WalletTransactionConfirmResponse
  {
    try await perform(
      "wallet:transaction:confirm", data: request, phase: .unlocked, generation: generation)
  }
  public func cancelWalletTransaction(_ request: WalletTransactionCancelRequest, generation: UInt64)
    async throws -> WalletTransactionCancelResponse
  {
    try await perform(
      "wallet:transaction:cancel", data: request, phase: .unlocked, generation: generation)
  }
  public func rebroadcastWalletTransaction(
    _ request: WalletTransactionRebroadcastRequest, generation: UInt64
  )
    async throws -> WalletTransactionRebroadcastResponse
  {
    try await perform(
      "wallet:transaction:rebroadcast", data: request, phase: .unlocked, generation: generation)
  }
}
