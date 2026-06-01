import {afterEach, describe, expect, it} from 'vitest'

import {syncIOSViewportZoomPolicy} from 'root/app/bootstrap/ios-viewport'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

function installViewportMeta(content = 'width=device-width'): HTMLMetaElement {
  document.querySelector('meta[name="viewport"]')?.remove()
  const viewport = document.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = content
  document.head.append(viewport)
  return viewport
}

describe('syncIOSViewportZoomPolicy', () => {
  afterEach(() => {
    document.querySelector('meta[name="viewport"]')?.remove()
    resetRuntimeCapabilities()
  })

  it('writes the shared resizes-visual interactive-widget policy for iOS WebViews', () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    const viewport = installViewportMeta()

    syncIOSViewportZoomPolicy(true)

    expect(viewport.content).toContain('width=device-width')
    expect(viewport.content).toContain('initial-scale=1.0')
    expect(viewport.content).toContain('maximum-scale=1.0')
    expect(viewport.content).toContain('user-scalable=no')
    expect(viewport.content).toContain('viewport-fit=cover')
    expect(viewport.content).toContain('interactive-widget=resizes-visual')
    expect(viewport.content).not.toContain('interactive-widget=resizes-content')
  })
})
