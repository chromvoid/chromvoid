import {state} from '@statx/core'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {UploadTask} from '../../src/types/upload-task'
import {DashboardHeaderModel} from '../../src/features/file-manager/components/dashboard-header.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

describe('DashboardHeaderModel', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    resetRuntimeCapabilities()
    vi.unstubAllGlobals()
    clearAppContext()
  })

  it('tracks hasUploadTasks from global store upload tasks', () => {
    const layoutMode = state<'mobile' | 'desktop'>('mobile')
    const selectionMode = state(false)
    const wsStatus = state<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
    const catalogStatus = state<'idle' | 'syncing' | 'loading' | 'error'>('idle')
    const uploadTasks = state<UploadTask[]>([])

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          selectionMode,
          wsStatus,
          catalogStatus,
          uploadTasks,
        } as any,
      }),
    )

    const model = new DashboardHeaderModel()
    expect(model.hasUploadTasks()).toBe(false)

    uploadTasks.set([new UploadTask({id: 't1', name: 'sample.txt', total: 128})])
    expect(model.hasUploadTasks()).toBe(true)

    uploadTasks.set([])
    expect(model.hasUploadTasks()).toBe(false)
  })

  it('keeps mobile and selection computed values reactive in new UI mode', () => {
    const layoutMode = state<'mobile' | 'desktop'>('desktop')
    const selectionMode = state(false)
    const wsStatus = state<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
    const catalogStatus = state<'idle' | 'syncing' | 'loading' | 'error'>('idle')
    const uploadTasks = state<UploadTask[]>([])

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          selectionMode,
          wsStatus,
          catalogStatus,
          uploadTasks,
        } as any,
      }),
    )

    const model = new DashboardHeaderModel()

    expect(model.isMobile()).toBe(false)
    layoutMode.set('mobile')
    expect(model.isMobile()).toBe(true)

    expect(model.selectionModeEnabled()).toBe(false)
    selectionMode.set(true)
    expect(model.selectionModeEnabled()).toBe(true)
  })

  it('disables native path upload while a remote session is active', () => {
    const layoutMode = state<'mobile' | 'desktop'>('desktop')
    const selectionMode = state(false)
    const wsStatus = state<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
    const catalogStatus = state<'idle' | 'syncing' | 'loading' | 'error'>('idle')
    const uploadTasks = state<UploadTask[]>([])
    const remoteSessionState = state<'inactive' | 'waiting_host_unlock' | 'ready'>('ready')

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          selectionMode,
          wsStatus,
          catalogStatus,
          uploadTasks,
          remoteSessionState,
        } as any,
      }),
    )

    setRuntimeCapabilities({
      desktop: true,
      supports_native_path_io: true,
    })

    const model = new DashboardHeaderModel()

    expect(model.canUseNativePathUpload()).toBe(false)

    remoteSessionState.set('inactive')
    expect(model.canUseNativePathUpload()).toBe(true)
  })
})
