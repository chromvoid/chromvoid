import {describe, expect, it, vi} from 'vitest'

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

function createRepo(opts?: {
  sendCatalogOverride?: (cmd: string, data: Record<string, unknown>) => Promise<unknown>
}) {
  const ensuredGroups: string[] = []

  const sendCatalog = vi.fn().mockImplementation(
    opts?.sendCatalogOverride ??
      (async (cmd: string, data: Record<string, unknown>) => {
        switch (cmd) {
          case 'passmanager:group:ensure':
            ensuredGroups.push(String(data['path']))
            return {ok: true, result: undefined}
          case 'passmanager:entry:list':
            return {ok: true, result: {entries: [], folders: []}}
          case 'passmanager:entry:save':
            return {ok: true, result: {entry_id: data['entry_id'] ?? crypto.randomUUID()}}
          case 'passmanager:root:export':
            return {ok: true, result: {root: {version: 2, entries: [], folders: []}}}
          default:
            return {ok: true, result: undefined}
        }
      }),
  )

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
  return {repo, catalog, sendCatalog, ensuredGroups}
}

describe('CatalogPasswordsRepository subgroup creation bug', () => {
  it('should create subgroup under existing group when backend has the parent', async () => {
    const ctx = createRepo()

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['parentGroup', 'parentGroup/newSub'],
      entries: [],
    }

    const ok = await ctx.repo.saveRoot(fileFromJson(data))

    if (!ok) {
      const calls = ctx.catalog.lastError.set.mock.calls
      const last = calls.length ? calls[calls.length - 1]?.[0] : undefined
      throw new Error(`saveRoot returned false. lastError=${String(last)}`)
    }

    expect(ok).toBe(true)
    // Domain commands ensure groups at the backend level
    expect(ctx.ensuredGroups).toContain('parentGroup')
    expect(ctx.ensuredGroups).toContain('parentGroup/newSub')
  })

  it('should create subgroup when parent exists in cache but removeObsoleteEntries deletes stale entries', async () => {
    const ctx = createRepo()

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['parentGroup', 'parentGroup/newSub'],
      entries: [
        {
          id: 'e1',
          title: 'MyEntry',
          username: 'user',
          urls: [],
          otps: [],
          folderPath: 'parentGroup',
        },
      ],
    }

    const ok = await ctx.repo.saveRoot(fileFromJson(data))

    if (!ok) {
      const calls = ctx.catalog.lastError.set.mock.calls
      const last = calls.length ? calls[calls.length - 1]?.[0] : undefined
      throw new Error(`saveRoot returned false. lastError=${String(last)}`)
    }

    expect(ok).toBe(true)
    expect(ctx.ensuredGroups).toContain('parentGroup')
    expect(ctx.ensuredGroups).toContain('parentGroup/newSub')
  })

  it('succeeds even when parent group only exists in cache but not on backend', async () => {
    // With domain commands, there is no mirror/backend inconsistency.
    // ensureGroup is always sent to the backend regardless of local mirror state.
    const ctx = createRepo()

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['parentGroup', 'parentGroup/newSub'],
      entries: [
        {
          id: 'e1',
          title: 'MyEntry',
          username: 'user',
          urls: [],
          otps: [],
          folderPath: 'parentGroup',
        },
      ],
    }

    const ok = await ctx.repo.saveRoot(fileFromJson(data))

    if (!ok) {
      const calls = ctx.catalog.lastError.set.mock.calls
      const last = calls.length ? calls[calls.length - 1]?.[0] : undefined
      throw new Error(`saveRoot returned false. lastError=${String(last)}`)
    }

    expect(ok).toBe(true)

    // Both group paths were sent to the backend via domain commands
    expect(ctx.ensuredGroups).toContain('parentGroup')
    expect(ctx.ensuredGroups).toContain('parentGroup/newSub')

    const listCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:list')
    expect(listCalls).toHaveLength(1)
    const importCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:root:import')
    expect(importCalls).toHaveLength(0)
  })
})
