import {describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

describe('CatalogPasswordsRepository.readRoot entry/group classification', () => {
  it('classifies exported entries as entries and groups as folders', async () => {
    const sendCatalog = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'passmanager:root:export') {
        return {
          ok: true,
          result: {
            root: {
              version: 2,
              entries: [
                {
                  id: 'entry-1',
                  title: 'Kaifaty',
                  urls: [],
                  username: '',
                  otps: [],
                },
              ],
              folders: [],
            },
          },
        }
      }
      return {ok: true, result: undefined}
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
    const out = await repo.readRoot<{
      folders: string[]
      entries: Array<{id: string; title: string; folderPath: string | null}>
    }>()

    expect(out?.folders).toEqual([])
    expect(out?.entries).toHaveLength(1)
    expect(out?.entries[0]).toMatchObject({id: 'entry-1', title: 'Kaifaty', folderPath: null})
  })
})
