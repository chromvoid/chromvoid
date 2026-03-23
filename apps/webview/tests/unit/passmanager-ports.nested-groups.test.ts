import {beforeEach, describe, expect, it, vi} from 'vitest'

import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'

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
        return {ok: true, result: {entries: [], folders: []}}
      case 'passmanager:secret:save':
      case 'passmanager:secret:delete':
        return {ok: true, result: undefined}
      case 'passmanager:secret:read':
        return {ok: true, result: {value: ''}}
      case 'passmanager:group:ensure':
        return {ok: true, result: undefined}
      case 'passmanager:group:list':
        return {ok: true, result: {groups: []}}
      case 'passmanager:root:import':
        return {ok: true, result: undefined}
      case 'passmanager:root:export':
        return {ok: true, result: {root: {version: 2, entries: [], folders: []}}}
      default:
        return {ok: false, error: `unknown command: ${cmd}`}
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
  return {repo, catalog, sendCatalog}
}

describe('CatalogPasswordsRepository (nested groups)', () => {
  let ctx: ReturnType<typeof createRepo>

  beforeEach(() => {
    ctx = createRepo()
  })

  it('creates entry in nested group path', async () => {
    const ok = await ctx.repo.saveEntryMeta({
      id: 'test-1',
      title: 'GitHub',
      urls: [],
      username: 'user',
      otps: [],
      groupPath: 'Work/Development',
    })

    expect(ok).toBe(true)

    // Verify group:ensure was called with the full group path
    const ensureCalls = ctx.sendCatalog.mock.calls.filter(
      ([cmd]: [string]) => cmd === 'passmanager:group:ensure',
    )
    expect(
      ensureCalls.some(([, d]: [string, Record<string, unknown>]) => d.path === 'Work/Development'),
    ).toBe(true)

    // Verify entry:save was called
    const saveCalls = ctx.sendCatalog.mock.calls.filter(([cmd]: [string]) => cmd === 'passmanager:entry:save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    expect(saveCalls[0]![1]).toMatchObject({
      entry_id: 'test-1',
      title: 'GitHub',
      username: 'user',
    })
  })

  it('does not emit intermediate queueRefresh while creating entry directories', async () => {
    const ok = await ctx.repo.saveEntryMeta({
      id: 'test-qr-1',
      title: 'GitHub',
      urls: [],
      username: 'user',
      otps: [],
      groupPath: 'Work/Development',
    })

    expect(ok).toBe(true)
    expect(ctx.catalog.queueRefresh).not.toHaveBeenCalled()
    expect(ctx.catalog.refresh).toHaveBeenCalled()
  })

  it('saveEntryPassword returns false when secret:save fails for unknown entry', async () => {
    // Mock secret:save to fail (entry not found on backend)
    ctx.sendCatalog.mockImplementation(async (cmd: string) => {
      if (cmd === 'passmanager:secret:save') {
        return {ok: false, error: 'entry_not_found'}
      }
      return {ok: true, result: undefined}
    })

    const ok = await ctx.repo.saveEntryPassword('entry-55', 'pass')

    expect(ok).toBe(false)
    // No group:ensure or entry:save should be called for password save
    const ensureCalls = ctx.sendCatalog.mock.calls.filter(
      ([cmd]: [string]) => cmd === 'passmanager:group:ensure',
    )
    expect(ensureCalls).toHaveLength(0)
  })

  it('saveEntryPassword succeeds via domain secret:save command', async () => {
    const ok = await ctx.repo.saveEntryPassword('entry-55', 'pass')

    expect(ok).toBe(true)

    const secretCalls = ctx.sendCatalog.mock.calls.filter(
      ([cmd]: [string]) => cmd === 'passmanager:secret:save',
    )
    expect(secretCalls).toHaveLength(1)
    expect(secretCalls[0]![1]).toMatchObject({
      entry_id: 'entry-55',
      secret_type: 'password',
      value: 'pass',
    })
  })

  it('moves entry from nested group to root', async () => {
    const ok = await ctx.repo.moveEntryToGroup('test-2', undefined)

    expect(ok).toBe(true)
    const moveCalls = ctx.sendCatalog.mock.calls.filter(([cmd]: [string]) => cmd === 'passmanager:entry:move')
    expect(moveCalls).toHaveLength(1)
    expect(moveCalls[0]![1]).toMatchObject({
      entry_id: 'test-2',
      target_group_path: '',
    })
  })

  it('moves entry between nested groups', async () => {
    const ok = await ctx.repo.moveEntryToGroup('test-3', 'X/Y/Z')

    expect(ok).toBe(true)

    // Verify group:ensure was called
    const ensureCalls = ctx.sendCatalog.mock.calls.filter(
      ([cmd]: [string]) => cmd === 'passmanager:group:ensure',
    )
    expect(ensureCalls.some(([, d]: [string, Record<string, unknown>]) => d.path === 'X/Y/Z')).toBe(true)

    // Verify entry:move was called
    const moveCalls = ctx.sendCatalog.mock.calls.filter(([cmd]: [string]) => cmd === 'passmanager:entry:move')
    expect(moveCalls).toHaveLength(1)
    expect(moveCalls[0]![1]).toMatchObject({
      entry_id: 'test-3',
      target_group_path: 'X/Y/Z',
    })
  })
})
