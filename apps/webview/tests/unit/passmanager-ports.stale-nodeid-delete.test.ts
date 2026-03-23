import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {PassManagerRootV2} from '@project/passmanager'
import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

function fileFromJson(json: unknown): File {
  const text = JSON.stringify(json)
  return {
    name: 'PASSWORDMANAGER',
    type: 'application/json',
    size: text.length,
    text: async () => text,
  } as unknown as File
}

function createRepo(initialEntries: Array<{id: string}> = []) {
  const existingEntries: Array<{id: string}> = [...initialEntries]

  const sendCatalog = vi.fn().mockImplementation(async (cmd: string, data: Record<string, unknown>) => {
    switch (cmd) {
      case 'passmanager:group:ensure':
      case 'passmanager:group:setMeta':
        return {ok: true, result: undefined}
      case 'passmanager:entry:list':
        return {
          ok: true,
          result: {
            entries: existingEntries.map((entry) => ({id: entry.id, title: entry.id})),
            folders: [],
          },
        }
      case 'passmanager:entry:save': {
        const entryId = String(data['entry_id'] ?? data['id'] ?? crypto.randomUUID())
        const idx = existingEntries.findIndex((entry) => entry.id === entryId)
        if (idx === -1) existingEntries.push({id: entryId})
        return {ok: true, result: {entry_id: entryId}}
      }
      case 'passmanager:entry:delete': {
        const entryId = String(data['entry_id'])
        const idx = existingEntries.findIndex((entry) => entry.id === entryId)
        if (idx >= 0) existingEntries.splice(idx, 1)
        return {ok: true, result: undefined}
      }
      case 'passmanager:root:export':
        return {ok: true, result: {root: {version: 2, entries: [], folders: []}}}
      default:
        return {ok: true, result: undefined}
    }
  })

  const catalog = {
    transport: {sendCatalog},
    catalog: {
      getChildren: vi.fn().mockReturnValue([]),
      getNode: vi.fn().mockReturnValue(undefined),
    },
    refresh: vi.fn().mockResolvedValue(undefined),
    queueRefresh: vi.fn(),
    lastError: {set: vi.fn()},
  }

  const catalogTransport = new CatalogTransport(catalog as any)
  const repo = new CatalogPasswordsRepository(catalog as any, catalogTransport)
  return {repo, catalog, sendCatalog, existingEntries}
}

describe('CatalogPasswordsRepository stale-node cleanup via incremental saveRoot', () => {
  let ctx: ReturnType<typeof createRepo>

  beforeEach(() => {
    ctx = createRepo()
  })

  it('saves empty root without issuing destructive import', async () => {
    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [],
    }

    const ok = await ctx.repo.saveRoot(fileFromJson(data))
    expect(ok).toBe(true)

    const listCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:list')
    expect(listCalls).toHaveLength(1)
    const importCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:root:import')
    expect(importCalls).toHaveLength(0)
  })

  it('removes obsolete entries by id and keeps desired entries', async () => {
    ctx = createRepo([{id: 'obsolete-entry'}])

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [
        {
          id: 'keep-1',
          title: 'KeepMe',
          username: '',
          urls: [],
          otps: [],
          folderPath: null,
        },
      ],
    }

    const ok = await ctx.repo.saveRoot(fileFromJson(data))
    expect(ok).toBe(true)

    const deleteCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:delete')
    expect(deleteCalls).toHaveLength(1)
    expect((deleteCalls[0]?.[1] as Record<string, unknown>)['entry_id']).toBe('obsolete-entry')

    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    expect(saveCalls.some((call) => (call[1] as Record<string, unknown>)['entry_id'] === 'keep-1')).toBe(true)
  })
})
