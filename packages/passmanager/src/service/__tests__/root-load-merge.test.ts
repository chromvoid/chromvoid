import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest'

// Mock external deps before imports
vi.mock('sweetalert2', () => ({default: {fire: vi.fn(async () => ({isConfirmed: true}))}}))
vi.mock('@project/utils', () => ({sha256: vi.fn(async (s: string) => `hash:${s}`)}))

import {Entry} from '../entry'
import {Group} from '../group'
import {ManagerRoot} from '../root'
import type {ManagerSaver, IEntry, PassManagerRootV2} from '../types'

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

describe('load() merge behavior', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('first load creates all entries fresh (no merge)', async () => {
    const payload = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))

    // entries() is undefined before first load
    expect(root.entries()).toBeUndefined()

    await root.load()

    const all = root.allEntries
    expect(all).toHaveLength(2)
    expect(all.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  it('reload reuses existing Entry objects by id (identity preserved)', async () => {
    // First load
    const payload1 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    const entryA = root.getEntry('a')!
    const entryB = root.getEntry('b')!
    expect(entryA).toBeDefined()
    expect(entryB).toBeDefined()

    // Reload with updated titles
    const payload2 = makeV2Payload([
      {id: 'a', title: 'Alpha Updated'},
      {id: 'b', title: 'Beta Updated'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    const entryA2 = root.getEntry('a')!
    const entryB2 = root.getEntry('b')!

    // Same object references (identity preserved)
    expect(entryA2).toBe(entryA)
    expect(entryB2).toBe(entryB)

    // But data is updated
    expect(entryA2.title).toBe('Alpha Updated')
    expect(entryB2.title).toBe('Beta Updated')
  })

  it('reload removes entries not present in remote data', async () => {
    // First load with 3 entries
    const payload1 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
      {id: 'c', title: 'Charlie'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    expect(root.allEntries).toHaveLength(3)

    // Reload with only 2 entries (c removed on remote)
    const payload2 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    const all = root.allEntries
    expect(all).toHaveLength(2)
    expect(all.map((e) => e.id).sort()).toEqual(['a', 'b'])
    expect(root.getEntry('c')).toBeUndefined()
  })

  it('reload creates new entries that were not in local data', async () => {
    // First load with 1 entry
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    const entryA = root.getEntry('a')!
    expect(root.allEntries).toHaveLength(1)

    // Reload with 2 entries (b is new)
    const payload2 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    expect(root.allEntries).toHaveLength(2)
    // A is still the same object
    expect(root.getEntry('a')).toBe(entryA)
    // B is a new object
    const entryB = root.getEntry('b')!
    expect(entryB).toBeDefined()
    expect(entryB.title).toBe('Beta')
  })

  it('reload reuses existing Group objects by id', async () => {
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha', folderPath: 'work'}], ['work'])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    const workGroup = root.getGroup('group:work')!
    expect(workGroup).toBeDefined()
    expect(workGroup.name).toBe('work')

    // Reload with same group, new title for entry
    const payload2 = makeV2Payload([{id: 'a', title: 'Alpha Updated', folderPath: 'work'}], ['work'])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    const workGroup2 = root.getGroup('group:work')!
    expect(workGroup2).toBe(workGroup) // same reference
    expect(workGroup2.entries()).toHaveLength(1)
    expect(workGroup2.entries()[0]!.title).toBe('Alpha Updated')
  })

  it('reload handles entry moving to different group (parent migration)', async () => {
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha', folderPath: 'work'}], ['work', 'personal'])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    const entryA = root.getEntry('a')!
    expect(entryA.parent).toBe(root.getGroup('group:work'))

    // Reload: entry moved from 'work' to 'personal'
    const payload2 = makeV2Payload([{id: 'a', title: 'Alpha', folderPath: 'personal'}], ['work', 'personal'])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    const entryA2 = root.getEntry('a')!
    expect(entryA2).toBe(entryA) // identity preserved
    expect(entryA2.parent).toBe(root.getGroup('group:personal')) // parent updated
  })

  it('reload with empty remote data does NOT overwrite non-empty entries (guard)', async () => {
    const payload1 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()
    expect(root.allEntries).toHaveLength(2)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Reload with empty entries — guard should refuse overwrite
    const payload2 = makeV2Payload([])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload2))
    await root.load()

    expect(root.allEntries).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledWith(
      '[PassManager][root.load] refusing to overwrite %d entries with empty payload',
      2,
    )
    warnSpy.mockRestore()
  })

  it('initial load with empty payload sets entries to empty array', async () => {
    expect(root.entries()).toBeUndefined()
    const payload = makeV2Payload([])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.entries()).toEqual([])
    expect(root.allEntries).toHaveLength(0)
  })

  it('fullClean allows empty overwrite via _allowEmptyOverwrite flag', async () => {
    const payload1 = makeV2Payload([
      {id: 'a', title: 'Alpha'},
      {id: 'b', title: 'Beta'},
      {id: 'c', title: 'Charlie'},
    ])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()
    expect(root.allEntries).toHaveLength(3)

    // fullClean sets _allowEmptyOverwrite, calls clean() + save()
    // After fullClean, entries should be empty
    await root.fullClean()
    expect(root.entriesList()).toHaveLength(0)
  })

  it('does not reload when data source returns undefined', async () => {
    // First load
    const payload = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload))
    await root.load()
    expect(root.allEntries).toHaveLength(1)

    // Subsequent call returns undefined (data source not ready)
    ;(saver.read as Mock).mockResolvedValue(undefined)
    await root.load()

    // State unchanged
    expect(root.allEntries).toHaveLength(1)
    expect(root.getEntry('a')!.title).toBe('Alpha')
  })
})

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0))

