use std::collections::HashMap;
use std::sync::Arc;

use crate::rpc::types::{
    WalletCapabilityState, WalletCapabilityStatus, WalletNetwork, WalletNetworkStatus,
    WalletProviderStatus,
};

use super::chain::{WalletChainProfile, WalletRuntimeConfig};
use super::error::WalletChainError;

#[derive(Default, Clone)]
pub struct WalletChainRegistry {
    profiles: HashMap<String, Arc<dyn WalletChainProfile>>,
}

impl WalletChainRegistry {
    pub fn register(&mut self, profile: Arc<dyn WalletChainProfile>) {
        let network = profile.network().to_string();
        self.profiles.insert(network, profile);
    }

    pub fn enabled_profile(
        &self,
        network: &WalletNetwork,
        config: &WalletRuntimeConfig,
    ) -> Result<Arc<dyn WalletChainProfile>, WalletChainError> {
        let Some(profile) = self.profiles.get(network.as_str()) else {
            return Err(WalletChainError::unsupported_chain(format!(
                "Unsupported wallet network: {}",
                network.as_str()
            )));
        };
        if !profile.is_enabled(config) {
            return Err(WalletChainError::unsupported_chain(format!(
                "Wallet network disabled: {}",
                network.as_str()
            )));
        }
        Ok(profile.clone())
    }

    pub fn profile(
        &self,
        network: &WalletNetwork,
    ) -> Result<Arc<dyn WalletChainProfile>, WalletChainError> {
        self.profiles.get(network.as_str()).cloned().ok_or_else(|| {
            WalletChainError::unsupported_chain(format!(
                "Unsupported wallet network: {}",
                network.as_str()
            ))
        })
    }

    /// Every registered profile in network order, regardless of runtime enablement.
    pub fn profiles(&self) -> Vec<Arc<dyn WalletChainProfile>> {
        let mut profiles: Vec<_> = self.profiles.values().cloned().collect();
        profiles.sort_by(|a, b| a.network().cmp(b.network()));
        profiles
    }

    pub fn has_enabled_profile(&self, network: &str, config: &WalletRuntimeConfig) -> bool {
        self.profiles
            .get(network)
            .is_some_and(|profile| profile.is_enabled(config))
    }

    pub fn has_any_enabled_profile(&self, config: &WalletRuntimeConfig) -> bool {
        self.profiles
            .values()
            .any(|profile| profile.is_enabled(config))
    }

    pub fn network_statuses(&self, config: &WalletRuntimeConfig) -> Vec<WalletNetworkStatus> {
        let mut statuses = self
            .profiles
            .values()
            .map(|profile| {
                let network = profile.network().to_string();
                let enabled = profile.is_enabled(config);
                let provider_status = if enabled {
                    profile.provider_status()
                } else {
                    WalletProviderStatus::Unavailable
                };
                let disabled_reason = if !config.wallet_enabled {
                    Some("Wallet domain disabled".to_string())
                } else if !enabled {
                    Some(format!("Wallet network disabled: {network}"))
                } else if provider_status == WalletProviderStatus::Unavailable {
                    Some("Wallet provider unavailable".to_string())
                } else {
                    None
                };
                let broadcast_enabled = enabled && provider_status == WalletProviderStatus::Ready;
                let capabilities = profile
                    .capability_ids()
                    .into_iter()
                    .map(|id| {
                        let (state, disabled_reason) =
                            if !config.wallet_enabled || !config.capability_enabled(id) {
                                (
                                    WalletCapabilityState::Disabled,
                                    Some("Wallet capability disabled".to_string()),
                                )
                            } else if !profile.capability_implemented(id) {
                                (
                                    WalletCapabilityState::Unavailable,
                                    Some(
                                        "Wallet capability is not implemented in this build"
                                            .to_string(),
                                    ),
                                )
                            } else if provider_status == WalletProviderStatus::Unavailable {
                                (
                                    WalletCapabilityState::Unavailable,
                                    Some("Wallet provider unavailable".to_string()),
                                )
                            } else {
                                (WalletCapabilityState::Ready, None)
                            };
                        WalletCapabilityStatus {
                            id: id.to_string(),
                            state,
                            disabled_reason,
                        }
                    })
                    .collect();
                WalletNetworkStatus {
                    network: WalletNetwork::from(network),
                    enabled,
                    provider_status,
                    broadcast_enabled,
                    capabilities,
                    disabled_reason,
                }
            })
            .collect::<Vec<_>>();
        statuses.sort_by(|a, b| a.network.cmp(&b.network));
        statuses
    }
}
