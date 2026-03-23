import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {VolumeMountModel, type VolumeStatus} from '../../src/routes/volume/volume-mount.model'
import {setRuntimeCapabilities, resetRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

describe('VolumeMountModel', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    setRuntimeCapabilities({supports_volume: true})
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

  it('refreshBackends auto-selects first available backend', async () => {
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

    model.selectedBackend.set('fuse')
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
