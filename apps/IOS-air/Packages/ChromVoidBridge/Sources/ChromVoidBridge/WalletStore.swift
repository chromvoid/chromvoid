import Foundation

@MainActor
public protocol WalletStore: AnyObject {
  func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
    async throws -> WalletAccountsDeriveResponse
  func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
    async throws -> WalletAddressesDeriveResponse
  func walletStatus(generation: UInt64) async throws -> WalletStatusResponse
  func walletList(generation: UInt64) async throws -> WalletListResponse
  func walletAccounts(walletID: String?, generation: UInt64) async throws
    -> WalletAccountsListResponse
  /// Live balance of one account from its network provider; Core also caches it for
  /// `walletAccounts`.
  func walletBalance(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  /// Restore discovery for one account's network: Core scans the provider for used
  /// accounts/addresses before returning the balance. Bitcoin, Ethereum and Solana only.
  func discoverWalletAddresses(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  func generateWalletMnemonic(_ request: WalletHDGenerateMnemonicRequest, generation: UInt64)
    async throws -> WalletHDGenerateMnemonicResponse
  func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
    -> WalletHDCreateResponse
  func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
    -> WalletImportCreateResponse
}

extension RuntimeClient: WalletStore {
  public func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
    async throws -> WalletAccountsDeriveResponse
  {
    try await perform(
      "wallet:accounts:derive", data: request, phase: .unlocked, generation: generation)
  }
  public func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
    async throws -> WalletAddressesDeriveResponse
  {
    try await perform(
      "wallet:addresses:derive", data: request, phase: .unlocked, generation: generation)
  }
  public func generateWalletMnemonic(
    _ request: WalletHDGenerateMnemonicRequest, generation: UInt64
  ) async throws -> WalletHDGenerateMnemonicResponse {
    try await perform(
      "wallet:hd:generateMnemonic", data: request, phase: .unlocked, generation: generation)
  }

  public func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
    -> WalletHDCreateResponse
  {
    try await perform("wallet:hd:create", data: request, phase: .unlocked, generation: generation)
  }

  public func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
    -> WalletImportCreateResponse
  {
    try await perform(
      "wallet:import:create", data: request, phase: .unlocked, generation: generation)
  }

  public func walletStatus(generation: UInt64) async throws -> WalletStatusResponse {
    try await perform(
      "wallet:status", data: [String: String](), phase: .unlocked, generation: generation)
  }

  public func walletList(generation: UInt64) async throws -> WalletListResponse {
    try await perform(
      "wallet:list", data: [String: String](), phase: .unlocked, generation: generation)
  }

  public func walletAccounts(walletID: String?, generation: UInt64) async throws
    -> WalletAccountsListResponse
  {
    try await perform(
      "wallet:accounts:list", data: WalletAccountsListRequest(walletID: walletID),
      phase: .unlocked, generation: generation)
  }

  public func walletBalance(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  {
    try await perform(
      "wallet:balance:get",
      data: WalletBalanceGetRequest(accountID: accountID, discoverAddresses: nil),
      phase: .unlocked, generation: generation)
  }

  public func discoverWalletAddresses(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  {
    try await perform(
      "wallet:balance:get",
      data: WalletBalanceGetRequest(accountID: accountID, discoverAddresses: true),
      phase: .unlocked, generation: generation)
  }
}

extension WalletStore {
  /// Stores without a discovery path answer with the plain balance.
  public func discoverWalletAddresses(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  {
    try await walletBalance(accountID: accountID, generation: generation)
  }
}
