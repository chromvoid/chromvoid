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

  it('treats explicit folderPath null as root even if stale group_path is present', async () => {
    const sendCatalog = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'passmanager:root:export') {
        return {
          ok: true,
          result: {
            root: {
              version: 2,
              entries: [
                {
                  id: 'entry-root-1',
                  title: 'Root after move',
                  urls: [],
                  username: '',
                  otps: [],
                  folderPath: null,
                  group_path: 'Work/Subgroup',
                },
              ],
              folders: ['Work/Subgroup'],
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
      entries: Array<{id: string; folderPath: string | null}>
    }>()

    expect(out?.entries).toHaveLength(1)
    expect(out?.entries[0]).toMatchObject({id: 'entry-root-1', folderPath: null})
  })

  it('does not probe OTP generation during readRoot integrity scan', async () => {
    const sendCatalog = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'passmanager:root:export') {
        return {
          ok: true,
          result: {
            root: {
              version: 2,
              entries: [
                {
                  id: 'entry-otp-1',
                  title: 'OTP entry',
                  urls: [],
                  username: '',
                  otps: [
                    {
                      id: 'otp-1',
                      label: 'Primary OTP',
                      digits: 6,
                      period: 30,
                      algorithm: 'SHA1',
                      encoding: 'base32',
                      type: 'TOTP',
                    },
                  ],
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
      entries: Array<{id: string; otps: Array<{id?: string}>}>
    }>()

    expect(out?.entries[0]?.otps[0]?.id).toBe('otp-1')
    expect(sendCatalog).toHaveBeenCalledWith('passmanager:root:export', {})
    expect(sendCatalog).not.toHaveBeenCalledWith(
      'passmanager:otp:generate',
      expect.objectContaining({otp_id: 'otp-1'}),
    )
  })
})
