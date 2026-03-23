import {describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

/**
 * Ensure root dir tests — adapted to domain commands.
 *
 * Original: tested ensureRootDir behavior (listing /.passmanager, creating it).
 * With domain commands, readRoot calls root:export directly, and saveRoot
 * calls group:ensure + root:import. The server manages the root directory.
 */

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

describe('CatalogPasswordsRepository.ensureRootDir (tauri quirks)', () => {
  it('readRoot succeeds when root:export returns valid data', async () => {
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              root: {
                version: 2,
                entries: [],
                folders: [],
              },
            },
          }
        }
        return {ok: true, result: undefined}
      },
    })

    const out = await repo.readRoot<{version: number}>()

    expect(out?.version).toBe(2)
    expect(catalog.lastError.set).not.toHaveBeenCalled()
  })

  it('readRoot returns normalized empty root when root:export returns minimal data', async () => {
    let exportCallCount = 0
    const {repo, catalog} = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          exportCallCount++
          return {ok: true, result: {root: {}}}
        }
        return {ok: true, result: undefined}
      },
    })

    const out = await repo.readRoot<{version: number; entries: unknown[]; folders: string[]}>()

    expect(out?.version).toBe(2)
    expect(out?.entries).toEqual([])
    expect(out?.folders).toEqual([])
    expect(catalog.lastError.set).not.toHaveBeenCalled()
    expect(exportCallCount).toBe(1)
  })
})
