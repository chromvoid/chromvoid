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

  it('renders platform-specific open-external shortcut labels and hides them on mobile', async () => {
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

    const getShortcutLabel = () =>
      (
        element.shadowRoot?.querySelector('cv-shortcut.action-shortcut') as
          | (HTMLElement & {label?: string})
          | null
      )?.label ?? ''

    expect(getShortcutLabel()).toBe('⌘O')

    setRuntimeCapabilities({platform: 'linux', desktop: true, supports_open_external: true})
    element.requestUpdate()
    await settle(element)
    expect(getShortcutLabel()).toBe('Ctrl+O')

    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_open_external: true})
    element.requestUpdate()
    await settle(element)
    expect(element.shadowRoot?.querySelector('cv-shortcut.action-shortcut')).toBeNull()
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

  it('places metadata before actions without dropping file actions', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 12,
      name: 'Project brief.md',
      mimeType: 'text/markdown',
      isDir: false,
      size: 2048,
      path: '/Project brief.md',
      lastModified: Date.now(),
    }
    document.body.appendChild(element)
    await settle(element)

    const metadata = element.shadowRoot?.querySelector('.details-section')
    const actions = element.shadowRoot?.querySelector('.actions-section')
    expect(metadata?.compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(element.shadowRoot?.querySelectorAll('.actions-grid .action-btn')).toHaveLength(7)
  })

  it('reactively restores actions before metadata in the mobile layout', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 13,
      name: 'Mobile note.md',
      mimeType: 'text/markdown',
      isDir: false,
      size: 1024,
      path: '/Mobile note.md',
      lastModified: Date.now(),
    }
    document.body.appendChild(element)
    await settle(element)

    let actions = element.shadowRoot?.querySelector('.actions-section')
    let metadata = element.shadowRoot?.querySelector('.details-section')
    expect(metadata?.compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    element.mobile = true
    await settle(element)

    actions = element.shadowRoot?.querySelector('.actions-section')
    metadata = element.shadowRoot?.querySelector('.details-section')
    expect(actions?.compareDocumentPosition(metadata!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(element.hasAttribute('mobile')).toBe(true)
  })

  it('isolates mixed-direction file metadata at display boundaries', async () => {
    ensureDefined()

    const element = document.createElement('file-details-panel') as FileDetailsPanel
    element.data = {
      mode: 'single',
      id: 14,
      name: 'خطة.final.png',
      mimeType: 'image/png',
      isDir: false,
      size: 2048,
      path: '/المشاريع/2026/خطة.final.png',
      lastModified: Date.UTC(2026, 6, 15, 12, 30),
    }
    document.body.appendChild(element)
    await settle(element)

    const root = element.shadowRoot!
    expect(root.querySelector('.file-name bdi')?.getAttribute('dir')).toBe('auto')
    expect(root.querySelector('.file-type-badge bdi')?.getAttribute('dir')).toBe('ltr')
    expect(root.querySelector('.file-meta > span:last-child bdi')?.getAttribute('dir')).toBe('ltr')

    let values = root.querySelectorAll<HTMLElement>('.detail-value')
    expect(values[0]?.getAttribute('dir')).toBe('ltr')
    expect(values[1]?.querySelector('bdi')?.getAttribute('dir')).toBe('auto')
    expect(values[2]?.hasAttribute('dir')).toBe(false)
    expect(Array.from(values[2]?.querySelectorAll('bdi') ?? []).map((node) => node.dir)).toEqual([
      'ltr',
      'ltr',
    ])

    root.querySelector('image-preview')?.dispatchEvent(
      new CustomEvent('dimensions-loaded', {
        detail: {width: 1920, height: 1080},
      }),
    )
    await settle(element)

    values = root.querySelectorAll<HTMLElement>('.detail-value')
    expect(values[3]?.querySelector('bdi')?.getAttribute('dir')).toBe('ltr')
  })
})
