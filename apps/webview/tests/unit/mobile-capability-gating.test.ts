import {beforeEach, describe, expect, it, vi} from 'vitest'

import {VolumeMountModel} from '../../src/routes/volume/volume-mount.model'
import {pairUsbDevice, scanUsbDevices} from '../../src/routes/remote/remote.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

describe('Mobile Capability Gating', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
  })

  it('does not call usb IPC when usb remote capability is disabled', async () => {
    setRuntimeCapabilities({
      mobile: true,
      supports_usb_remote: false,
    })

    const devices = await scanUsbDevices()
    expect(devices).toEqual([])
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('rejects pairing when usb remote capability is disabled', async () => {
    setRuntimeCapabilities({
      mobile: true,
      supports_usb_remote: false,
    })

    await expect(
      pairUsbDevice({
        port_path: '/dev/null',
        serial_number: 'test-serial',
        label: 'test',
      }),
    ).rejects.toThrow('USB remote is not available on this platform')
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('prevents volume IPC calls on mobile runtime without volume capability', async () => {
    setRuntimeCapabilities({
      mobile: true,
      supports_volume: false,
    })

    const model = new VolumeMountModel()
    await model.mount()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(model.status().state).toBe('error')
    expect(model.status().error).toContain('Volume is not available on this platform')
  })
})

