import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {FileDetailsPanel} from '../../src/features/file-manager/components/file-details-panel'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {atom} from '@reatom/core'

function ensureDefined() {
  FileDetailsPanel.define()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('file-details-panel open action', () => {
  beforeEach(() => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_open_external: true})
    initAppContext(
      createMockAppContext({
        ws: {
          connected: atom(true),
          connecting: atom(false),
          lastError: atom<string | undefined>(undefined),
        } as any,
        store: {
          layoutMode: atom<'mobile' | 'desktop'>('desktop'),
        } as any,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    resetRuntimeCapabilities()
  })

  it.each([
    ['track.mp3', 'audio/mpeg', 'play-circle'],
    ['scan.heic', 'image/heic', 'eye'],
    ['report.pdf', 'application/pdf', 'box-arrow-up-right'],
  ])('renders the correct primary open action for %s', async (name, mimeType, iconName) => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 7,
      name,
      mimeType,
      isDir: false,
      size: 128,
      path: `/${name}`,
      lastModified: Date.now(),
    }
    document.body.appendChild(element)
    await settle(element)

    const firstActionIcon = element.shadowRoot?.querySelector<HTMLElement>(
      '.actions-grid .action-btn cv-icon',
    )
    expect(firstActionIcon?.getAttribute('name')).toBe(iconName)
  })

  it('shows a pending state on system-open buttons while the file is being prepared', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.externalOpenPending = true
    element.data = {
      mode: 'single',
      id: 9,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
      size: 128,
      path: '/report.pdf',
      lastModified: Date.now(),
    }
    document.body.appendChild(element)
    await settle(element)

    const buttons = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.actions-grid .action-btn') ?? [],
    )
    const preparingButtons = buttons.filter((button) => button.textContent?.includes('Preparing file...'))

    expect(preparingButtons).toHaveLength(2)
    expect(preparingButtons.every((button) => button.disabled)).toBe(true)
  })

  it('renders platform-specific open-external shortcut labels and hides them on Android', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 10,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      isDir: false,
      size: 128,
      path: '/report.pdf',
      lastModified: Date.now(),
    }
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('⌘O')

    setRuntimeCapabilities({platform: 'linux', desktop: true, supports_open_external: true})
    element.requestUpdate()
    await settle(element)
    expect(element.shadowRoot?.textContent).toContain('Ctrl+O')

    setRuntimeCapabilities({platform: 'android', mobile: true, supports_open_external: true})
    element.requestUpdate()
    await settle(element)
    const text = element.shadowRoot?.textContent ?? ''
    expect(text).not.toContain('⌘O')
    expect(text).not.toContain('Ctrl+O')
  })

  it('renders audio details artwork through the derivative preview component', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 11,
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      isDir: false,
      size: 4096,
      path: '/track.mp3',
      lastModified: Date.now(),
      sourceRevision: 3,
    }
    document.body.appendChild(element)
    await settle(element)

    const artwork = element.shadowRoot?.querySelector('audio-artwork-preview.details-audio-artwork')
    expect(artwork).not.toBeNull()
    expect(artwork?.getAttribute('variant')).toBe('preview-image')
    expect(element.shadowRoot?.querySelector('image-preview')).toBeNull()
    expect(element.shadowRoot?.querySelector('video-preview')).toBeNull()
  })
})
