import {describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

function createRepo(opts: {
  sendCatalogOverride: (cmd: string, data: Record<string, unknown>) => Promise<unknown>
}) {
  const sendCatalog = vi.fn().mockImplementation(opts.sendCatalogOverride)

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
  return {repo, catalog, sendCatalog}
}

describe('CatalogPasswordsRepository.readRoot — NODE_NOT_FOUND regression', () => {
  it('returns undefined and sets READ_ROOT_ERROR when root:export fails', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async () => {
        return {ok: false, error: 'Node not found (NODE_NOT_FOUND)'}
      },
    })

    const out = await repo.readRoot()
    expect(out).toBeUndefined()
    expect(catalog.lastError.set).toHaveBeenCalled()
    const errorArg = catalog.lastError.set.mock.calls[0]?.[0] ?? ''
    expect(errorArg).toContain('READ_ROOT_ERROR')
  })

  it('returns undefined when root:export throws', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async () => {
        throw new Error('Node not found (NODE_NOT_FOUND)')
      },
    })

    const out = await repo.readRoot()
    expect(out).toBeUndefined()
    expect(catalog.lastError.set).toHaveBeenCalled()
    const errorArg = catalog.lastError.set.mock.calls[0]?.[0] ?? ''
    expect(errorArg).toContain('READ_ROOT_ERROR')
  })

  it('returns valid empty root when root:export succeeds with empty data', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {ok: true, result: {root: {version: 2, entries: [], folders: []}}}
        }
        return {ok: true, result: undefined}
      },
    })

    const out = await repo.readRoot<{version: number; entries: unknown[]; folders: string[]}>()
    expect(out).toBeDefined()
    expect(out?.version).toBe(2)
    expect(out?.entries).toEqual([])
    expect(out?.folders).toEqual([])
    expect(catalog.lastError.set).not.toHaveBeenCalled()
  })

  it('reads root entry via domain root:export', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              root: {
                version: 2,
                entries: [
                  {
                    id: 'entry-1',
                    title: 'Цук',
                    urls: [],
                    username: '234124',
                    otps: [],
                  },
                ],
                folders: [],
              },
            },
          }
        }
        return {ok: true, result: undefined}
      },
    })

    const out = await repo.readRoot<{
      version: number
      entries: Array<{id: string; title: string; folderPath: string | null}>
      folders: string[]
    }>()
    expect(out).toBeDefined()
    expect(out?.version).toBe(2)
    expect(out?.folders).toEqual([])
    expect(out?.entries).toHaveLength(1)
    expect(out?.entries[0]).toMatchObject({
      id: 'entry-1',
      title: 'Цук',
      folderPath: null,
    })
    expect(catalog.lastError.set).not.toHaveBeenCalled()
  })

  it('reads group entries via domain root:export', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              root: {
                version: 2,
                entries: [
                  {
                    id: 'entry-work-1',
                    title: 'Jira',
                    urls: [],
                    username: '',
                    otps: [],
                    group_path: 'Work',
                  },
                ],
                folders: [{path: 'Work', name: 'Work'}],
              },
            },
          }
        }
        return {ok: true, result: undefined}
      },
    })

    const out = await repo.readRoot<{
      entries: Array<{id: string; folderPath: string | null}>
      folders: string[]
    }>()
    expect(out).toBeDefined()
    expect(out?.folders).toContain('Work')
    expect(out?.entries).toHaveLength(1)
    expect(out?.entries[0]).toMatchObject({
      id: 'entry-work-1',
      folderPath: 'Work',
    })
    expect(catalog.lastError.set).not.toHaveBeenCalled()
  })
})
