import {beforeEach, describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'
import type {PassManagerRootV2} from '@project/passmanager/types'

function fileFromJson(value: unknown): File {
  const text = JSON.stringify(value)
  return {
    name: 'PASSWORDMANAGER',
    type: 'application/json',
    size: text.length,
    text: async () => text,
  } as unknown as File
}

function createRepo() {
  const sendCatalog = vi.fn().mockImplementation(async (cmd: string, data: Record<string, unknown>) => {
    switch (cmd) {
      case 'passmanager:entry:save':
        return {ok: true, result: {entry_id: data['entry_id'] ?? crypto.randomUUID()}}
      case 'passmanager:entry:delete':
      case 'passmanager:entry:move':
      case 'passmanager:entry:rename':
        return {ok: true, result: undefined}
      case 'passmanager:entry:list':
        return {ok: true, result: {entries: [{id: 'entry-1'}], folders: ['Work']}}
      case 'passmanager:group:ensure':
      case 'passmanager:group:delete':
      case 'passmanager:group:setMeta':
      case 'passmanager:root:import':
        return {ok: true, result: undefined}
      case 'passmanager:group:list':
        return {ok: true, result: {groups: [{path: 'Work'}]}}
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

  const transport = new CatalogTransport(catalog as any)
  const repo = new CatalogPasswordsRepository(catalog as any, transport)
  return {repo, sendCatalog, catalog}
}

describe('CatalogPasswordsRepository saveRoot root moves', () => {
  let ctx: ReturnType<typeof createRepo>

  beforeEach(() => {
    ctx = createRepo()
  })

  it('writes existing root entries with explicit empty groupPath', async () => {
    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [
        {
          id: 'entry-1',
          title: 'Root Entry',
          username: 'alice',
          urls: [],
          folderPath: null,
          otps: [],
        },
      ],
    }

    await expect(ctx.repo.saveRoot(fileFromJson(data))).resolves.toBe(true)

    const saveCalls = ctx.sendCatalog.mock.calls.filter(([cmd]: [string]) => cmd === 'passmanager:entry:save')
    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0]![1]).toMatchObject({
      entry_id: 'entry-1',
      group_path: '',
    })
  })
})
