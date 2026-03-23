import {describe, expect, it} from 'vitest'

import {
  type ConnectionState,
  type CoreMode,
  type SyncSnapshot,
  type SyncStatusEvent,
  defaultSyncSnapshot,
  deriveRemoteStatus,
  deriveRemoteStatusWithLock,
  formatLastSyncTime,
  formatSyncProgress,
  getConnectionStatusCategory,
  getConnectedPeerName,
  getModeLabel,
  isRemoteMode,
  syncPhaseToState,
  getWriterLockToastMessage,
} from '../../src/routes/remote/remote.model'

// ---------------------------------------------------------------------------
// Pure function tests — no mocks, no DOM, no Tauri runtime
// ---------------------------------------------------------------------------

describe('remote.model – mode helpers', () => {
  describe('isRemoteMode', () => {
    it('returns false for "local"', () => {
      expect(isRemoteMode('local')).toBe(false)
    })

    it('returns false for "switching"', () => {
      expect(isRemoteMode('switching')).toBe(false)
    })

    it('returns true for remote object with tauri_remote_wss host', () => {
      const mode: CoreMode = {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}}
      expect(isRemoteMode(mode)).toBe(true)
    })

    it('returns true for remote object with orangepi_usb host', () => {
      const mode: CoreMode = {remote: {host: {type: 'orangepi_usb', device_id: 'dev-1'}}}
      expect(isRemoteMode(mode)).toBe(true)
    })

    it('returns true for remote object with mobile_ble host', () => {
      const mode: CoreMode = {remote: {host: {type: 'mobile_ble', device_id: 'ble-1'}}}
      expect(isRemoteMode(mode)).toBe(true)
    })
  })

  describe('getModeLabel', () => {
    it('returns "Local" for local mode', () => {
      expect(getModeLabel('local')).toBe('Local')
    })

    it('returns "Switching…" for switching mode', () => {
      expect(getModeLabel('switching')).toBe('Switching…')
    })

    it('returns "Remote" for remote mode', () => {
      const mode: CoreMode = {remote: {host: {type: 'tauri_remote_wss', peer_id: 'p'}}}
      expect(getModeLabel(mode)).toBe('Remote')
    })
  })

  describe('getConnectedPeerName', () => {
    it('returns null for local mode', () => {
      expect(getConnectedPeerName('local')).toBeNull()
    })

    it('returns null for switching mode', () => {
      expect(getConnectedPeerName('switching')).toBeNull()
    })

    it('returns peer_id for tauri_remote_wss', () => {
      const mode: CoreMode = {remote: {host: {type: 'tauri_remote_wss', peer_id: 'my-phone'}}}
      expect(getConnectedPeerName(mode)).toBe('my-phone')
    })

    it('returns device_id for orangepi_usb', () => {
      const mode: CoreMode = {remote: {host: {type: 'orangepi_usb', device_id: 'usb-dev'}}}
      expect(getConnectedPeerName(mode)).toBe('usb-dev')
    })

    it('returns device_id for mobile_ble', () => {
      const mode: CoreMode = {remote: {host: {type: 'mobile_ble', device_id: 'ble-dev'}}}
      expect(getConnectedPeerName(mode)).toBe('ble-dev')
    })
  })

  describe('getConnectionStatusCategory', () => {
    const cases: Array<[ConnectionState, string]> = [
      ['ready', 'connected'],
      ['connecting', 'degraded'],
      ['syncing', 'degraded'],
      ['disconnected', 'disconnected'],
      ['error', 'disconnected'],
      ['locked', 'disconnected'],
    ]

    for (const [input, expected] of cases) {
      it(`maps "${input}" → "${expected}"`, () => {
        expect(getConnectionStatusCategory(input)).toBe(expected)
      })
    }
  })

  describe('deriveRemoteStatus', () => {
    it('marks locked_by_other when state is "locked"', () => {
      const status = deriveRemoteStatus('locked')
      expect(status.locked_by_other).toBe(true)
      expect(status.vault_locked).toBe(true)
      expect(status.connection_state).toBe('locked')
    })

    it('does not mark locked_by_other for "ready"', () => {
      const status = deriveRemoteStatus('ready')
      expect(status.locked_by_other).toBe(false)
      expect(status.vault_locked).toBe(false)
      expect(status.connection_state).toBe('ready')
    })

    it('does not mark locked_by_other for "disconnected"', () => {
      const status = deriveRemoteStatus('disconnected')
      expect(status.locked_by_other).toBe(false)
      expect(status.connection_state).toBe('disconnected')
    })

    it('always sets writer_device to null', () => {
      for (const s of [
        'disconnected',
        'connecting',
        'syncing',
        'ready',
        'locked',
        'error',
      ] as ConnectionState[]) {
        expect(deriveRemoteStatus(s).writer_device).toBeNull()
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Sync helpers (Task 13)
// ---------------------------------------------------------------------------

describe('remote.model – sync helpers', () => {
  describe('defaultSyncSnapshot', () => {
    it('returns idle state with all nulls', () => {
      const snap = defaultSyncSnapshot()
      expect(snap.state).toBe('idle')
      expect(snap.progress).toBeNull()
      expect(snap.lastSyncMs).toBeNull()
      expect(snap.writerLock).toBeNull()
      expect(snap.errorMessage).toBeNull()
    })
  })

  describe('syncPhaseToState', () => {
    const cases: Array<[string, string]> = [
      ['bootstrap_started', 'syncing'],
      ['syncing', 'syncing'],
      ['delta_apply', 'syncing'],
      ['reconnect_started', 'reconnecting'],
      ['reconnecting', 'reconnecting'],
      ['reconnect_completed', 'synced'],
      ['synced', 'synced'],
      ['bootstrap_completed', 'synced'],
      ['cleared', 'idle'],
      ['idle', 'idle'],
      ['error', 'error'],
      ['unknown_phase', 'syncing'],
    ]

    for (const [phase, expected] of cases) {
      it(`maps "${phase}" → "${expected}"`, () => {
        expect(syncPhaseToState(phase)).toBe(expected)
      })
    }
  })

  describe('formatSyncProgress', () => {
    it('returns progress text with counts', () => {
      const event = {phase: 'syncing', items_synced: 45, items_total: 120} as SyncStatusEvent
      expect(formatSyncProgress(event)).toBe('Syncing\u2026 (45/120)')
    })

    it('returns generic syncing text without counts', () => {
      const event = {phase: 'bootstrap_started'} as SyncStatusEvent
      expect(formatSyncProgress(event)).toBe('Syncing\u2026')
    })

    it('returns reconnecting text for reconnect phase', () => {
      const event = {phase: 'reconnecting'} as SyncStatusEvent
      expect(formatSyncProgress(event)).toBe('Reconnecting\u2026')
    })

    it('returns null for synced phase', () => {
      const event = {phase: 'synced'} as SyncStatusEvent
      expect(formatSyncProgress(event)).toBeNull()
    })

    it('returns null for idle phase', () => {
      const event = {phase: 'idle'} as SyncStatusEvent
      expect(formatSyncProgress(event)).toBeNull()
    })
  })

  describe('deriveRemoteStatusWithLock', () => {
    it('marks locked_by_other with lock holder from snapshot', () => {
      const snap: SyncSnapshot = {
        ...defaultSyncSnapshot(),
        writerLock: {holder: 'mobile-device', since_ms: 1000},
      }
      const status = deriveRemoteStatusWithLock('ready', snap)
      expect(status.locked_by_other).toBe(true)
      expect(status.writer_device).toBe('mobile-device')
    })

    it('uses connection state locked when no lock in snapshot', () => {
      const snap = defaultSyncSnapshot()
      const status = deriveRemoteStatusWithLock('locked', snap)
      expect(status.locked_by_other).toBe(true)
      expect(status.writer_device).toBeNull()
    })

    it('not locked when ready and no writer lock', () => {
      const snap = defaultSyncSnapshot()
      const status = deriveRemoteStatusWithLock('ready', snap)
      expect(status.locked_by_other).toBe(false)
      expect(status.writer_device).toBeNull()
    })
  })

  describe('formatLastSyncTime', () => {
    it('returns "just now" for very recent time', () => {
      expect(formatLastSyncTime(Date.now() - 2_000)).toBe('just now')
    })

    it('returns seconds ago for less than a minute', () => {
      const result = formatLastSyncTime(Date.now() - 30_000)
      expect(result).toBe('30s ago')
    })

    it('returns minutes ago for less than an hour', () => {
      const result = formatLastSyncTime(Date.now() - 300_000)
      expect(result).toBe('5 min ago')
    })

    it('returns hours ago for less than a day', () => {
      const result = formatLastSyncTime(Date.now() - 7_200_000)
      expect(result).toBe('2h ago')
    })
  })
})

describe('remote.model – writer lock helpers', () => {
  describe('getWriterLockToastMessage', () => {
    it('includes device name when holder is known', () => {
      expect(getWriterLockToastMessage('My Phone')).toBe(
        'Write locked by My Phone. Wait or request lock.',
      )
    })

    it('uses generic text when holder is null', () => {
      expect(getWriterLockToastMessage(null)).toBe(
        'Write locked by another device. Wait or request lock.',
      )
    })
  })
})