describe('deferred reload after save', () => {
  let root: ManagerRoot
  let saver: ManagerSaver

  beforeEach(() => {
    vi.clearAllMocks()
    saver = createMockSaver()
    root = new ManagerRoot(saver)
  })

  it('load() blocked during save sets _loadRequestedDuringSave and triggers reload after save completes', async () => {
    // Initial load
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()
    expect(root.allEntries).toHaveLength(1)

    // Start a save that blocks
    let resolveSave!: (v: boolean) => void
    ;(saver.save as Mock).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveSave = resolve }),
    )
    const savePromise = root.save()

    // While save is in-flight, load() should be blocked and flag set
    const remotePayload = makeV2Payload([{id: 'a', title: 'Alpha'}, {id: 'b', title: 'Beta'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(remotePayload))
    await root.load()

    // Still has old data (load was blocked)
    expect(root.allEntries).toHaveLength(1)

    // Complete the save — deferred reload should fire
    resolveSave(true)
    await savePromise
    // Wait for the deferred void this.load() to complete
    await flushMicrotasks()
    expect(root.allEntries).toHaveLength(2)
    expect(root.getEntry('b')).toBeDefined()
  })

  it('multiple blocked load() calls during same save produce only one deferred reload', async () => {
    // Initial load
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    let resolveSave!: (v: boolean) => void
    ;(saver.save as Mock).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveSave = resolve }),
    )
    const savePromise = root.save()

    // Call load() 3 times while save is in-flight
    const remotePayload = makeV2Payload([{id: 'a', title: 'Alpha'}, {id: 'b', title: 'Beta'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(remotePayload))
    await root.load()
    await root.load()
    await root.load()

    // Complete save
    resolveSave(true)
    await savePromise
    await flushMicrotasks()
    expect(root.allEntries).toHaveLength(2)

    // read was called only once for the deferred reload (not 3 times)
    // Initial load(1) + deferred reload(1) = 2 total read calls after savePromise
    // But we had initial load + 3 blocked loads (no read) + 1 deferred reload = 2 reads
    const readCalls = (saver.read as Mock).mock.calls.length
    // Initial load: 1, three blocked loads: 0 reads, deferred reload: 1 = 2 total
    expect(readCalls).toBe(2)
  })

  it('normal save without blocked load does NOT trigger deferred reload', async () => {
    // Initial load
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    const readCountBefore = (saver.read as Mock).mock.calls.length

    // Save completes without any load() attempt during it
    ;(saver.save as Mock).mockResolvedValue(true)
    await root.save()

    // No additional read calls (no deferred reload)
    expect((saver.read as Mock).mock.calls.length).toBe(readCountBefore)
  })

  it('deferred reload waits for chained saves (_savePending) to complete', async () => {
    // Initial load
    const payload1 = makeV2Payload([{id: 'a', title: 'Alpha'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(payload1))
    await root.load()

    let saveCount = 0
    let resolveSave1!: (v: boolean) => void
    let resolveSave2!: (v: boolean) => void
    ;(saver.save as Mock).mockImplementation(() => {
      saveCount++
      if (saveCount === 1) {
        return new Promise<boolean>((resolve) => { resolveSave1 = resolve })
      }
      return new Promise<boolean>((resolve) => { resolveSave2 = resolve })
    })

    // First save
    const savePromise1 = root.save()
    // Second save while first is in-flight (coalesces via _savePending)
    root.save()

    // Load while saves are in-flight
    const remotePayload = makeV2Payload([{id: 'a', title: 'Alpha'}, {id: 'c', title: 'Charlie'}])
    ;(saver.read as Mock).mockResolvedValue(JSON.stringify(remotePayload))
    await root.load()

    // Complete first save — second save should start due to _savePending
    resolveSave1(true)
    await savePromise1

    // Deferred reload should NOT have happened yet (_savePending caused re-save)
    // Still waiting for second save to complete
    expect(root.allEntries).toHaveLength(1)

    // Complete second save — now deferred reload should fire
    resolveSave2(true)
    await flushMicrotasks()
    expect(root.allEntries).toHaveLength(2)
    expect(root.getEntry('c')).toBeDefined()
  })
})
