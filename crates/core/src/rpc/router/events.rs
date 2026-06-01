use crate::catalog::DeltaEntry;

#[derive(Debug, Default)]
pub(super) struct RouterEventQueue {
    events: Vec<serde_json::Value>,
    catalog_subscribed: bool,
}

impl RouterEventQueue {
    pub(super) fn subscribe_catalog(&mut self) {
        self.catalog_subscribed = true;
    }

    pub(super) fn unsubscribe_catalog(&mut self) {
        self.catalog_subscribed = false;
    }

    pub(super) fn is_catalog_subscribed(&self) -> bool {
        self.catalog_subscribed
    }

    pub(super) fn clear(&mut self) {
        self.events.clear();
    }

    pub(super) fn push_vault_locked(&mut self, reason: &str) {
        if self.is_catalog_subscribed() {
            self.events.push(serde_json::json!({
                "command": "vault:locked",
                "data": {"reason": reason}
            }));
        }
    }

    pub(super) fn enqueue_catalog_events(&mut self, catalog_events: Vec<(String, DeltaEntry)>) {
        if !self.catalog_subscribed {
            return;
        }

        let payloads: Vec<_> = catalog_events
            .into_iter()
            .map(|(shard_id, delta)| catalog_event_payload(shard_id, delta))
            .collect();
        enqueue_catalog_event_payloads(&mut self.events, payloads);
        self.push_update_state();
    }

    pub(super) fn push_update_state(&mut self) {
        if !self.catalog_subscribed {
            return;
        }

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        self.events.push(serde_json::json!({
            "command": "update:state",
            "data": {
                "TS": ts,
                "serial_num": "local",
            }
        }));
    }

    pub(super) fn take_events(&mut self) -> Vec<serde_json::Value> {
        let events = std::mem::take(&mut self.events);
        // ADR-028: filter out catalog:event for system shards before external delivery.
        events
            .into_iter()
            .filter_map(filter_external_push_event)
            .collect()
    }
}

fn enqueue_catalog_event_payloads(
    events: &mut Vec<serde_json::Value>,
    mut catalog_events: Vec<serde_json::Value>,
) {
    match catalog_events.len() {
        0 => {}
        1 => {
            let event = catalog_events.remove(0);
            events.push(serde_json::json!({
                "command": "catalog:event",
                "data": event
            }));
        }
        _ => {
            events.push(serde_json::json!({
                "command": "catalog:event:batch",
                "data": {
                    "events": catalog_events,
                }
            }));
        }
    }
}

fn catalog_event_payload(shard_id: String, delta: DeltaEntry) -> serde_json::Value {
    let op_type = match &delta.op {
        crate::catalog::DeltaOp::Create { .. } => "create",
        crate::catalog::DeltaOp::Update { .. } => "update",
        crate::catalog::DeltaOp::Delete => "delete",
        crate::catalog::DeltaOp::Move { .. } => "move",
    };

    serde_json::json!({
        "type": op_type,
        "shard_id": shard_id,
        "node_id": delta.node_id.unwrap_or(0),
        "version": delta.seq,
        "delta": delta,
    })
}

fn external_catalog_event_allowed(event: &serde_json::Value) -> bool {
    let shard_id = event.get("shard_id").and_then(|v| v.as_str()).unwrap_or("");
    !crate::catalog::is_system_shard_id(shard_id)
}

fn filter_external_push_event(mut evt: serde_json::Value) -> Option<serde_json::Value> {
    let command = evt
        .get("command")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    match command.as_deref() {
        Some("catalog:event") => {
            let allowed = evt.get("data").is_some_and(external_catalog_event_allowed);
            allowed.then_some(evt)
        }
        Some("catalog:event:batch") => {
            let events = evt
                .get_mut("data")
                .and_then(|data| data.get_mut("events"))
                .and_then(|events| events.as_array_mut())?;
            events.retain(external_catalog_event_allowed);
            (!events.is_empty()).then_some(evt)
        }
        _ => Some(evt),
    }
}
