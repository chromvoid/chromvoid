import Foundation

/// Core owns the transaction journal, provider synchronization and status reconciliation.
@MainActor
public protocol WalletHistoryStore: AnyObject {
  func walletTransactions(_ request: WalletTransactionsListRequest, generation: UInt64)
    async throws -> WalletTransactionsListResponse
  func syncWalletTransactions(_ request: WalletTransactionsSyncRequest, generation: UInt64)
    async throws -> WalletTransactionsSyncResponse
  func refreshWalletTransaction(_ request: WalletTransactionsRefreshRequest, generation: UInt64)
    async throws -> WalletTransactionsRefreshResponse
}

extension RuntimeClient: WalletHistoryStore {
  public func walletTransactions(_ request: WalletTransactionsListRequest, generation: UInt64)
    async throws -> WalletTransactionsListResponse
  {
    try await perform(
      "wallet:transactions:list", data: request, phase: .unlocked, generation: generation)
  }
  public func syncWalletTransactions(_ request: WalletTransactionsSyncRequest, generation: UInt64)
    async throws -> WalletTransactionsSyncResponse
  {
    try await perform(
      "wallet:transactions:sync", data: request, phase: .unlocked, generation: generation)
  }
  public func refreshWalletTransaction(
    _ request: WalletTransactionsRefreshRequest, generation: UInt64
  )
    async throws -> WalletTransactionsRefreshResponse
  {
    try await perform(
      "wallet:transactions:refresh", data: request, phase: .unlocked, generation: generation)
  }
}
