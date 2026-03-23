# Network Module Refactoring Analysis

## 📊 Current State

**Module size**: 6,485 lines across 20+ files
**Tests structure**: Mixed (5 separated test files, rest embedded with `#[cfg(test)]`)

---

## 🎯 Priority 1: Immediate Refactoring Candidates

### 1. **`ios_pairing.rs`** (1,065 lines) → Split into 3-4 modules
**Issues**:
- Mixing multiple concerns: room ID generation, session management, lifecycle orchestration
- 110+ lines of utility functions (path builders, time helpers)
- ~60 tests embedded at the end

**Proposed split**:
```
ios_pairing/
├── mod.rs           (core state + main API)
├── session.rs       (PairingSession, room/session ID generation)
├── lifecycle.rs     (state machines: WaitingForPeer → Completed)
├── host_mode.rs     (PersistedIosHostMode persistence)
└── tests.rs         (extract all tests)
```

**Design patterns**:
- **Builder pattern**: For `PairingSession` initialization with complex state
- **State machine**: Explicit `PairingState` transitions with validation
- **Repository pattern**: Extract `PersistedIosHostMode` storage into `HostModeStore`

---

### 2. **`pairing.rs`** (613 lines) → Split into 2 modules
**Issues**:
- General pairing logic (PIN verification, lockout) mixed with iOS specifics
- Global `SESSIONS: Mutex<HashMap>` state management is rigid
- ~40 tests embedded

**Proposed split**:
```
pairing/
├── mod.rs           (public API, NetworkPairingSession)
├── policy.rs        (lockout policy, MAX_ATTEMPTS, SESSION_TTL_MS)
├── session_store.rs (SESSIONS global state management)
└── tests.rs         (lockout tests, session management tests)
```

**Design patterns**:
- **Strategy pattern**: `LockoutPolicy` trait for different lockout curves
- **Factory pattern**: `SessionStore::new()` for testable session creation
- **Result type**: Explicit `PairingError` enum instead of `String`

---

### 3. **`tcp_stealth_transport.rs`** (531 lines) → Split into 2-3 modules
**Issues**:
- WebSocket initialization + TLS pinning + headers all mixed
- `connect_with_options()` has 100+ lines with deep nesting
- Crypto provider setup ceremony duplicated

**Proposed split**:
```
tcp_stealth_transport/
├── mod.rs           (TcpStealthTransport impl, public API)
├── tls_config.rs    (TLS pinning, cert validation)
├── auth.rs          (header building, bearer token, auth logic)
└── tests.rs         (connection tests, TLS validation tests)
```

**Design patterns**:
- **Builder pattern**: `TlsConfigBuilder` for cert pinning options
- **Strategy pattern**: `AuthStrategy` trait (Bearer, Pinning, None)
- **Facade pattern**: Single `connect_with_options()` call abstracts complexity

---

### 4. **`server_profiles.rs`** (493 lines) → Split into 2-3 modules
**Issues**:
- Config structures + rotation logic + storage all mixed
- 5 different `Default` impl blocks
- ~50 lines of path/validation utilities

**Proposed split**:
```
server_profiles/
├── mod.rs           (ServerProfileStore public API)
├── models.rs        (ServerEndpoint, ManagedMetadata, ProfileMode)
├── rotation.rs      (RotationPolicy, RotationAction, rotation logic)
├── validation.rs    (endpoint validation, schema validation)
└── tests.rs         (profile import/export, rotation logic tests)
```

**Design patterns**:
- **Domain objects**: `ServerProfile` value object with validation
- **Strategy pattern**: `RotationStrategy` for different rotation algorithms
- **Factory pattern**: `ProfileFactory::from_json()` for safe deserialization

---

### 5. **`ios_lifecycle.rs`** (354 lines) → Split into 2 modules
**Issues**:
- Lifecycle state machine + API integration tightly coupled
- Multiple DNS/connectivity concerns mixed
- ~25 tests embedded

**Proposed split**:
```
ios_lifecycle/
├── mod.rs           (IosHostStatus, public API)
├── state_machine.rs (IosHostPhase transitions with guards)
├── dns_sync.rs      (DNS resolution logic for endpoints)
└── tests.rs         (state transitions, DNS scenarios)
```

**Design patterns**:
- **State machine**: Explicit phase transitions with event handlers
- **Observer pattern**: Lifecycle state changes trigger DNS updates

---

### 6. **`fallback.rs`** (349 lines) → Split into 2-3 modules
**Issues**:
- Connection fallback strategy + ICE servers + transport selection all mixed
- `LastKnownGoodTransportCache` persistence mixed with logic
- `FallbackConnectOptions` has 10+ optional fields

**Proposed split**:
```
fallback/
├── mod.rs              (connect_with_fallback public API)
├── strategy.rs         (FallbackStrategy: try WebRTC → QUIC → TCP)
├── transport_cache.rs  (LastKnownGoodTransportCache)
├── ice_config.rs       (ICE server management)
└── tests.rs            (fallback sequence tests)
```

**Design patterns**:
- **Strategy pattern**: `TransportStrategy` for fallback sequences
- **Circuit breaker**: Track transport failures, avoid dead endpoints
- **Builder pattern**: `FallbackConnectOptions`

---

