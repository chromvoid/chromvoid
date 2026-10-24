use super::*;

const ADDRESS_BOOK_ROOT: &str = "/.wallet/address-book";

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_address_book_list(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        if let Err(error) = parse::<WalletAddressBookListRequest>(data) {
            return error.into_rpc_response();
        }
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            Ok(WalletAddressBookListResponse {
                entries: load_address_book_entries(session, storage)?,
            })
        })
    }

    /// Address-first Send: every registered chain profile is asked to normalize the address, so
    /// clients never keep their own copies of the per-network address rules.
    pub(in crate::rpc::router) fn handle_wallet_address_detect(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAddressDetectRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let address = request.address.trim().to_string();
        let mut matches: Vec<(WalletNetwork, String)> = Vec::new();
        if !address.is_empty() {
            for profile in self.wallet_chain_registry.profiles() {
                if let Ok(normalized) = profile.normalize_address(&address) {
                    matches.push((WalletNetwork::new(profile.network()), normalized));
                }
            }
        }
        let unique = (matches.len() == 1).then(|| matches[0].clone());
        RpcResponse::success(WalletAddressDetectResponse {
            address,
            network: unique.as_ref().map(|(network, _)| network.clone()),
            normalized_address: unique.map(|(_, normalized)| normalized),
            candidates: matches.into_iter().map(|(network, _)| network).collect(),
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_address_book_create(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAddressBookCreateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let label = match normalize_label(&request.label) {
            Ok(label) => label,
            Err(error) => return error.into_rpc_response(),
        };
        let address = match self
            .wallet_chain_registry
            .profile(&request.network)
            .and_then(|profile| profile.normalize_address(&request.address))
        {
            Ok(address) => address,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let entries = load_address_book_entries(session, storage)?;
            ensure_unique_address(&entries, &request.network, &address, None)?;
            let now = now_ms();
            let entry = WalletAddressBookEntry {
                entry_id: new_address_book_entry_id(),
                label,
                network: request.network,
                address,
                created_at: now,
                updated_at: now,
            };
            let mut uow = begin_wallet_uow(session, storage, "wallet-address-book-create");
            ensure_wallet_dirs(&mut uow)?;
            write_address_book_entry(&mut uow, &entry)?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletAddressBookCreateResponse { entry })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_address_book_update(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAddressBookUpdateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = validate_entry_id(&request.entry_id) {
            return error.into_rpc_response();
        }
        let label = match normalize_label(&request.label) {
            Ok(label) => label,
            Err(error) => return error.into_rpc_response(),
        };
        let address = match self
            .wallet_chain_registry
            .profile(&request.network)
            .and_then(|profile| profile.normalize_address(&request.address))
        {
            Ok(address) => address,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let entries = load_address_book_entries(session, storage)?;
            let current = entries
                .iter()
                .find(|entry| entry.entry_id == request.entry_id)
                .ok_or_else(|| {
                    WalletCommandError::node_not_found("Address book entry not found")
                })?;
            ensure_unique_address(
                &entries,
                &request.network,
                &address,
                Some(&request.entry_id),
            )?;
            let entry = WalletAddressBookEntry {
                entry_id: request.entry_id,
                label,
                network: request.network,
                address,
                created_at: current.created_at,
                updated_at: now_ms(),
            };
            let mut uow = begin_wallet_uow(session, storage, "wallet-address-book-update");
            ensure_wallet_dirs(&mut uow)?;
            write_address_book_entry(&mut uow, &entry)?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletAddressBookUpdateResponse { entry })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_address_book_delete(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAddressBookDeleteRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = validate_entry_id(&request.entry_id) {
            return error.into_rpc_response();
        }
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let path = address_book_entry_path(&request.entry_id);
            if read_json::<WalletAddressBookEntry>(session, storage, &path)?.is_none() {
                return Err(WalletCommandError::node_not_found(
                    "Address book entry not found",
                ));
            }
            let mut uow = begin_wallet_uow(session, storage, "wallet-address-book-delete");
            delete_path(&mut uow, &path)?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletAddressBookDeleteResponse {
                entry_id: request.entry_id,
            })
        })
    }
}

fn normalize_label(label: &str) -> WalletResult<String> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 80 {
        return Err(invalid_input(
            "address book label must contain between 1 and 80 characters",
        ));
    }
    Ok(label.to_string())
}

fn validate_entry_id(entry_id: &str) -> WalletResult<()> {
    let Some(value) = entry_id.strip_prefix("contact-") else {
        return Err(invalid_input("invalid address book entry id"));
    };
    if value.len() != 32 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid_input("invalid address book entry id"));
    }
    Ok(())
}

fn ensure_unique_address(
    entries: &[WalletAddressBookEntry],
    network: &WalletNetwork,
    address: &str,
    excluded_entry_id: Option<&str>,
) -> WalletResult<()> {
    if entries.iter().any(|entry| {
        &entry.network == network
            && entry.address == address
            && excluded_entry_id != Some(entry.entry_id.as_str())
    }) {
        return Err(invalid_input(
            "this address is already in the address book for this network",
        ));
    }
    Ok(())
}

fn load_address_book_entries(
    session: &VaultSession,
    storage: &Storage,
) -> WalletResult<Vec<WalletAddressBookEntry>> {
    let Some(root) = session.catalog().find_by_path(ADDRESS_BOOK_ROOT) else {
        return Ok(Vec::new());
    };
    let mut entries = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        let path = format!("{ADDRESS_BOOK_ROOT}/{}", child.name);
        if let Some(entry) = read_json::<WalletAddressBookEntry>(session, storage, &path)? {
            entries.push(entry);
        }
    }
    entries.sort_by(|left, right| {
        left.label
            .to_lowercase()
            .cmp(&right.label.to_lowercase())
            .then_with(|| left.network.cmp(&right.network))
            .then_with(|| left.address.cmp(&right.address))
    });
    Ok(entries)
}

fn write_address_book_entry(
    uow: &mut super::super::domain_uow::DomainUnitOfWork<'_>,
    entry: &WalletAddressBookEntry,
) -> WalletResult<()> {
    write_json(
        uow,
        &address_book_entry_path(&entry.entry_id),
        &format!("{}.json", entry.entry_id),
        entry,
        JSON_MIME,
    )
}
