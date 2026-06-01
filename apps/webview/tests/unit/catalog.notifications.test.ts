import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {CatalogService} from '../../src/core/catalog/catalog'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {TransportLike} from '../../src/core/transport/transport'

function createManifest() {
  return {
    ok: true,
    result: {
      root_version: 1,
      format: 'manifest',
      manifest_budget_bytes: 128 * 1024,
      shards: [
        {
          shard_id: 'docs',
          version: 1,
          size: 0,
          node_count: 1,
          strategy: 'lazy',
          has_deltas: false,
          loaded: false,
        },
      ],
      root_summaries: [
        {
          i: 10,
          t: 0,
          n: 'docs',
          s: 0,
          z: 0,
          b: 0,
          m: 0,
          h: true,
        },
      ],
      eager_data: {},
    },
  }
}

function createTransport(
  sendCatalog: (command: string, data: Record<string, unknown>) => Promise<unknown>,
  kind: TransportLike['kind'] = 'ws',
): TransportLike {
  return {
    kind,
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    connect() {},
    disconnect() {},
    on() {},
    off() {},
    sendCatalog,
    sendPassmanager: async () => undefined,
    uploadFile: async () => undefined,
    downloadFile: async function* () {},
    readSecret: async function* () {},
    writeSecret: async () => undefined,
    eraseSecret: async () => undefined,
    generateOTP: async () => '',
    setOTPSecret: async () => undefined,
    removeOTPSecret: async () => undefined,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('CatalogService notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('publishes a translated success message after refresh()', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') return createManifest()
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog)
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    await service.refresh()

    expect(pushNotification).toHaveBeenCalledWith('success', 'Catalog updated')
  })

  it('publishes a translated failure message after refresh() errors', async () => {
    const sendCatalog = vi.fn(async () => {
      throw new Error('Refresh failed')
    })
    const ws = createTransport(sendCatalog)
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    await expect(service.refresh()).rejects.toThrow('Refresh failed')
    expect(pushNotification).toHaveBeenCalledWith('error', 'Failed to update catalog')
  })

  it('does not publish a success message after background startSync()', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') return createManifest()
      if (command === 'catalog:subscribe') return {}
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog)
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    await service.startSync()

    expect(pushNotification).not.toHaveBeenCalled()
  })

  it('does not subscribe or publish success after stopSync cancels in-flight startSync()', async () => {
    const manifest = deferred<unknown>()
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') return manifest.promise
      if (command === 'catalog:subscribe') return {}
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog)
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    const syncPromise = service.startSync()
    await Promise.resolve()

    await service.stopSync()
    manifest.resolve(createManifest())
    await syncPromise

    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:subscribe', expect.anything())
    expect(pushNotification).not.toHaveBeenCalledWith('success', 'Catalog synchronized successfully')
    expect(service.syncing()).toBe(false)
  })

  it('stops manifest tauri sync after cancellation during an in-flight manifest load', async () => {
    const manifest = deferred<unknown>()
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') return manifest.promise
      if (command === 'catalog:subscribe') return {}
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog, 'tauri')
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    const syncPromise = service.startSync()
    await vi.waitFor(() => {
      expect(sendCatalog).toHaveBeenCalledWith('catalog:sync:manifest', {})
    })

    service.cancelSync('vault-lock')
    manifest.resolve(createManifest())
    await syncPromise

    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:subscribe', expect.anything())
    expect(pushNotification).not.toHaveBeenCalledWith('success', 'Catalog synchronized successfully')
    expect(service.syncing()).toBe(false)
  })

  it('uses manifest-first tauri startup without loading every shard', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') return createManifest()
      if (command === 'catalog:subscribe') return {}
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog, 'tauri')
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    await service.startSync()

    expect(sendCatalog).toHaveBeenCalledWith('catalog:sync:manifest', {})
    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:shard:list', expect.anything())
    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:shard:load', expect.anything())
    expect(service.catalog.getChildren('/')[0]?.name).toBe('docs')
    expect(service.catalog.getChildren('/docs')).toEqual([])
  })

  it('does not fall back to sharded tauri startup when manifest sync fails', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') throw new Error('manifest unavailable')
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog, 'tauri')
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()
    Reflect.set(service, 'retryOptions', {
      attempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitterMs: 0,
    })

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    await expect(service.startSync()).rejects.toThrow('manifest unavailable')

    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:shard:list', expect.anything())
    expect(sendCatalog).not.toHaveBeenCalledWith('catalog:shard:load', expect.anything())
    expect(pushNotification).toHaveBeenCalledWith('error', 'Failed to synchronize catalog')
  })

  it('publishes translated retry and terminal failure messages when startSync() exhausts retries', async () => {
    const sendCatalog = vi.fn(async (command: string) => {
      if (command === 'catalog:sync:manifest') {
        throw new Error('Sync failed')
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const ws = createTransport(sendCatalog)
    const service = new CatalogService(ws)
    const pushNotification = vi.fn()

    Reflect.set(service, 'retryOptions', {
      attempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitterMs: 0,
    })

    initAppContext(
      createMockAppContext({
        store: {pushNotification} as never,
        ws,
        catalog: service,
      }),
    )

    const syncPromise = service.startSync()
    const syncRejection = expect(syncPromise).rejects.toThrow('Sync failed')
    await vi.advanceTimersByTimeAsync(100)

    await syncRejection
    expect(pushNotification).toHaveBeenNthCalledWith(
      1,
      'warning',
      'Catalog sync failed. Retrying in 0.1s (attempt 2/2)',
    )
    expect(pushNotification).toHaveBeenNthCalledWith(2, 'error', 'Failed to synchronize catalog')
  })
})