## 📋 Priority 2: Medium-Complexity Candidates

### 7. **`connection.rs`** (320 lines)
- Split: `connection/` with `state.rs`, `manager.rs`, `events.rs`
- Extract `ConnectionEvent` into event types
- Tests into separate module (currently 20+ tests embedded)

### 8. **`io_task.rs`** (302 lines)
- Already well-structured but tests (30+) should move to separate file
- Consider extracting `IoRequest` handler strategies into submodule

### 9. **`ios_control.rs`** (277 lines)
- Split into `api_client.rs` + `models.rs` + `tests.rs`
- Extract HTTP request building into separate module
- Move test fixtures to separate fixtures module

---

## 📋 Priority 3: Consolidation Candidates

### 10. **Identity Management** (scattered across multiple files)
**Current state**:
- `local_identity.rs` (122 lines)
- `ios_peers.rs` (115 lines)
- `paired_peers.rs` (280+ lines)

**Proposed consolidation**:
```
identity/
├── local.rs         (LocalDeviceIdentity, LocalDeviceIdentityStore)
├── ios_peer.rs      (PairedIosPeer, PairedIosPeerStore)
├── paired_peer.rs   (PairedPeer, PairedPeerStore)
└── tests.rs         (all identity-related tests)
```

---

## 🧪 Test Organization Status

### ✅ Already Separated (5 files)
- `safety_tests.rs`
- `server_profiles_tests.rs`
- `connection_tests.rs`
- `fallback_tests.rs`
- `paired_peers_tests.rs`

### ❌ Embedded Tests (need separation)
| File | Tests | Lines |
|------|-------|-------|
| `ios_pairing.rs` | ~20 | embedded @943 |
| `pairing.rs` | ~15 | embedded @324 |
| `tcp_stealth_transport.rs` | ~8 | embedded @294 |
| `ios_lifecycle.rs` | ~10 | embedded @245 |
| `ios_control.rs` | ~5 | embedded @243 |
| `ios_peers.rs` | ~5 | embedded @74 |
| `ios_push.rs` | ~5 | embedded @157 |
| `local_identity.rs` | ~5 | embedded @90 |
| `quic_masque_transport.rs` | ~8 | embedded @215 |

---

## 🔧 Design Patterns to Apply

### By Problem Type

| Pattern | Where | Benefit |
|---------|-------|---------|
| **Builder** | TCP stealth TLS config, Fallback options, Session init | Readability, flexible initialization |
| **Strategy** | Transport selection, Lockout policy, Rotation policy | Pluggable algorithms, easier testing |
| **State Machine** | Pairing lifecycle, iOS host lifecycle | Explicit valid transitions, prevents invalid states |
| **Factory** | Profile creation from JSON, Transport factory | Safe object construction, validation centralized |
| **Repository** | Profile storage, Session storage, Identity storage | Consistent persistence API, easier to mock |
| **Observer** | Lifecycle → DNS sync, Transport selection → fallback | Decoupled concerns, easier to test |

---

## 📦 Module Organization Template

### For large modules (300+ lines):
```rust
// src/network/module_name/mod.rs
pub mod models;
pub mod operations;
pub mod storage;
#[cfg(test)]
mod tests;

pub use models::*;
pub use operations::*;
```

### For tests:
```rust
// src/network/module_name/tests.rs
use super::*;

#[test]
fn test_scenario_1() { }

#[test]
fn test_scenario_2() { }
```

---

## 🚀 Refactoring Sequence

### Phase 1 (Quick wins - 2 tasks)
1. **Extract tests to separate files** (applies to all 9 modules above)
   - Minimal logic changes, only moves existing code
   - Time: ~2 hours

2. **Create `identity/` consolidation module**
   - Reorganizes 3 identity files
   - Adds `identity/tests.rs` collecting all identity tests
   - Time: ~1.5 hours

### Phase 2 (Medium complexity - 3-4 tasks)
1. **`ios_pairing.rs` → `ios_pairing/` submodule**
   - Extract session management
   - Apply Builder + State Machine patterns
   - Time: ~3 hours

2. **`server_profiles.rs` → `server_profiles/` submodule**
   - Extract models + validation + rotation
   - Time: ~2.5 hours

3. **`tcp_stealth_transport.rs` → `tcp_stealth_transport/` submodule**
   - Extract TLS + auth concerns
   - Time: ~2 hours

### Phase 3 (Complex refactoring - 2-3 tasks)
1. **`pairing.rs` → `pairing/` submodule**
   - Introduce `PairingError` type
   - Extract session store
   - Time: ~2.5 hours

2. **`fallback.rs` → `fallback/` submodule**
   - Introduce transport strategy trait
   - Time: ~2.5 hours

---

## 💾 Expected Improvements

- **Cognitive load**: 3-4 focused files instead of 1-2 monolithic files
- **Testability**: Separate test modules make test organization clearer
- **Reusability**: Patterns enable test helpers, mocks, and fixtures
- **Maintainability**: Clear separation of concerns by domain
- **Type safety**: Explicit error types instead of String errors

---

## 🔗 Related Analysis

- Check `mobile_acceptor` module for similar refactoring (recently split per commit c59be6f4)
- Review if WebRTC/QUIC transports need similar treatment
- Consider extracting shared transport traits into separate module

