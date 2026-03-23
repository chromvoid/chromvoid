import {state} from '@statx/core'

import {describe, expect, it} from 'vitest'

import {ChromVoidState} from '../../src/core/state/app-state'
import {Store} from '../../src/app/state/store'
import {UploadTask} from '../../src/types/upload-task'

describe('Store status and upload selectors', () => {
  const createWsStub = () => {
    return {
      ws: {},
      connected: state(false),
      connecting: state(false),
      authenticated: state(false),
      authenticating: state(false),
      lastError: state<string | undefined>(undefined),
    } as any
  }

  const createCatalogStub = () => {
    return {
      syncing: false,
      lastError: null as string | null,
      api: {},
      refresh: async () => {},
    } as any
  }

  it('returns unknown when WS is not connected', () => {
    const ws = createWsStub()
    const appState = new ChromVoidState()
    const catalog = createCatalogStub()
    const store = new Store(ws, appState, catalog)

    expect(store.wsStatus()).toBe('disconnected')
    expect(store.status()).toBe('unknown')
  })

  it('returns locked when WS connected and no special flags', () => {
    const ws = createWsStub()
    ws.connected.set(true)
    const appState = new ChromVoidState()
    const catalog = createCatalogStub()
    const store = new Store(ws, appState, catalog)

    expect(store.wsStatus()).toBe('connected')
    expect(store.status()).toBe('locked')
  })

  it('returns unlocking when unlockUnNextPowerOn flag is set', () => {
    const ws = createWsStub()
    ws.connected.set(true)
    const appState = new ChromVoidState()
    const catalog = createCatalogStub()
    const store = new Store(ws, appState, catalog)

    store.unlockUnNextPowerOn.set(true)
    expect(store.status()).toBe('unlocking')
  })

  it('upload stats and selectors reflect tasks correctly', () => {
    const ws = createWsStub()
    ws.connected.set(true)
    const appState = new ChromVoidState()
    const catalog = createCatalogStub()
    const store = new Store(ws, appState, catalog)

    expect(store.hasActiveUploads()).toBe(false)
    expect(store.overallUploadProgress()).toBe(0)

    const task1 = new UploadTask({id: '1', name: 'a.bin', total: 100})
    task1.setProgress(50)
    store.addUploadTask(task1)

    const task2 = new UploadTask({id: '2', name: 'b.bin', total: 200})
    task2.setProgress(200)
    task2.markDone()
    store.addUploadTask(task2)

    const stats = store.getUploadStats()
    expect(stats.total).toBe(2)
    expect(stats.completed).toBe(1)
    expect(stats.uploading).toBe(1)
    expect(store.hasActiveUploads()).toBe(true)
    // (50 + 200) / (100 + 200) * 100 = 83.33...
    expect(Math.round(store.overallUploadProgress())).toBe(83)
  })
})
