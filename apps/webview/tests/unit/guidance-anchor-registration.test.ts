import {html, render} from 'lit'
import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVGuidanceAnchor} from '@chromvoid/uikit/components/cv-guidance-anchor'
import {
  GUIDANCE_ANCHOR_REGISTER_EVENT,
  type CVGuidanceAnchorEventDetail,
} from '@chromvoid/uikit/components/cv-guidance-anchor'

import {DashboardHeader} from '../../src/features/file-manager/components/dashboard-header'
import {PMDesktopToolbar} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-toolbar'
import type {PasswordManagerLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {renderDevicesCard, type RemotePageRenderContext} from '../../src/routes/remote/remote-page.render'
import {renderGatewayPairingSection} from '../../src/routes/gateway/components/gateway-pairing-section'
import {renderVolumeMountSection} from '../../src/routes/remote-storage/sections/volume-mount-section'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

CVGuidanceAnchor.define()
DashboardHeader.define()
PMDesktopToolbar.define()
WelcomeSetupSection.define()

function captureAnchorRegistrations() {
  const details: CVGuidanceAnchorEventDetail[] = []
  const handler = (event: Event) => {
    details.push((event as CustomEvent<CVGuidanceAnchorEventDetail>).detail)
  }
  document.addEventListener(GUIDANCE_ANCHOR_REGISTER_EVENT, handler)
  return {
    details,
    stop: () => document.removeEventListener(GUIDANCE_ANCHOR_REGISTER_EVENT, handler),
  }
}

async function settleElement(element: {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

async function settleAnchors(root: ParentNode) {
  await Promise.resolve()
  const anchors = Array.from(root.querySelectorAll('cv-guidance-anchor')) as CVGuidanceAnchor[]
  await Promise.all(anchors.map((anchor) => anchor.updateComplete))
  await Promise.resolve()
}

function expectAnchor(
  details: readonly CVGuidanceAnchorEventDetail[],
  anchorId: string,
  surface: string,
  owner: string,
) {
  const detail = details.find((item) => item.anchorId === anchorId && item.surface === surface)
  expect(detail).toMatchObject({anchorId, surface, owner})
  expect(detail?.element).toBeInstanceOf(HTMLElement)
  expect(detail?.element.isConnected).toBe(true)
}

function makeWelcomeModel(overrides: Record<string, unknown> = {}) {
  return {
    effectiveStep: () => 'mode-select',
    busy: () => false,
    setupInProgress: () => false,
    creationState: () => ({p1: '', p2: ''}),
    isNeedInit: () => true,
    isDesktopRemoteSupported: () => true,
    onSelectLocalMode: vi.fn(),
    onSelectRemoteMode: vi.fn(),
    ...overrides,
  } as never
}

function makeToolbarModel(onAction: (action: string) => void): PasswordManagerLayoutModel {
  return {
    getDesktopToolbarSections: () => [
      {label: 'Navigation', actions: [{id: 'pm-back', icon: 'arrow-left', label: 'Back', disabled: true}]},
      {label: 'Vault', actions: [{id: 'pm-import', icon: 'cloud-upload', label: 'Import'}]},
      {label: 'Create', actions: [{id: 'pm-create-entry', icon: 'plus', label: 'Create entry'}]},
      {label: 'Selection', actions: [{id: 'pm-edit', icon: 'pencil', label: 'Edit', disabled: true}]},
    ],
    isDesktopToolbarAction: (action: string | undefined) => Boolean(action),
    executeDesktopToolbarAction: onAction,
    getDesktopToolbarContext: () => ({}),
  } as unknown as PasswordManagerLayoutModel
}

function makeRemoteContext(onScan: () => void): RemotePageRenderContext {
  return {
    hideBackLink: true,
    connectionState: () => 'disconnected',
    remoteStatus: () => ({
      connection_state: 'disconnected',
      vault_locked: false,
      locked_by_other: false,
      writer_device: null,
    }),
    devices: () => [],
    pairedDevices: () => [],
    acting: () => false,
    scanning: () => false,
    formatDate: () => '',
    formatRelativeTime: () => '',
    getConnectionBadgeClass: () => '',
    getConnectionLabel: () => '',
    onBack: () => {},
    onDisconnect: () => {},
    onScan,
    onConnect: () => {},
    onPair: () => {},
    currentMode: () => 'local',
    transportType: () => null,
    modeSwitching: () => false,
    connectionPhase: () => null,
    syncPhase: () => null,
    modeError: () => null,
    getModeLabel: () => '',
    getModeBadgeClass: () => '',
    getConnectedPeerName: () => null,
    isRemoteMode: () => false,
    onSwitchToLocal: () => {},
    isMobileRuntime: () => false,
    remoteHostsModel: {} as never,
    remoteHostsActions: {} as never,
    syncSnapshot: () => ({state: 'idle', progress: null, lastSyncMs: null, writerLock: null, errorMessage: null}),
    formatLastSyncTime: () => '',
    onSyncRetry: () => {},
    onRequestWriteLock: () => {},
    onReleaseWriteLock: () => {},
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  clearAppContext()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('guidance anchor registration', () => {
  it('registers welcome setup anchors from the owning section and preserves mode actions', async () => {
    const registrations = captureAnchorRegistrations()
    const model = makeWelcomeModel()
    const section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    section.model = model

    document.body.append(section)
    await settleElement(section)
    await settleAnchors(section.shadowRoot!)

    expectAnchor(registrations.details, 'welcome.vault-mode', 'welcome', 'welcome')

    section.shadowRoot?.querySelector<HTMLElement>('.mode-card-local')?.click()
    expect((model as {onSelectLocalMode: ReturnType<typeof vi.fn>}).onSelectLocalMode).toHaveBeenCalledTimes(1)
    registrations.stop()
  })

  it('registers file action anchors across the dashboard header shadow boundary without changing actions', async () => {
    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<'desktop' | 'mobile'>('desktop'),
          selectionMode: atom(false),
          wsStatus: atom('connected'),
          catalogStatus: atom('idle'),
          uploadTasks: atom([]),
        } as never,
      }),
    )
    const registrations = captureAnchorRegistrations()
    const header = document.createElement('dashboard-header') as DashboardHeader
    const createDir = vi.fn()
    header.addEventListener('create-dir', createDir)

    document.body.append(header)
    await settleElement(header)
    await settleAnchors(header.shadowRoot!)

    expectAnchor(registrations.details, 'files.create-or-upload', 'files', 'file-manager')

    header.shadowRoot?.querySelector<HTMLElement>('[data-action="create-dir"]')?.click()
    expect(createDir).toHaveBeenCalledTimes(1)
    registrations.stop()
  })

  it('registers password create anchors in the desktop toolbar and keeps toolbar dispatch intact', async () => {
    const registrations = captureAnchorRegistrations()
    const execute = vi.fn()
    const toolbar = document.createElement('pm-desktop-toolbar') as PMDesktopToolbar
    toolbar.model = makeToolbarModel(execute)

    document.body.append(toolbar)
    await settleElement(toolbar)
    await settleAnchors(toolbar.shadowRoot!)

    expectAnchor(registrations.details, 'passwords.create-entry', 'passwords', 'passmanager')

    toolbar.shadowRoot?.querySelector<HTMLElement>('[data-action="pm-create-entry"]')?.click()
    expect(execute).toHaveBeenCalledWith('pm-create-entry')
    registrations.stop()
  })

  it('registers password import anchors for manual help callers', async () => {
    const registrations = captureAnchorRegistrations()
    const container = document.createElement('div')
    document.body.append(container)

    render(
      html`
        <cv-guidance-anchor anchor-id="passwords.import" surface="passwords" owner="passmanager">
          <button data-action="e2e-import-help" aria-label="Import help"></button>
        </cv-guidance-anchor>
      `,
      container,
    )
    await settleAnchors(container)

    expectAnchor(registrations.details, 'passwords.import', 'passwords', 'passmanager')
    registrations.stop()
  })

  it('registers remote, gateway, and mounted-vault action anchors from functional renderers', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const registrations = captureAnchorRegistrations()
    const container = document.createElement('div')
    document.body.append(container)

    const scan = vi.fn()
    render(
      html`
        ${renderDevicesCard(makeRemoteContext(scan))}
        ${renderGatewayPairingSection({
          phase: 'idle',
          info: null,
          pinSecondsLeft: 0,
          tokenSecondsLeft: 0,
          error: null,
          onStartPairing: () => {},
          onCancelPairing: () => {},
        })}
        ${renderVolumeMountSection({
          model: {
            volume: {
              status: () => ({state: 'unmounted', backend: null, mountpoint: null, webdav_port: null, error: null}),
              backends: () => [{id: 'webdav', label: 'WebDAV', available: true}],
              selectedBackend: () => 'webdav',
            },
            onBackendChange: () => {},
            onVolumeMount: () => {},
            onVolumeUnmount: () => {},
            onVolumeRefresh: () => {},
            copyVolumeUrl: () => {},
          } as never,
        })}
      `,
      container,
    )
    await settleAnchors(container)

    expectAnchor(registrations.details, 'remote.pair-device', 'remote', 'remote')
    expectAnchor(registrations.details, 'gateway.start-pairing', 'gateway', 'gateway')
    expectAnchor(registrations.details, 'remote-storage.mount', 'remote-storage', 'remote-storage')

    container.querySelector<HTMLElement>('cv-guidance-anchor[anchor-id="remote.pair-device"] cv-button')?.click()
    expect(scan).toHaveBeenCalledTimes(1)
    registrations.stop()
  })
})
