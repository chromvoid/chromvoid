import {html, render} from 'lit'
import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVGuidanceAnchor} from '@chromvoid/uikit/components/cv-guidance-anchor'
import {
  GUIDANCE_ANCHOR_REGISTER_EVENT,
  type CVGuidanceAnchorEventDetail,
} from '@chromvoid/uikit/components/cv-guidance-anchor'

import {DashboardHeader} from '../../src/features/file-manager/components/dashboard-header'
import {DesktopShellToolbar} from '../../src/features/shell/components/desktop-shell-toolbar'
import {
  definePasswordManagerDesktopToolbarContent,
  executePasswordManagerDesktopToolbarButtonEvent,
  executePasswordManagerDesktopToolbarMenuInput,
  renderPasswordManagerDesktopToolbarContent,
} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-toolbar-content'
import type {PasswordManagerLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {RemoteHostsFlowModel} from '../../src/routes/remote/remote-hosts-flow.model'
import {renderRemoteHostsFlowPanel} from '../../src/routes/remote/remote-hosts-flow.render'
import {renderGatewayPairingSection} from '../../src/routes/gateway/components/gateway-pairing-section'
import {renderVolumeMountSection} from '../../src/routes/remote-storage/sections/volume-mount-section'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

CVGuidanceAnchor.define()
DashboardHeader.define()
definePasswordManagerDesktopToolbarContent()
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
      {label: 'Vault', actions: [{id: 'pm-import', icon: 'cloud-upload', label: 'Import'}]},
      {label: 'Create', actions: [{id: 'pm-create-entry', icon: 'plus', label: 'Create entry'}]},
    ],
    getCurrentShowElement: () => 'root',
    isDesktopToolbarAction: (action: string | undefined) => Boolean(action),
    executeDesktopToolbarAction: onAction,
    getDesktopToolbarContext: () => ({}),
  } as unknown as PasswordManagerLayoutModel
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
    expect((model as {onSelectLocalMode: ReturnType<typeof vi.fn>}).onSelectLocalMode).toHaveBeenCalledTimes(
      1,
    )
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
    const model = makeToolbarModel(execute)
    const toolbar = document.createElement(DesktopShellToolbar.elementName) as DesktopShellToolbar

    document.body.append(toolbar)
    render(
      renderPasswordManagerDesktopToolbarContent({
        model,
        onToolbarButtonClick: (event) => executePasswordManagerDesktopToolbarButtonEvent(model, event),
        onActionsMenuInput: (event) => executePasswordManagerDesktopToolbarMenuInput(model, event),
      }),
      toolbar,
    )
    await settleElement(toolbar)
    await settleAnchors(toolbar)

    expectAnchor(registrations.details, 'passwords.create-entry', 'passwords', 'passmanager')

    toolbar.querySelector<HTMLElement>('[data-action="pm-create-entry"]')?.click()
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

    const remoteHosts = new RemoteHostsFlowModel()
    const openPair = vi.fn()
    render(
      html`
        ${renderRemoteHostsFlowPanel({
          model: remoteHosts,
          actions: {onOpenPairIos: openPair},
        })}
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
              status: () => ({
                state: 'unmounted',
                backend: null,
                mountpoint: null,
                webdav_port: null,
                error: null,
              }),
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

    container
      .querySelector<HTMLElement>('cv-guidance-anchor[anchor-id="remote.pair-device"] cv-button')
      ?.click()
    expect(openPair).toHaveBeenCalledTimes(1)
    registrations.stop()
  })
})
