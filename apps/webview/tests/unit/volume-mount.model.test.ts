import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {VolumeMountModel, type VolumeStatus} from '../../src/routes/volume/volume-mount.model'
import {setRuntimeCapabilities, resetRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()
const openExternalBrowserUrl = vi.fn(() => Promise.resolve())

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

vi.mock('root/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

describe('VolumeMountModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    openExternalBrowserUrl.mockClear()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_volume: true})
  })

  afterEach(() => {
    resetRuntimeCapabilities()
  })

  it('does not call tauriInvoke on construction', () => {
    new VolumeMountModel()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('mount() calls volume_mount and stores returned status', async () => {
    const model = new VolumeMountModel()
    const status: VolumeStatus = {
      state: 'mounted',
      backend: 'webdav',
      mountpoint: '/Volumes/ChromVoid',
      webdav_port: 12345,
      error: null,
    }

    tauriInvoke.mockResolvedValue({ok: true, result: status})
    await model.mount()

    expect(tauriInvoke).toHaveBeenCalledWith('volume_mount', {backend: null})
    expect(model.status()).toEqual(status)
  })

  it('uses WebDAV and exposes optional macFUSE install info when macFUSE is missing', async () => {
    const model = new VolumeMountModel()

    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {id: 'fuse', available: false, label: 'FUSE', install_url: 'https://example.com/fuse'},
        {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
      ],
    })

    await model.refreshBackends()

    expect(tauriInvoke).toHaveBeenCalledWith('volume_get_backends')
    expect(model.selectedBackend()).toBe('webdav')
    expect(model.backendDiscoveryState()).toBe('ready')
    expect(model.missingMacFuse()).toEqual({
      id: 'fuse',
      available: false,
      label: 'FUSE',
      install_url: 'https://example.com/fuse',
    })
  })

  it('prefers installed macFUSE by default', async () => {
    const model = new VolumeMountModel()

    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {id: 'fuse', available: true, label: 'FUSE', install_url: null},
        {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
      ],
    })

    await model.refreshBackends()

    expect(model.selectedBackend()).toBe('fuse')
    expect(model.missingMacFuse()).toBeNull()
  })

  it('keeps the preferred backend automatic so mount can fall back to WebDAV', async () => {
    const model = new VolumeMountModel()
    const status: VolumeStatus = {
      state: 'mounted',
      backend: 'webdav',
      mountpoint: 'http://127.0.0.1:12345',
      webdav_port: 12345,
      error: null,
    }

    tauriInvoke
      .mockResolvedValueOnce({
        ok: true,
        result: [
          {id: 'fuse', available: true, label: 'FUSE', install_url: null},
          {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
        ],
      })
      .mockResolvedValueOnce({ok: true, result: status})

    await model.refreshBackends()
    expect(model.selectedBackend()).toBe('fuse')

    await model.mount()

    expect(tauriInvoke).toHaveBeenLastCalledWith('volume_mount', {backend: null})
    expect(model.status()).toEqual(status)
  })

  it('keeps an explicit WebDAV selection after backend refresh', async () => {
    const model = new VolumeMountModel()
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {id: 'fuse', available: true, label: 'FUSE', install_url: null},
        {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
      ],
    })

    await model.refreshBackends()
    model.selectBackend('webdav')
    await model.refreshBackends()

    expect(model.selectedBackend()).toBe('webdav')
  })

  it('falls back to WebDAV when the selected macFUSE backend becomes unavailable', async () => {
    const model = new VolumeMountModel()
    model.backends.set([
      {id: 'fuse', available: true, label: 'FUSE', install_url: null},
      {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
    ])
    model.selectBackend('fuse')
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {id: 'fuse', available: false, label: 'FUSE', install_url: 'https://example.com/fuse'},
        {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
      ],
    })

    await model.refreshBackends()

    expect(model.selectedBackend()).toBe('webdav')
  })

  it('uses a silent WebDAV fallback when backend discovery fails', async () => {
    const model = new VolumeMountModel()
    tauriInvoke.mockRejectedValue(new Error('backend discovery failed'))

    await model.refreshBackends()

    expect(model.selectedBackend()).toBe('webdav')
    expect(model.backendDiscoveryState()).toBe('error')
    expect(model.missingMacFuse()).toBeNull()
  })

  it('opens the official install URL from discovered backend metadata', async () => {
    const model = new VolumeMountModel()
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: [
        {
          id: 'fuse',
          available: false,
          label: 'FUSE',
          install_url: 'https://macfuse.github.io/',
        },
        {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
      ],
    })
    await model.refreshBackends()
    const preventDefault = vi.fn()

    model.openMacFuseInstallPage({preventDefault} as unknown as Event)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(openExternalBrowserUrl).toHaveBeenCalledWith('https://macfuse.github.io/')
  })

  it('mount passes explicit selected backend to tauri', async () => {
    const model = new VolumeMountModel()
    const status: VolumeStatus = {
      state: 'mounted',
      backend: 'fuse',
      mountpoint: '/Volumes/ChromVoid',
      webdav_port: null,
      error: null,
    }

    model.backends.set([
      {id: 'fuse', available: true, label: 'FUSE', install_url: null},
      {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
    ])
    model.selectBackend('fuse')
    tauriInvoke.mockResolvedValue({ok: true, result: status})

    await model.mount()

    expect(tauriInvoke).toHaveBeenCalledWith('volume_mount', {backend: 'fuse'})
    expect(model.status()).toEqual(status)
  })

  it('mount() puts model into error state when invoke fails', async () => {
    const model = new VolumeMountModel()

    tauriInvoke.mockRejectedValue(new Error('command not found'))
    await model.mount()

    expect(model.status().state).toBe('error')
    expect(model.status().error).toContain('command not found')
  })

  it('mount() sets error when supports_volume is false', async () => {
    setRuntimeCapabilities({supports_volume: false})
    const model = new VolumeMountModel()

    await model.mount()

    expect(model.status().state).toBe('error')
    expect(model.status().error).toContain('not available')
    expect(tauriInvoke).not.toHaveBeenCalled()
  })
})
