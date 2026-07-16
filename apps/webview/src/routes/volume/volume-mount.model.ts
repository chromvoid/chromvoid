import {atom, computed, wrap} from '@reatom/core'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getRuntimeCapabilities, runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {openExternalBrowserUrl} from 'root/shared/services/external-browser'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export type VolumeBackend = 'webdav' | 'fuse'

export type VolumeState = 'unmounted' | 'mounting' | 'mounted' | 'unmounting' | 'error' | 'driver_missing'

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

type BackendDiscoveryState = 'idle' | 'loading' | 'ready' | 'error'

export class VolumeMountModel {
  readonly status = atom<VolumeStatus>({
    state: 'unmounted',
    backend: null,
    mountpoint: null,
    webdav_port: null,
    error: null,
  })

  readonly backends = atom<BackendInfo[]>([])
  readonly selectedBackend = atom<VolumeBackend | null>(null)
  readonly backendDiscoveryState = atom<BackendDiscoveryState>('idle', 'volume.backendDiscoveryState')
  readonly missingMacFuse = computed<BackendInfo | null>(() => {
    if (runtimeCapabilitiesAtom().platform !== 'macos' || this.backendDiscoveryState() !== 'ready') {
      return null
    }

    const fuse = this.backends().find((backend) => backend.id === 'fuse')
    return fuse && !fuse.available && fuse.install_url ? fuse : null
  }, 'volume.missingMacFuse')

  private backendSelectionIsAutomatic = true

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
      const res = await wrap(tauriInvoke<RpcResult<VolumeStatus>>('volume_get_status'))
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
      this.backendDiscoveryState.set('idle')
      this.backendSelectionIsAutomatic = true
      return
    }
    this.backendDiscoveryState.set('loading')
    try {
      const res = await wrap(tauriInvoke<RpcResult<BackendInfo[]>>('volume_get_backends'))
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.backends.set(res.result)
      this.reconcileBackendSelection(res.result)
      this.backendDiscoveryState.set('ready')
    } catch {
      // Fallback: just webdav
      const fallback: BackendInfo[] = [{id: 'webdav', available: true, label: 'WebDAV', install_url: null}]
      this.backends.set(fallback)
      this.reconcileBackendSelection(fallback)
      this.backendDiscoveryState.set('error')
    }
  }

  selectBackend(backend: VolumeBackend): void {
    const info = this.backends().find((candidate) => candidate.id === backend)
    if (!info?.available) return

    this.backendSelectionIsAutomatic = false
    this.selectedBackend.set(backend)
  }

  openMacFuseInstallPage(event?: Event): void {
    event?.preventDefault()
    const installUrl = this.missingMacFuse()?.install_url
    if (!installUrl) return

    void openExternalBrowserUrl(installUrl).catch((error: unknown) => {
      console.warn('[VolumeMount] Failed to open macFUSE website', error)
      getAppContext().store.pushNotification('error', i18n('remote-storage:macfuse-open-failed'))
    })
  }

  async mount(): Promise<void> {
    if (!getRuntimeCapabilities().supports_volume) {
      this.status.set({
        ...this.status(),
        state: 'error',
        error: i18n('remote-storage:volume-unavailable-platform'),
      })
      return
    }
    this.status.set({...this.status(), state: 'mounting', error: null})
    try {
      const res = await wrap(
        tauriInvoke<RpcResult<VolumeStatus>>('volume_mount', {
          backend: this.backendSelectionIsAutomatic ? null : this.selectedBackend(),
        }),
      )
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
      const res = await wrap(tauriInvoke<RpcResult<VolumeStatus>>('volume_unmount'))
      if (!isOk(res)) {
        throw new Error(res.error)
      }
      this.status.set(res.result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.status.set({...this.status(), state: 'error', error: msg})
    }
  }

  private reconcileBackendSelection(backends: BackendInfo[]): void {
    const selected = this.selectedBackend()
    const selectedIsAvailable = backends.some((backend) => backend.id === selected && backend.available)

    if (!selectedIsAvailable) {
      this.backendSelectionIsAutomatic = true
    }

    if (this.backendSelectionIsAutomatic) {
      this.selectedBackend.set(backends.find((backend) => backend.available)?.id ?? null)
    }
  }
}
