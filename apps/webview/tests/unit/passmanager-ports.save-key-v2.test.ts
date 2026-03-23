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

function createRepo(opts?: {
  sendCatalogOverride?: (cmd: string, data: Record<string, unknown>) => Promise<unknown>
  repoOptions?: {integrityReconcileMode?: 'report' | 'safe_fix'}
}) {
  const sendCatalog = vi.fn().mockImplementation(
    opts?.sendCatalogOverride ??
      (async (cmd: string, data: Record<string, unknown>) => {
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
          case 'passmanager:group:setMeta':
            return {ok: true, result: undefined}
          case 'passmanager:root:export':
            return {ok: true, result: {root: {version: 2, entries: [], folders: []}}}
          default:
            return {ok: false, error: `unknown command: ${cmd}`}
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
  const repo = opts?.repoOptions
    ? new CatalogPasswordsRepository(catalog as any, catalogTransport, opts.repoOptions as unknown)
    : new CatalogPasswordsRepository(catalog as any, catalogTransport)
  return {repo, catalog, sendCatalog}
}

function assertOk(ok: boolean, ctx: {catalog: {lastError: {set: {mock: {calls: unknown[][]}}}}}) {
  if (ok) return
  const calls = ctx.catalog.lastError.set.mock.calls
  const last = Array.isArray(calls) && calls.length ? calls[calls.length - 1]?.[0] : undefined
  throw new Error(`saveRoot returned false. lastError=${String(last)}`)
}

describe('CatalogPasswordsRepository SAVE_KEY v2', () => {
  const iconRef = `sha256:${'a'.repeat(64)}`

  let ctx: ReturnType<typeof createRepo>

  beforeEach(() => {
    ctx = createRepo()
  })

  it('rejects payload without version: 2', async () => {
    await expect(ctx.repo.saveRoot(fileFromJson({entries: [], folders: []}))).resolves.toBe(false)
  })

  it('writes nested entry by folderPath', async () => {
    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['Work/Jira'],
      foldersMeta: [{path: 'Work/Jira', iconRef}],
      entries: [
        {
          id: '1',
          title: 'GitHub',
          username: 'u',
          urls: [],
          otps: [],
          folderPath: 'Work/Jira',
          iconRef,
        },
      ],
    }
    const ok = await ctx.repo.saveRoot(fileFromJson(data))
    assertOk(ok, ctx)

    const ensureCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:ensure')
    expect(ensureCalls.some((call) => (call[1] as Record<string, unknown>)['path'] === 'Work/Jira')).toBe(
      true,
    )

    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    expect(saveCalls.some((call) => (call[1] as Record<string, unknown>)['entry_id'] === '1')).toBe(true)

    const metaCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:setMeta')
    expect(metaCalls.some((call) => (call[1] as Record<string, unknown>)['path'] === 'Work/Jira')).toBe(true)
  })

  it('writes single-segment folderPath', async () => {
    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['Personal'],
      entries: [
        {
          id: '1',
          title: 'E',
          username: '',
          urls: [],
          otps: [],
          folderPath: 'Personal',
        },
      ],
    }
    const ok = await ctx.repo.saveRoot(fileFromJson(data))
    assertOk(ok, ctx)

    const ensureCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:ensure')
    expect(ensureCalls.some((call) => (call[1] as Record<string, unknown>)['path'] === 'Personal')).toBe(true)

    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('returns false when domain entry:list command fails', async () => {
    ctx = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:entry:list') {
          return {ok: false, error: 'list failed'}
        }
        if (cmd === 'passmanager:group:ensure') {
          return {ok: true, result: undefined}
        }
        return {ok: false, error: 'unknown'}
      },
    })

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [],
    }
    await expect(ctx.repo.saveRoot(fileFromJson(data))).resolves.toBe(false)
  })

  it('succeeds with valid v2 payload via domain commands', async () => {
    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [],
    }
    await expect(ctx.repo.saveRoot(fileFromJson(data))).resolves.toBe(true)
  })

  it('saveEntryMeta succeeds via domain entry:save command', async () => {
    const ok = await ctx.repo.saveEntryMeta({
      id: 'entry-1',
      title: 'Test entry',
      urls: [],
      username: '',
      otps: [],
      groupPath: 'Common',
      iconRef,
    })

    expect(ok).toBe(true)

    const ensureCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:ensure')
    expect(ensureCalls.length).toBeGreaterThanOrEqual(1)

    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    const lastSavePayload = saveCalls[saveCalls.length - 1]?.[1] as Record<string, unknown>
    expect(lastSavePayload['icon_ref']).toBe(iconRef)
  })

  it('saveEntryPassword keeps explicit empty value via secret:save', async () => {
    const ok = await ctx.repo.saveEntryPassword('entry-55', '')

    expect(ok).toBe(true)
    const secretSaveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:secret:save')
    const secretDeleteCalls = ctx.sendCatalog.mock.calls.filter(
      (call) => call[0] === 'passmanager:secret:delete',
    )
    expect(secretSaveCalls).toHaveLength(1)
    expect(secretDeleteCalls).toHaveLength(0)
    expect(secretSaveCalls[0]?.[1]).toMatchObject({
      entry_id: 'entry-55',
      secret_type: 'password',
      value: '',
    })
  })

  it('saveEntryPassword with null uses secret:delete', async () => {
    const ok = await ctx.repo.saveEntryPassword('entry-55', null)

    expect(ok).toBe(true)
    const secretSaveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:secret:save')
    const secretDeleteCalls = ctx.sendCatalog.mock.calls.filter(
      (call) => call[0] === 'passmanager:secret:delete',
    )
    expect(secretSaveCalls).toHaveLength(0)
    expect(secretDeleteCalls).toHaveLength(1)
    expect(secretDeleteCalls[0]?.[1]).toMatchObject({
      entry_id: 'entry-55',
      secret_type: 'password',
    })
  })

  it('saveEntryNote keeps explicit empty value via secret:save', async () => {
    const ok = await ctx.repo.saveEntryNote('entry-55', '')

    expect(ok).toBe(true)
    const secretSaveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:secret:save')
    const secretDeleteCalls = ctx.sendCatalog.mock.calls.filter(
      (call) => call[0] === 'passmanager:secret:delete',
    )
    expect(secretSaveCalls).toHaveLength(1)
    expect(secretDeleteCalls).toHaveLength(0)
    expect(secretSaveCalls[0]?.[1]).toMatchObject({
      entry_id: 'entry-55',
      secret_type: 'note',
      value: '',
    })
  })

  it('saveEntryNote with null uses secret:delete', async () => {
    const ok = await ctx.repo.saveEntryNote('entry-55', null)

    expect(ok).toBe(true)
    const secretSaveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:secret:save')
    const secretDeleteCalls = ctx.sendCatalog.mock.calls.filter(
      (call) => call[0] === 'passmanager:secret:delete',
    )
    expect(secretSaveCalls).toHaveLength(0)
    expect(secretDeleteCalls).toHaveLength(1)
    expect(secretDeleteCalls[0]?.[1]).toMatchObject({
      entry_id: 'entry-55',
      secret_type: 'note',
    })
  })

  it('readRoot preserves iconRef and foldersMeta from domain export', async () => {
    ctx = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              root: {
                version: 2,
                createdTs: 1,
                updatedTs: 2,
                folders: ['Work/Jira'],
                foldersMeta: [{path: 'Work/Jira', iconRef}],
                entries: [
                  {
                    id: 'entry-1',
                    title: 'GitHub',
                    username: 'u',
                    urls: [],
                    otps: [],
                    folderPath: 'Work/Jira',
                    iconRef,
                  },
                ],
              },
            },
          }
        }
        return {ok: true, result: undefined}
      },
    })

    const result = await ctx.repo.readRoot<PassManagerRootV2>()
    expect(result?.foldersMeta).toEqual([{path: 'Work/Jira', iconRef}])
    expect(result?.entries[0]?.iconRef).toBe(iconRef)
  })

  it('readRoot reports integrity mismatch for missing iconRef payloads', async () => {
    ctx = createRepo({
      sendCatalogOverride: async (cmd: string) => {
        if (cmd === 'passmanager:root:export') {
          return {
            ok: true,
            result: {
              root: {
                version: 2,
                createdTs: 1,
                updatedTs: 2,
                folders: ['Work/Jira'],
                foldersMeta: [{path: 'Work/Jira', iconRef}],
                entries: [
                  {
                    id: 'entry-1',
                    title: 'GitHub',
                    username: 'u',
                    urls: [],
                    otps: [],
                    folderPath: 'Work/Jira',
                    iconRef,
                  },
                ],
              },
            },
          }
        }
        if (cmd === 'passmanager:icon:list') {
          return {ok: true, result: {icons: []}}
        }
        return {ok: true, result: undefined}
      },
    })

    const result = await ctx.repo.readRoot<
      PassManagerRootV2 & {
        integrity?: {
          mismatches: Array<{kind: string}>
          reconcileMode: 'report' | 'safe_fix'
          reconcileActions: Array<{kind: string; status: string; reason?: string}>
        }
      }
    >()
    expect(result?.integrity?.mismatches.some((item) => item.kind === 'entry_icon_missing')).toBe(true)
    expect(result?.integrity?.reconcileMode).toBe('report')
    expect(
      result?.integrity?.reconcileActions.some(
        (item) =>
          item.kind === 'entry_icon_ref_clear' && item.status === 'skipped' && item.reason === 'report_only',
      ),
    ).toBe(true)
    const setMetaCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:setMeta')
    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    expect(setMetaCalls).toHaveLength(0)
    expect(saveCalls).toHaveLength(0)
    expect(ctx.catalog.lastError.set).toHaveBeenCalled()
    const calls = ctx.catalog.lastError.set.mock.calls
    const lastError = String(calls[calls.length - 1]?.[0] ?? '')
    expect(lastError).toContain('READ_ROOT_ERROR')
    expect(lastError).toContain('PassManager integrity mismatches detected')
  })

  it('saveRoot reports integrity mismatch for missing OTP secret link', async () => {
    ctx = createRepo({
      sendCatalogOverride: async (cmd: string, data: Record<string, unknown>) => {
        switch (cmd) {
          case 'passmanager:entry:save':
            return {ok: true, result: {entry_id: data['entry_id'] ?? crypto.randomUUID()}}
          case 'passmanager:entry:list':
            return {ok: true, result: {entries: [], folders: []}}
          case 'passmanager:group:ensure':
          case 'passmanager:group:setMeta':
            return {ok: true, result: undefined}
          case 'passmanager:icon:list':
            return {ok: true, result: {icons: []}}
          case 'passmanager:otp:generate':
            return {ok: false, error: 'OTP_SECRET_NOT_FOUND'}
          default:
            return {ok: true, result: undefined}
        }
      },
    })

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [
        {
          id: 'otp-entry-1',
          title: 'OTP entry',
          username: '',
          urls: [],
          folderPath: null,
          otps: [{id: 'otp-1', label: 'Main', algorithm: 'SHA1', digits: 6, period: 30, type: 'TOTP'}],
        },
      ],
    }

    await expect(ctx.repo.saveRoot(fileFromJson(data))).resolves.toBe(true)
    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    const clearGroupMetaCalls = ctx.sendCatalog.mock.calls.filter(
      (call) =>
        call[0] === 'passmanager:group:setMeta' && (call[1] as {icon_ref?: unknown})['icon_ref'] === null,
    )
    expect(saveCalls).toHaveLength(2)
    expect(clearGroupMetaCalls).toHaveLength(0)
    expect(ctx.catalog.lastError.set).toHaveBeenCalled()
    const calls = ctx.catalog.lastError.set.mock.calls
    const lastError = String(calls[calls.length - 1]?.[0] ?? '')
    expect(lastError).toContain('READ_ROOT_ERROR')
    expect(lastError).toContain('PassManager integrity mismatches detected')
  })

  it('saveRoot safe_fix mode clears stale folder icon refs and removes stale otp links', async () => {
    ctx = createRepo({
      repoOptions: {integrityReconcileMode: 'safe_fix'},
      sendCatalogOverride: async (cmd: string, data: Record<string, unknown>) => {
        switch (cmd) {
          case 'passmanager:entry:save':
            return {ok: true, result: {entry_id: data['entry_id'] ?? data['id'] ?? crypto.randomUUID()}}
          case 'passmanager:entry:list':
            return {ok: true, result: {entries: [], folders: []}}
          case 'passmanager:group:ensure':
          case 'passmanager:group:setMeta':
            return {ok: true, result: undefined}
          case 'passmanager:icon:list':
            return {ok: true, result: {icons: []}}
          case 'passmanager:otp:generate':
            return {ok: false, error: 'OTP_SECRET_NOT_FOUND'}
          default:
            return {ok: true, result: undefined}
        }
      },
    })

    const data: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: ['Work/Jira'],
      foldersMeta: [{path: 'Work/Jira', iconRef}],
      entries: [
        {
          id: 'otp-entry-1',
          title: 'OTP entry',
          username: '',
          urls: [],
          folderPath: 'Work/Jira',
          iconRef,
          otps: [{id: 'otp-1', label: 'Main', algorithm: 'SHA1', digits: 6, period: 30, type: 'TOTP'}],
        },
      ],
    }

    await expect(ctx.repo.saveRoot(fileFromJson(data))).resolves.toBe(true)

    const saveCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:entry:save')
    const clearFolderIconCalls = ctx.sendCatalog.mock.calls.filter(
      (call) =>
        call[0] === 'passmanager:group:setMeta' &&
        (call[1] as {path?: unknown; icon_ref?: unknown})['path'] === 'Work/Jira' &&
        (call[1] as {icon_ref?: unknown})['icon_ref'] === null,
    )
    expect(saveCalls.length).toBeGreaterThanOrEqual(2)
    expect(
      saveCalls.some(
        (call) =>
          (call[1] as {id?: unknown})['id'] === 'otp-entry-1' &&
          Array.isArray((call[1] as {otps?: unknown})['otps']) &&
          ((call[1] as {otps?: unknown[]})['otps'] ?? []).length === 0,
      ),
    ).toBe(true)
    expect(clearFolderIconCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('concurrent saveEntryMeta calls both succeed', async () => {
    const payload = {
      id: 'entry-2',
      title: 'Serialized entry',
      urls: [],
      username: '',
      otps: [],
      groupPath: 'Common',
    }

    const [ok1, ok2] = await Promise.all([ctx.repo.saveEntryMeta(payload), ctx.repo.saveEntryMeta(payload)])

    expect(ok1).toBe(true)
    expect(ok2).toBe(true)
  })

  it('concurrent saveEntryMeta with same groupPath calls ensureGroup', async () => {
    const payload = {
      id: 'entry-3',
      title: 'Dedup entry',
      urls: [],
      username: '',
      otps: [],
      groupPath: 'Common',
    }

    const [ok1, ok2] = await Promise.all([ctx.repo.saveEntryMeta(payload), ctx.repo.saveEntryMeta(payload)])

    expect(ok1).toBe(true)
    expect(ok2).toBe(true)

    const ensureCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:group:ensure')
    expect(ensureCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('readRoot calls domain root:export and returns normalized result', async () => {
    const result = await ctx.repo.readRoot<{version: number; entries: unknown[]; folders: string[]}>()

    expect(result).toBeDefined()
    expect(result?.version).toBe(2)
    expect(result?.entries).toEqual([])

    const exportCalls = ctx.sendCatalog.mock.calls.filter((call) => call[0] === 'passmanager:root:export')
    expect(exportCalls).toHaveLength(1)
  })
})
