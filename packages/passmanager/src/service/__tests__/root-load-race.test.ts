import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest'

// Mock external deps before imports
vi.mock('sweetalert2', () => ({default: {fire: vi.fn(async () => ({isConfirmed: true}))}}))
vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {ManagerRoot} from '../root'
import type {ManagerSaver, PassManagerRootV2} from '../types'

function createMockSaver(overrides: Partial<ManagerSaver> = {}): ManagerSaver {
  return {
    save: vi.fn(async () => true),
    read: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
    getOTP: vi.fn(async () => undefined),
    getOTPSeckey: vi.fn(async () => undefined),
    removeOTP: vi.fn(async () => true),
    saveOTP: vi.fn(async () => true),
    readEntryPassword: vi.fn(async () => undefined),
    readEntryNote: vi.fn(async () => undefined),
    saveEntryPassword: vi.fn(async () => true),
    saveEntryNote: vi.fn(async () => true),
    removeEntryPassword: vi.fn(async () => true),
    removeEntryNote: vi.fn(async () => true),
    readEntrySshPrivateKey: vi.fn(async () => undefined),
    readEntrySshPublicKey: vi.fn(async () => undefined),
    saveEntrySshPrivateKey: vi.fn(async () => true),
    saveEntrySshPublicKey: vi.fn(async () => true),
    removeEntrySshPrivateKey: vi.fn(async () => true),
    removeEntrySshPublicKey: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
    ...overrides,
  }
}

function makeV2Payload(
  entries: Array<{id: string; title: string; folderPath?: string | null}>,
  folders: string[] = [],
): PassManagerRootV2 {
  const now = Date.now()
  return {
    version: 2,
    createdTs: now,
    updatedTs: now,
    folders,
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      username: '',
      urls: [],
      otps: [],
      folderPath: e.folderPath ?? null,
    })),
  }
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0))

// ---------------------------------------------------------------------------
// Race regression tests — dedicated file covering empty-payload guard,
// deferred reload after save, and lifecycle re-init safety.
// ---------------------------------------------------------------------------

describe('empty-payload guard race scenarios', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('rapid consecutive loads with alternating empty/non-empty payloads preserve entries', async () => {
    // Simulate catalog.subscribe triggering rapid reload bursts where an
    // intermediate response returns empty data (e.g. vault re-syncing).
    const payload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
      {id: 'c', title: 'Charlie'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(3)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Empty payload burst — guard should refuse
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(makeV2Payload([])))
    await root.load()
    expect(root.allEntries).toHaveLength(3)
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Another empty burst immediately after — guard fires again
    await root.load()
    expect(root.allEntries).toHaveLength(3)
    expect(warnSpy).toHaveBeenCalledTimes(2)

    // Real non-empty update arrives — should apply
    const updatedPayload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
      {id: 'c', title: 'Charlie'},
      {id: 'd', title: 'Delta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(updatedPayload))
    await root.load()
    expect(root.allEntries).toHaveLength(4)

    warnSpy.mockRestore()
  })

  it('empty-payload guard resets _allowEmptyOverwrite after fullClean so subsequent empty payloads are blocked', async () => {
    // Load initial data
    const payload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(2)

    // fullClean sets _allowEmptyOverwrite — entries become empty.
    // fullClean calls save() without await, so flush to let it complete.
    await root.fullClean()
    await flushMicrotasks()
    expect(root.entriesList()).toHaveLength(0)

    // Re-populate entries
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(2)

    // Now an empty payload should be BLOCKED (flag was consumed by fullClean's load cycle)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(makeV2Payload([])))
    await root.load()
    expect(root.allEntries).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('deferred reload race scenarios', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('deferred reload after save respects the empty-payload guard', async () => {
    // Setup: load entries, then start a save
    const payload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(2)

    // Start slow save
    let resolveSave!: (v: boolean) => void
    ;(saver.save as Mock).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve
        }),
    )
    const savePromise = root.save()

    // Request load during save — backend returns empty payload (race!)
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(makeV2Payload([])))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await root.load() // blocked by _saving, sets _loadRequestedDuringSave

    // Complete save — deferred reload fires, but empty-payload guard blocks it
    resolveSave(true)
    await savePromise
    await flushMicrotasks()

    // Entries should still be intact (guard refused the empty deferred reload)
    expect(root.allEntries).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledWith(
      '[PassManager][root.load] refusing to overwrite %d entries with empty payload',
      2,
    )
    warnSpy.mockRestore()
  })

  it('load requested during _pendingEntryUpdates also triggers deferred reload', async () => {
    // Setup: load entries
    const payload = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(1)

    // Simulate an entry update in-flight (e.g. Entry.update calling beginEntryUpdate)
    root.beginEntryUpdate()

    // Load is blocked by _pendingEntryUpdates > 0, should set deferred flag
    const remotePayload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(remotePayload))
    await root.load()
    expect(root.allEntries).toHaveLength(1) // still old data

    // Now start a save (which is needed to trigger deferred reload from _executeSave)
    ;(saver.save as Mock).mockResolvedValue(true)

    // End entry update — load was deferred
    root.endEntryUpdate()

    // Trigger save + complete it — the deferred reload should fire from save's finally block
    // But _loadRequestedDuringSave is checked in _executeSave, so we need a save cycle
    await root.save()
    await flushMicrotasks()

    // The deferred reload should have picked up new data
    expect(root.allEntries).toHaveLength(2)
    expect(root.getEntry('b')).toBeDefined()
  })
})

describe('lifecycle re-init safety', () => {
  it('new ManagerRoot starts with undefined entries and populates correctly after load', async () => {
    // Simulates rapid cleanup+init cycle in password-manager.model.ts:
    // 1. Old ManagerRoot exists with loaded entries
    // 2. cleanup() is called (clean() sets entries to [])
    // 3. init() creates a NEW ManagerRoot — entries should be undefined, not []
    // 4. load() on new root populates entries

    const saver1 = createMockSaver()
    const root1 = new ManagerRoot(saver1)
    const payload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver1.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root1.load()
    expect(root1.allEntries).toHaveLength(2)

    // Simulate cleanup: old root is cleaned
    root1.clean()
    expect(root1.entriesList()).toHaveLength(0)

    // Simulate init: create NEW ManagerRoot (what password-manager.model.ts does)
    const saver2 = createMockSaver()
    const root2 = new ManagerRoot(saver2)

    // New root should have undefined entries (fresh state), not []
    expect(root2.entries()).toBeUndefined()

    // Load on new root with same data
    ;(saver2.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root2.load()
    expect(root2.allEntries).toHaveLength(2)
    expect(root2.getEntry('a')!.title).toBe('Alpha')
    expect(root2.getEntry('b')!.title).toBe('Beta')

    // Old root state is independent — verify isolation
    expect(root1.entriesList()).toHaveLength(0)
  })
})
