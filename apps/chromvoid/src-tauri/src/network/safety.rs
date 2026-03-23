use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DnsRouting {
    SecureProxy,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EgressFilter {
    pub block_direct_traffic: bool,
    pub allow_proxied_traffic: bool,
    pub allow_loopback: bool,
}

impl EgressFilter {
    pub fn fail_closed() -> Self {
        Self {
            block_direct_traffic: true,
            allow_proxied_traffic: true,
            allow_loopback: true,
        }
    }

    pub fn open() -> Self {
        Self {
            block_direct_traffic: false,
            allow_proxied_traffic: true,
            allow_loopback: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafetyStatus {
    pub fail_closed: bool,
    pub kill_switch_active: bool,
    pub fallback_in_progress: bool,
    pub dns_routing: DnsRouting,
    pub egress_filter: EgressFilter,
}

impl SafetyStatus {
    pub fn new(fail_closed: bool) -> Self {
        Self {
            fail_closed,
            kill_switch_active: false,
            fallback_in_progress: false,
            dns_routing: DnsRouting::SecureProxy,
            egress_filter: EgressFilter::open(),
        }
    }

    pub fn begin_fallback_transition(&mut self) {
        self.fallback_in_progress = true;
        self.kill_switch_active = self.fail_closed;
        self.dns_routing = DnsRouting::Blocked;
        self.egress_filter = EgressFilter::fail_closed();
    }

    pub fn on_transport_drop(&mut self) {
        self.kill_switch_active = self.fail_closed;
        self.dns_routing = DnsRouting::Blocked;
        self.egress_filter = EgressFilter::fail_closed();
    }

    pub fn on_safe_transport_restored(&mut self) {
        self.fallback_in_progress = false;
        self.kill_switch_active = false;
        self.dns_routing = DnsRouting::SecureProxy;
        self.egress_filter = EgressFilter::open();
    }

    pub fn terminate_session(&mut self) {
        self.fallback_in_progress = false;
        self.kill_switch_active = false;
        self.dns_routing = DnsRouting::Blocked;
        self.egress_filter = EgressFilter::open();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EgressProtocol {
    Udp,
    Tcp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EgressEvent {
    pub protocol: EgressProtocol,
    pub destination_port: u16,
    pub tunneled: bool,
    pub destination_ip: String,
}

pub fn detect_cleartext_dns_leak(events: &[EgressEvent]) -> bool {
    events.iter().any(|event| {
        event.destination_port == 53
            && event.protocol == EgressProtocol::Udp
            && !event.tunneled
            && !event.destination_ip.starts_with("127.")
    })
}

pub fn detect_direct_egress_leak(events: &[EgressEvent]) -> bool {
    events
        .iter()
        .any(|event| !event.tunneled && !event.destination_ip.starts_with("127."))
}

#[cfg(test)]
#[path = "safety_tests.rs"]
mod tests;
