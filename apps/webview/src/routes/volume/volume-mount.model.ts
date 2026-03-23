import {state} from '@statx/core'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export type VolumeBackend = 'webdav' | 'fuse'

export type VolumeState =
  | 'unmounted'
  | 'mounting'
  | 'mounted'
  | 'unmounting'
  | 'error'
  | 'driver_missing'

export type VolumeStatus = {
  state: VolumeState
  backend: VolumeBackend | null
  mountpoint: string | null
  webdav_port: number | null
  error: string | null
}

export type BackendInfo = {
  id: VolumeBackend
  available: boolean
  label: string
  install_url: string | null
}

export class VolumeMountModel {
  readonly status = state<VolumeStatus>({
    state: 'unmounted',
    backend: null,
    mountpoint: null,
    webdav_port: null,
    error: null,
  })

  readonly backends = state<BackendInfo[]>([])
  readonly selectedBackend = state<VolumeBackend | null>(null)

  async refreshStatus(): Promise<void> {
    if (!getRuntimeCapabilities().supports_volume) {
      this.status.set({
        state: 'unmounted',
        backend: null,
        mountpoint: null,
        webdav_port: null,
        error: null,
      })
      return
    }
    try {
      const res = await tauriInvoke<RpcResult<VolumeStatus>>('volume_get_status')
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.status.set(res.result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.status.set({...this.status(), state: 'error', error: msg})
    }
  }

  async refreshBackends(): Promise<void> {
    if (!getRuntimeCapabilities().supports_volume) {
      this.backends.set([])
      this.selectedBackend.set(null)
      return
    }
    try {
      const res = await tauriInvoke<RpcResult<BackendInfo[]>>('volume_get_backends')
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.backends.set(res.result)
      // Auto-select first available backend (FUSE if available, then WebDAV)
      if (this.selectedBackend() === null) {
        const first = res.result.find((b) => b.available)
        if (first) {
          this.selectedBackend.set(first.id)
        }
      }
    } catch {
      // Fallback: just webdav
      this.backends.set([{id: 'webdav', available: true, label: 'WebDAV', install_url: null}])
      if (this.selectedBackend() === null) {
        this.selectedBackend.set('webdav')
      }
    }
  }

  async mount(): Promise<void> {
    if (!getRuntimeCapabilities().supports_volume) {
      this.status.set({...this.status(), state: 'error', error: 'Volume is not available on this platform'})
      return
    }
    this.status.set({...this.status(), state: 'mounting', error: null})
    try {
      const res = await tauriInvoke<RpcResult<VolumeStatus>>('volume_mount', {
        backend: this.selectedBackend(),
      })
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.status.set(res.result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.status.set({...this.status(), state: 'error', error: msg})
    }
  }

  async unmount(): Promise<void> {
    if (!getRuntimeCapabilities().supports_volume) {
      this.status.set({...this.status(), state: 'unmounted', error: null})
      return
    }
    this.status.set({...this.status(), state: 'unmounting', error: null})
    try {
      const res = await tauriInvoke<RpcResult<VolumeStatus>>('volume_unmount')
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.status.set(res.result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.status.set({...this.status(), state: 'error', error: msg})
    }
  }
}
