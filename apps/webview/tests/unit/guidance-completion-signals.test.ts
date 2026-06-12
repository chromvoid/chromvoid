import {atom} from '@reatom/core'
import {render, type TemplateResult} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {ManagerRoot} from '@project/passmanager/core'

const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => mocks.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => mocks.tauriListen(...args),
}))

import {type SurfaceId} from '../../src/app/navigation/navigation.types'
import {
  GuidanceCompletionBridge,
  type GuidanceProductStateBinding,
} from '../../src/core/guidance/guidance-completion-bridge'
import {guidanceDefinitions} from '../../src/core/guidance/guidance.registry'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import {
  moduleAccessModel,
  type ModuleAccessState,
} from '../../src/core/pro/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'
import {RemoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'
import {ChromVoidApp} from '../../src/routes/app.route.impl'
import {WelcomeSharedModel, WelcomeToolsModel} from '../../src/routes/welcome/welcome.model'
import {dialogService} from '../../src/shared/services/dialog-service'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

const PRODUCT_STATE_KEYS = [
  'vault.created',
  'vault.opened',
  'files.has_items',
  'notes.has_notes',
  'passwords.has_entries',
  'passkeys.has_credentials',
  'remote.has_paired_device',
  'gateway.has_paired_extension',
  'ssh_agent.started',
  'credential_provider.enabled',
] as const

const DOMAIN_EVENT_KEYS = ['backup.created', 'restore.started', 'volume_mount.started'] as const

type BooleanSignal = ReturnType<typeof atom<boolean>>
type UnknownArraySignal = ReturnType<typeof atom<unknown[]>>
type NumberSignal = ReturnType<typeof atom<number>>

let passwordRootId = 0

type GuidanceRecorder = {
  active: Set<string>
  completed: string[]
  cleared: string[]
  target: {
    completeProductState: (key: string) => void
    clearProductState: (key: string) => void
  }
}

function createGuidanceRecorder(): GuidanceRecorder {
  const active = new Set<string>()
  const completed: string[] = []
  const cleared: string[] = []

  return {
    active,
    completed,
    cleared,
    target: {
      completeProductState: (key: string) => {
        active.add(key)
        completed.push(key)
      },
      clearProductState: (key: string) => {
        active.delete(key)
        cleared.push(key)
      },
    },
  }
}

function productStateBinding(
  key: string,
  source: BooleanSignal,
  latch = false,
): GuidanceProductStateBinding {
  return {
    key,
    latch,
    read: () => source(),
    subscribe: (listener) => source.subscribe(listener),
  }
}

function countCalls(calls: readonly string[], key: string): number {
  return calls.filter((call) => call === key).length
}

function createPasswordRoot(entries: unknown[] = []): {
  root: ManagerRoot
  entries: UnknownArraySignal
  updatedTs: NumberSignal
} {
  passwordRootId += 1
  const entriesSignal: UnknownArraySignal = atom(entries, `test.passwordRoot.entries.${passwordRootId}`)
  const updatedTsSignal: NumberSignal = atom(0, `test.passwordRoot.updatedTs.${passwordRootId}`)

  const root = {
    entries: entriesSignal,
    updatedTs: updatedTsSignal,
    get allEntries() {
      return entriesSignal()
    },
  } as unknown as ManagerRoot

  return {root, entries: entriesSignal, updatedTs: updatedTsSignal}
}

function setTauriRuntime(): void {
  vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
}

function enableMountedVaultAccess(): void {
  moduleAccessModel.rawStates.set([
    {
      feature_key: 'mounted-vault',
      status: 'enabled',
      denial_code: null,
    },
  ])
}

function registerMountAnchor(): HTMLElement {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  guidanceModel.registerAnchor({
    surface: 'remote-storage',
    anchorId: 'remote-storage.mount',
    owner: 'remote-storage',
    element: anchor,
  })
  return anchor
}

function resetGuidanceModel(): void {
  guidanceModel.disconnect()
  guidanceModel.definitions.set(guidanceDefinitions)
  guidanceModel.progress.set([])
  guidanceModel.anchors.set({})
  guidanceModel.productStates.set(new Set())
  guidanceModel.completedDomainEvents.set(new Set())
  guidanceModel.manualHelpRequest.set(null)
  guidanceModel.blockedActionRequest.set(null)
  guidanceModel.setRoute('loading')
  localStorage.clear()
}

function initGuidanceTestContext(): void {
  initAppContext(
    createMockAppContext({
      store: {
        pushNotification: vi.fn(),
        remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
      } as never,
      state: {
        data: () => ({
          NeedUserInitialization: false,
          StorageOpened: true,
          StorePath: '/vault/storage',
        }),
      } as never,
    }),
  )
}

beforeEach(() => {
  resetGuidanceModel()
  setPassmanagerRoot(undefined)
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  initGuidanceTestContext()
})

afterEach(() => {
  document.body.innerHTML = ''
  clearAppContext()
  resetGuidanceModel()
  setPassmanagerRoot(undefined)
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.tauriInvoke.mockReset()
  mocks.tauriListen.mockReset()
})

describe('guidance completion signals', () => {
  it('keeps seeded completion keys bound or manual-only', () => {
    const productKeys = new Set(PRODUCT_STATE_KEYS)
    const domainEventKeys = new Set(DOMAIN_EVENT_KEYS)

    for (const definition of guidanceDefinitions) {
      if (definition.completion.kind === 'manual_ack') continue

      if (definition.completion.kind === 'product_state') {
        expect(productKeys.has(definition.completion.key as (typeof PRODUCT_STATE_KEYS)[number]), definition.id).toBe(true)
        continue
      }

      expect(domainEventKeys.has(definition.completion.event as (typeof DOMAIN_EVENT_KEYS)[number]), definition.id).toBe(true)
    }
  })

  it('updates every seeded product-state key from source-of-truth bindings', async () => {
    const recorder = createGuidanceRecorder()
    const sources = new Map<string, BooleanSignal>(
      PRODUCT_STATE_KEYS.map((key) => [key, atom(false, `test.${key}`)]),
    )
    const latchedKeys = new Set<string>(['vault.created', 'vault.opened'])
    const bridge = new GuidanceCompletionBridge({
      guidance: recorder.target,
      productStateBindings: () =>
        PRODUCT_STATE_KEYS.map((key) =>
          productStateBinding(key, sources.get(key)!, latchedKeys.has(key)),
        ),
    })

    bridge.connect()

    for (const key of PRODUCT_STATE_KEYS) {
      expect(recorder.active.has(key)).toBe(false)
      sources.get(key)!.set(true)
      await Promise.resolve()
      expect(recorder.active.has(key)).toBe(true)
    }

    for (const key of PRODUCT_STATE_KEYS) {
      sources.get(key)!.set(false)
    }
    await Promise.resolve()

    expect(recorder.active.has('vault.created')).toBe(true)
    expect(recorder.active.has('vault.opened')).toBe(true)
    for (const key of PRODUCT_STATE_KEYS.filter((key) => !latchedKeys.has(key))) {
      expect(recorder.active.has(key)).toBe(false)
    }

    bridge.disconnect()
  })

  it('does not duplicate initial active or inactive product-state sync on connect', () => {
    const recorder = createGuidanceRecorder()
    const inactive = atom(false, 'test.product.inactive')
    const active = atom(true, 'test.product.active')
    const bridge = new GuidanceCompletionBridge({
      guidance: recorder.target,
      productStateBindings: () => [
        productStateBinding('test.inactive', inactive),
        productStateBinding('test.active', active),
      ],
    })

    bridge.connect()

    expect(countCalls(recorder.cleared, 'test.inactive')).toBe(1)
    expect(countCalls(recorder.completed, 'test.active')).toBe(1)
    bridge.disconnect()
  })

  it('rebinds password entry-count roots without old-root updates or duplicate initial sync', async () => {
    const recorder = createGuidanceRecorder()
    const rootA = createPasswordRoot([])
    const rootB = createPasswordRoot([{}])
    const bridge = new GuidanceCompletionBridge({guidance: recorder.target})

    setPassmanagerRoot(rootA.root)
    bridge.connect()

    expect(countCalls(recorder.cleared, 'passwords.has_entries')).toBe(1)
    expect(countCalls(recorder.completed, 'passwords.has_entries')).toBe(0)

    rootA.entries.set([{}])
    await Promise.resolve()

    expect(countCalls(recorder.completed, 'passwords.has_entries')).toBe(1)

    setPassmanagerRoot(rootB.root)
    await Promise.resolve()

    expect(countCalls(recorder.completed, 'passwords.has_entries')).toBe(1)

    rootA.entries.set([])
    rootA.updatedTs.set(1)
    await Promise.resolve()

    expect(countCalls(recorder.cleared, 'passwords.has_entries')).toBe(1)

    rootB.entries.set([])
    await Promise.resolve()

    expect(countCalls(recorder.cleared, 'passwords.has_entries')).toBe(2)

    bridge.disconnect()
    rootB.entries.set([{}])
    await Promise.resolve()

    expect(countCalls(recorder.completed, 'passwords.has_entries')).toBe(1)
  })

  it('binds and tears down per-page remote and gateway collection sources', async () => {
    const recorder = createGuidanceRecorder()
    const remoteDevices = atom<unknown[]>([])
    const gatewayExtensions = atom<unknown[]>([])
    const bridge = new GuidanceCompletionBridge({
      guidance: recorder.target,
      productStateBindings: () => [],
    })

    bridge.bindRemotePairedDevices(remoteDevices)
    bridge.bindGatewayPairedExtensions(gatewayExtensions)
    remoteDevices.set([{}])
    gatewayExtensions.set([{}])
    await Promise.resolve()

    expect(recorder.active.has('remote.has_paired_device')).toBe(true)
    expect(recorder.active.has('gateway.has_paired_extension')).toBe(true)

    bridge.disconnect()
    remoteDevices.set([])
    gatewayExtensions.set([])
    await Promise.resolve()

    expect(recorder.active.has('remote.has_paired_device')).toBe(true)
    expect(recorder.active.has('gateway.has_paired_extension')).toBe(true)
  })

  it('emits backup and volume mount domain events only after successful commands', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_volume: true})
    mocks.tauriListen.mockResolvedValue(() => {})
    mocks.tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'backup_local_create') {
        return {ok: true, result: {backup_dir: '/tmp/chromvoid-backup'}}
      }
      if (command === 'volume_mount') {
        return {
          ok: true,
          result: {
            state: 'mounted',
            backend: 'webdav',
            mountpoint: 'http://127.0.0.1:49152',
            webdav_port: 49152,
            error: null,
          },
        }
      }
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new RemoteStorageModel()
    model.masterPassword.set('secret-password')

    await model.startExport()
    expect(guidanceModel.completedDomainEvents().has('backup.created')).toBe(true)

    await model.onVolumeMount()
    expect(guidanceModel.completedDomainEvents().has('volume_mount.started')).toBe(true)
  })

  it('shows the mounted vault warning before the first enabled mount attempt', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_volume: true})
    enableMountedVaultAccess()
    registerMountAnchor()
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        state: 'mounted',
        backend: 'webdav',
        mountpoint: 'http://127.0.0.1:49152',
        webdav_port: 49152,
        error: null,
      },
    })

    const model = new RemoteStorageModel()

    await model.onVolumeMount()

    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
    expect(guidanceModel.activeGuidance()).toMatchObject({
      kind: 'anchored',
      definition: {id: 'remote-storage.mount-warning'},
    })
    expect(guidanceModel.completedDomainEvents().has('volume_mount.started')).toBe(false)

    guidanceModel.markSeen('remote-storage.mount-warning')
    guidanceModel.dismiss('remote-storage.mount-warning')

    await model.onVolumeMount()

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('volume_mount', {backend: null})
    expect(guidanceModel.completedDomainEvents().has('volume_mount.started')).toBe(true)
  })

  it('does not request the mounted vault warning when volume support is absent', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_volume: false})
    enableMountedVaultAccess()
    registerMountAnchor()
    mocks.tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        state: 'mounted',
        backend: 'webdav',
        mountpoint: 'http://127.0.0.1:49152',
        webdav_port: 49152,
        error: null,
      },
    })

    const model = new RemoteStorageModel()

    await model.onVolumeMount()

    expect(guidanceModel.activeGuidance().kind).toBe('hidden')
    expect(guidanceModel.blockedActionRequest()).toBeNull()
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
  })

  it('emits restore.started after restore command success', async () => {
    setTauriRuntime()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_mobile_backup_restore: true,
    })
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('secret-password')
    mocks.tauriListen.mockResolvedValue(() => {})
    mocks.tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'restore_local_select_source') {
        return {
          ok: true,
          result: {
            backup_path: 'content://chromvoid-backup',
            display_name: 'Android restore folder',
          },
        }
      }
      if (command === 'restore_local_from_folder') {
        return {ok: true, result: {}}
      }
      throw new Error(`unexpected command: ${command}`)
    })

    const model = new WelcomeToolsModel(new WelcomeSharedModel())

    await model.onRestoreClick()

    expect(guidanceModel.completedDomainEvents().has('restore.started')).toBe(true)
  })

  it('opens blocked-action guidance from the blocked access help action, not from display alone', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_network_remote: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'remote',
        status: 'locked_pro',
        denial_code: 'LOCKED_PRO',
      },
    ])
    guidanceModel.setRoute('dashboard')
    ChromVoidApp.define()

    const app = document.createElement(ChromVoidApp.elementName) as ChromVoidApp
    const access: ModuleAccessState = {
      feature_key: 'remote',
      status: 'locked_pro',
      denial_code: 'LOCKED_PRO',
    }
    const renderer = app as unknown as {
      renderModuleAccessState: (surface: SurfaceId, access: ModuleAccessState) => TemplateResult
    }
    const container = document.createElement('div')
    document.body.append(container)

    render(renderer.renderModuleAccessState('remote', access), container, {host: app})

    expect(guidanceModel.blockedActionRequest()).toBeNull()

    container
      .querySelector<HTMLButtonElement>('[data-feature="remote"][data-status="locked_pro"]')
      ?.click()

    expect(guidanceModel.blockedActionRequest()).toMatchObject({
      feature: 'remote',
      reason: 'locked_pro',
      surface: 'remote',
      anchorId: 'pro.access-state',
    })
    expect(guidanceModel.activeGuidance()).toMatchObject({
      definition: {id: 'pro.remote.blocked'},
    })
  })
})
