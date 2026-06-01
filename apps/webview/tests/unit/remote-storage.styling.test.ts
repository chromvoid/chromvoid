import {html, render as renderTemplate} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {RemoteStoragePage} from '../../src/routes/remote-storage.route.impl'
import {remoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'
import {remoteStorageWizardStyles} from '../../src/routes/remote-storage/remote-storage-wizard.styles'
import {renderVolumeMountSection} from '../../src/routes/remote-storage/sections/volume-mount-section'
import {renderResultStep} from '../../src/routes/remote-storage/wizard/steps/result'
import {renderRemoteStorageWizard} from '../../src/routes/remote-storage/wizard/wizard-card'
import type {RemoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'
import type {VolumeStatus} from '../../src/routes/volume/volume-mount.model'

const DEFAULT_STATUS: VolumeStatus = {
  state: 'unmounted',
  backend: null,
  mountpoint: null,
  webdav_port: null,
  error: null,
}

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.assign(globalThis as {__TAURI_INTERNALS__?: {invoke: () => void}}, {
      __TAURI_INTERNALS__: {
        invoke: () => {},
      },
    })
    return
  }

  delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
}

function createModel({
  status = DEFAULT_STATUS,
  backends = [],
  selectedBackend = null,
}: {
  status?: VolumeStatus
  backends?: Array<{id: 'webdav' | 'fuse'; available: boolean; label: string; install_url: string | null}>
  selectedBackend?: 'webdav' | 'fuse' | null
} = {}): RemoteStorageModel {
  return {
    volume: {
      status: () => status,
      backends: () => backends,
      selectedBackend: () => selectedBackend,
    },
    onBackendChange: vi.fn(),
    onVolumeMount: vi.fn(),
    onVolumeUnmount: vi.fn(),
    onVolumeRefresh: vi.fn(),
    copyVolumeUrl: vi.fn(),
  } as unknown as RemoteStorageModel
}

async function settle(element: RemoteStoragePage) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

afterEach(() => {
  remoteStorageModel.cancelWizard()
  remoteStorageModel.transferStep.set('idle')
  remoteStorageModel.volume.status.set({...DEFAULT_STATUS})
  document.body.innerHTML = ''
  setTauriRuntime(false)
  vi.restoreAllMocks()
})

describe('remote storage styling', () => {
  it('renders volume mount state with class-based icon and link styling', () => {
    setTauriRuntime(true)
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(
      renderVolumeMountSection({
        model: createModel({
          status: {
            state: 'unmounted',
            backend: null,
            mountpoint: null,
            webdav_port: null,
            error: null,
          },
          backends: [{id: 'fuse', available: false, label: 'FUSE', install_url: 'https://example.com/fuse'}],
          selectedBackend: 'fuse',
        }),
      }),
      container,
    )

    const cardIcon = container.querySelector<HTMLElement>('.card-icon')
    const downloadLink = container.querySelector<HTMLAnchorElement>('a.inline-link')

    expect(cardIcon?.classList.contains('card-icon-info')).toBe(true)
    expect(cardIcon?.hasAttribute('style')).toBe(false)
    expect(downloadLink?.hasAttribute('style')).toBe(false)
    expect(downloadLink?.textContent).toContain('Download FUSE')
  })

  it('renders wizard progress with class-based icon styling', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(
      renderRemoteStorageWizard({
        step: 'progress',
        stepNumber: 3,
        transferResult: null,
        renderConfirmStep: () => html``,
        renderPasswordStep: () => html``,
        renderProgressStep: () => html`<div>progress</div>`,
        renderResultStep: () => html``,
      }),
      container,
    )

    const headerIcon = container.querySelector<HTMLElement>('.card-icon')
    const checkIcon = container.querySelector<HTMLElement>('.wizard-step-check-icon')

    expect(headerIcon?.classList.contains('card-icon-primary')).toBe(true)
    expect(headerIcon?.hasAttribute('style')).toBe(false)
    expect(checkIcon).not.toBeNull()
    expect(checkIcon?.hasAttribute('style')).toBe(false)
  })

  it('renders quick stats and backup card with class-based variants', async () => {
    RemoteStoragePage.define()
    remoteStorageModel.transferStep.set('idle')
    remoteStorageModel.volume.status.set({
      state: 'mounted',
      backend: 'fuse',
      mountpoint: '/Volumes/ChromVoid',
      webdav_port: null,
      error: null,
    })

    const element = document.createElement('remote-storage-page') as RemoteStoragePage
    element.hideBackLink = true
    document.body.appendChild(element)
    await settle(element)

    const statCards = Array.from(element.shadowRoot?.querySelectorAll<HTMLElement>('.stat-card') ?? [])
    const backupIcon = element.shadowRoot?.querySelector<HTMLElement>('.main-grid .card-icon.card-icon-success')

    expect(statCards).toHaveLength(2)
    expect(statCards[0]?.classList.contains('stat-card-info')).toBe(true)
    expect(statCards[0]?.hasAttribute('style')).toBe(false)
    expect(statCards[1]?.classList.contains('stat-card-success')).toBe(true)
    expect(statCards[1]?.hasAttribute('style')).toBe(false)
    expect(backupIcon?.hasAttribute('style')).toBe(false)
  })

  it('applies success-check motion only to successful result icons', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(
      renderResultStep({
        result: {success: true, backupDir: '/tmp/chromvoid-backup'},
        onCopyPath: vi.fn(),
        onClose: vi.fn(),
        onRetry: vi.fn(),
      }),
      container,
    )

    const successIcon = container.querySelector<HTMLElement>('.result-icon.success')
    expect(successIcon?.classList.contains('motion-success-check')).toBe(true)
    expect(successIcon?.hasAttribute('style')).toBe(false)

    renderTemplate(
      renderResultStep({
        result: {success: false, error: 'denied', code: 'FAILED'},
        onCopyPath: vi.fn(),
        onClose: vi.fn(),
        onRetry: vi.fn(),
      }),
      container,
    )

    const errorIcon = container.querySelector<HTMLElement>('.result-icon.error')
    expect(errorIcon?.classList.contains('motion-success-check')).toBe(false)
    expect(errorIcon?.hasAttribute('style')).toBe(false)
  })

  it('includes finite success-check styles with reduced-motion coverage', () => {
    const cssText = remoteStorageWizardStyles.map((style) => style.cssText ?? '').join('\n')

    expect(cssText).toContain('.motion-success-check')
    expect(cssText).toContain('motion-success-check-in var(--cv-duration-normal)')
    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)')
    expect(cssText).not.toContain('transition: all')
    expect(cssText).not.toMatch(/\binfinite\b/)
  })
})
