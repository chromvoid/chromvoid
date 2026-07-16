import {render} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {RemoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'
import {renderVolumeMountSection} from '../../src/routes/remote-storage/sections/volume-mount-section'

describe('renderVolumeMountSection', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_volume: true})
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    resetRuntimeCapabilities()
    vi.unstubAllGlobals()
  })

  it('keeps WebDAV mountable and explains optional macFUSE when it is missing', () => {
    const model = new RemoteStorageModel()
    model.volume.backends.set([
      {
        id: 'fuse',
        available: false,
        label: 'FUSE (macFUSE)',
        install_url: 'https://macfuse.github.io/',
      },
      {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
    ])
    model.volume.selectedBackend.set('webdav')
    model.volume.backendDiscoveryState.set('ready')

    render(renderVolumeMountSection({model}), container)

    const installLink = container.querySelector<HTMLAnchorElement>('a[href="https://macfuse.github.io/"]')
    expect(installLink).not.toBeNull()
    expect(installLink?.textContent).toContain('macFUSE')
    expect(container.textContent).toContain('WebDAV')

    const mountButton = container.querySelector<HTMLElement>('cv-guidance-anchor cv-button')
    expect(mountButton?.hasAttribute('disabled')).toBe(false)
  })

  it('hides install guidance when macFUSE is available', () => {
    const model = new RemoteStorageModel()
    model.volume.backends.set([
      {id: 'fuse', available: true, label: 'FUSE (macFUSE)', install_url: null},
      {id: 'webdav', available: true, label: 'WebDAV', install_url: null},
    ])
    model.volume.selectedBackend.set('fuse')
    model.volume.backendDiscoveryState.set('ready')

    render(renderVolumeMountSection({model}), container)

    expect(container.querySelector('a[href*="macfuse"]')).toBeNull()
  })
})
