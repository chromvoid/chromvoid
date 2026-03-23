import {beforeEach, describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'
import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'

const tauriInvoke = vi.fn()

vi.mock('../../src/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: vi.fn().mockResolvedValue(() => {}),
  }
})

/**
 * Integration test with TauriTransport.
 *
 * TauriTransport.sendCatalog does not yet handle domain commands
 * (passmanager:entry:*, passmanager:root:*, etc.) natively. It falls through
 * with "Unsupported IPC command". We override sendCatalog via spy to route
 * domain commands through tauriInvoke's rpc_dispatch, simulating future
 * TauriTransport behavior.
 */
function createRepo(opts?: {mockDomainCommands?: boolean}) {
  const tauriTransport = new TauriTransport()

  if (opts?.mockDomainCommands) {
    vi.spyOn(tauriTransport, 'sendCatalog').mockImplementation(
      async (cmd: string, data: Record<string, unknown>) => {
        const res = (await tauriInvoke('rpc_dispatch', {args: {v: 1, command: cmd, data}})) as {
          ok?: boolean
          error?: string
          result?: {command?: string; result?: unknown}
        }
        if (!res?.ok) {
          const msg = res?.error || 'RPC error'
          throw new Error(msg)
        }
        const result = res?.result
        if (!result || typeof result !== 'object' || !('result' in result)) {
          throw new Error('Invalid rpc_dispatch response')
        }
        return {ok: true, result: result.result}
      },
    )
  }

  const catalog = {
    transport: tauriTransport,
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
  return {repo, catalog}
}

describe('CatalogPasswordsRepository + TauriTransport integration', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
  })

  it('reproduces READ_ROOT_ERROR when domain command is unsupported by transport', async () => {
    // TauriTransport.sendCatalog throws for unknown domain commands.
    // readRoot catches and sets READ_ROOT_ERROR.
    const {repo, catalog} = createRepo()

    const out = await repo.readRoot()

    expect(out).toBeUndefined()
    expect(catalog.lastError.set).toHaveBeenCalled()
    const errorArg = String(catalog.lastError.set.mock.calls[0]?.[0] ?? '')
    expect(errorArg).toContain('READ_ROOT_ERROR')
  })

  it('reads root successfully when domain commands route through rpc_dispatch', async () => {
    tauriInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'rpc_dispatch') {
        const payload = (args as {args?: {command?: string}})?.args
        if (payload?.command === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              command: 'passmanager:root:export',
              result: {root: {version: 2, entries: [], folders: []}},
            },
          }
        }

        return {
          ok: false,
          error: `unsupported rpc command: ${String(payload?.command ?? '')}`,
          code: 'COMMAND_NOT_FOUND',
        }
      }

      throw new Error(`unexpected tauri command: ${cmd}`)
    })

    const {repo, catalog} = createRepo({mockDomainCommands: true})

    const out = await repo.readRoot<{version: number; entries: unknown[]; folders: string[]}>()

    expect(out).toBeDefined()
    expect(out?.version).toBe(2)
    expect(out?.entries).toEqual([])
    expect(out?.folders).toEqual([])
    expect(catalog.lastError.set).not.toHaveBeenCalled()
    expect(tauriInvoke).toHaveBeenCalledWith(
      'rpc_dispatch',
      expect.objectContaining({
        args: expect.objectContaining({command: 'passmanager:root:export'}),
      }),
    )
  })
})
