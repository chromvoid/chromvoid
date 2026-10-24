import Foundation

/// Contacts belong to the current vault; Core owns address validation and persistence.
@MainActor
public protocol WalletAddressBookStore: AnyObject {
  func listWalletContacts(generation: UInt64) async throws -> WalletAddressBookListResponse
  func createWalletContact(_ request: WalletAddressBookCreateRequest, generation: UInt64)
    async throws -> WalletAddressBookCreateResponse
  func updateWalletContact(_ request: WalletAddressBookUpdateRequest, generation: UInt64)
    async throws -> WalletAddressBookUpdateResponse
  func deleteWalletContact(_ request: WalletAddressBookDeleteRequest, generation: UInt64)
    async throws -> WalletAddressBookDeleteResponse
}

extension RuntimeClient: WalletAddressBookStore {
  public func listWalletContacts(generation: UInt64) async throws -> WalletAddressBookListResponse {
    try await perform(
      "wallet:addressBook:list", data: [String: String](), phase: .unlocked, generation: generation)
  }

  public func createWalletContact(_ request: WalletAddressBookCreateRequest, generation: UInt64)
    async throws -> WalletAddressBookCreateResponse
  {
    try await perform(
      "wallet:addressBook:create", data: request, phase: .unlocked, generation: generation)
  }

  public func updateWalletContact(_ request: WalletAddressBookUpdateRequest, generation: UInt64)
    async throws -> WalletAddressBookUpdateResponse
  {
    try await perform(
      "wallet:addressBook:update", data: request, phase: .unlocked, generation: generation)
  }

  public func deleteWalletContact(_ request: WalletAddressBookDeleteRequest, generation: UInt64)
    async throws -> WalletAddressBookDeleteResponse
  {
    try await perform(
      "wallet:addressBook:delete", data: request, phase: .unlocked, generation: generation)
  }
}
