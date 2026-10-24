import {afterEach, describe, expect, it, vi} from 'vitest'

const tauriInvoke = vi.hoisted(() => vi.fn())

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

import {
  MODULE_KEYS,
  moduleAccessModel,
  type ModuleAccessState,
} from '../../src/core/modules/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

const originalTauriInternals = (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__

function enableTauriRuntime(): void {
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke: vi.fn()},
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return {promise, resolve}
}

function resolveStates(states: ModuleAccessState[]): void {
  moduleAccessModel.resolution.set({phase: 'resolved', states})
}

const ENABLED_STATES: ModuleAccessState[] = MODULE_KEYS.map((feature) => ({
  feature_key: feature,
  status: 'enabled',
  denial_code: null,
}))

const DESKTOP_CAPABILITIES = {
  platform: 'macos',
  desktop: true,
  supports_network_remote: true,
  supports_volume: true,
  supports_gateway: true,
  supports_autofill: true,
}

afterEach(() => {
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  tauriInvoke.mockReset()
  vi.restoreAllMocks()
  if (originalTauriInternals === undefined) {
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
  } else {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: originalTauriInternals,
    })
  }
})

describe('moduleAccessModel availability', () => {
  it('knows nothing is enabled before the active Core answers, apart from what the runtime rules out', () => {
    setRuntimeCapabilities(DESKTOP_CAPABILITIES)

    expect(moduleAccessModel.featureAccess('remote')).toBeNull()
    expect(moduleAccessModel.isFeatureEnabled('remote')).toBe(false)
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    expect(moduleAccessModel.canOpenSurface('remote')).toBe(false)
    expect(moduleAccessModel.isSurfaceOffered('remote')).toBe(true)
    expect(moduleAccessModel.featureAccess('emergency-access')).toEqual({
      feature_key: 'emergency-access',
      status: 'unsupported',
      denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
    })
  })

  it('opens every surface the Core enables', () => {
    setRuntimeCapabilities(DESKTOP_CAPABILITIES)
    resolveStates(ENABLED_STATES)

    for (const surface of ['remote', 'gateway', 'remote-storage', 'wallet'] as const) {
      expect(moduleAccessModel.surfaceGate(surface)).toEqual({kind: 'open'})
      expect(moduleAccessModel.isSurfaceOffered(surface)).toBe(true)
    }
    expect(moduleAccessModel.surfaceGate('files')).toEqual({kind: 'open'})
  })

  it('does not offer surfaces the platform cannot run, whatever the Core says', () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_network_remote: true,
      supports_volume: false,
      supports_gateway: false,
    })
    resolveStates(ENABLED_STATES)

    expect(moduleAccessModel.featureAccess('remote')?.status).toBe('enabled')
    expect(moduleAccessModel.featureAccess('mounted-vault')).toMatchObject({
      status: 'unsupported',
      denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
    })
    expect(moduleAccessModel.featureAccess('browser-extension')?.status).toBe('unsupported')
    expect(moduleAccessModel.featureAccess('env-runtime')?.status).toBe('unsupported')
    expect(moduleAccessModel.isSurfaceOffered('remote')).toBe(true)
    expect(moduleAccessModel.isSurfaceOffered('remote-storage')).toBe(false)
    expect(moduleAccessModel.isSurfaceOffered('gateway')).toBe(false)
    expect(moduleAccessModel.preferredSurfaceFallback()).toBe('remote')
  })

  it('keeps Env Runtime unsupported on non-macOS desktop platforms', () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    resolveStates(ENABLED_STATES)

    expect(moduleAccessModel.featureAccess('env-runtime')).toMatchObject({
      status: 'unsupported',
      denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
    })
  })

  it('does not offer a surface the release has disabled', () => {
    setRuntimeCapabilities(DESKTOP_CAPABILITIES)
    resolveStates([
      {feature_key: 'remote', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
    ])

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({
      kind: 'unavailable',
      access: {feature_key: 'remote', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
    })
    expect(moduleAccessModel.isSurfaceOffered('remote')).toBe(false)
    expect(moduleAccessModel.preferredSurfaceFallback()).toBe('files')
    expect(moduleAccessModel.isSurfaceOffered('wallet')).toBe(true)
  })

  it('does not offer wallet when the active Core cannot run it', () => {
    resolveStates([
      {feature_key: 'crypto-wallet', status: 'unsupported', denial_code: 'REMOTE_CORE_UNSUPPORTED'},
    ])

    expect(moduleAccessModel.featureAccess('crypto-wallet')?.denial_code).toBe('REMOTE_CORE_UNSUPPORTED')
    expect(moduleAccessModel.isSurfaceOffered('wallet')).toBe(false)
    expect(moduleAccessModel.canOpenSurface('wallet')).toBe(false)
  })

  it('recomputes effective access when runtime capabilities change', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_gateway: true})
    resolveStates(ENABLED_STATES)
    expect(moduleAccessModel.featureAccess('browser-extension')?.status).toBe('enabled')

    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_gateway: false})
    expect(moduleAccessModel.featureAccess('browser-extension')?.status).toBe('unsupported')
  })

  it('lets a non-Tauri runtime use every module its capabilities support without a dev flag', async () => {
    setRuntimeCapabilities({...DESKTOP_CAPABILITIES, supports_volume: false})

    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')
    await moduleAccessModel.ensureActiveCoreAccess()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(moduleAccessModel.canOpenSurface('remote')).toBe(true)
    expect(moduleAccessModel.canOpenSurface('gateway')).toBe(true)
    expect(moduleAccessModel.isFeatureEnabled('credential-provider')).toBe(true)
    expect(moduleAccessModel.featureAccess('mounted-vault')?.status).toBe('unsupported')
    expect(moduleAccessModel.canOpenSurface('wallet')).toBe(false)
  })
})

describe('moduleAccessModel active Core lifecycle', () => {
  const remoteContext = {
    sourceCore: 'remote_host' as const,
    peerId: 'mobile_usb:usb-host-1',
    transportSessionGeneration: 7,
  }
  const enabledRemoteStates: ModuleAccessState[] = [
    {feature_key: 'remote', status: 'enabled', denial_code: null},
  ]

  it('waits without IPC until the active remote Core is ready', async () => {
    enableTauriRuntime()
    moduleAccessModel.setActiveCoreContext(remoteContext, 'pending')

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    await moduleAccessModel.ensureActiveCoreAccess()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(moduleAccessModel.featureAccess('remote')).toBeNull()
  })

  it('resolves a ready remote Core once and coalesces concurrent ensure calls', async () => {
    enableTauriRuntime()
    const access = deferred<{ok: true; result: ModuleAccessState[]}>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'module_access_snapshot') return access.promise
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    const first = moduleAccessModel.ensureActiveCoreAccess()
    const second = moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    access.resolve({ok: true, result: enabledRemoteStates})
    await Promise.all([first, second])

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'open'})
    await moduleAccessModel.ensureActiveCoreAccess()
    expect(tauriInvoke).toHaveBeenCalledTimes(1)
  })

  it('reports a failed snapshot as a neutral, retryable state and never as enabled', async () => {
    enableTauriRuntime()
    tauriInvoke.mockResolvedValueOnce({ok: false, error: 'core unavailable'})
    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.resolution()).toEqual({phase: 'failed', error: 'core unavailable'})
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'check-failed'})
    expect(moduleAccessModel.isFeatureEnabled('remote')).toBe(false)
    expect(moduleAccessModel.isSurfaceOffered('remote')).toBe(true)

    tauriInvoke.mockResolvedValueOnce({ok: true, result: enabledRemoteStates})
    await moduleAccessModel.refresh()

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'open'})
  })

  it('treats a thrown IPC error as a failed check', async () => {
    enableTauriRuntime()
    setRuntimeCapabilities(DESKTOP_CAPABILITIES)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    tauriInvoke.mockRejectedValueOnce(new Error('ipc closed'))
    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'check-failed'})
    expect(moduleAccessModel.featureGate('credential-provider')).toEqual({kind: 'check-failed'})
  })

  it('ignores snapshot entries with unknown module keys or statuses', async () => {
    enableTauriRuntime()
    tauriInvoke.mockResolvedValueOnce({
      ok: true,
      result: [
        {feature_key: 'remote', status: 'locked', denial_code: 'SOMETHING_ELSE'},
        {feature_key: 'teleport', status: 'enabled', denial_code: null},
        {feature_key: 'crypto-wallet', status: 'enabled', denial_code: null},
      ],
    })
    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.featureAccess('remote')).toBeNull()
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'check-failed'})
    expect(moduleAccessModel.surfaceGate('wallet')).toEqual({kind: 'open'})
  })

  it('forces a same-context retry without reusing an in-flight result', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()
    await moduleAccessModel.refresh()

    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'module_access_snapshot')).toHaveLength(2)
  })

  it('ignores a stale result after the active Core changes', async () => {
    enableTauriRuntime()
    const oldAccess = deferred<{ok: true; result: ModuleAccessState[]}>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'module_access_snapshot') return oldAccess.promise
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')
    const staleResolution = moduleAccessModel.ensureActiveCoreAccess()

    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'pending')
    oldAccess.resolve({ok: true, result: enabledRemoteStates})
    await staleResolution

    expect(moduleAccessModel.activeCoreContext()).toEqual({sourceCore: 'local'})
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    expect(moduleAccessModel.featureAccess('remote')).toBeNull()
  })

  it('creates a new revision when the same peer without a generation relocks and unlocks', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      throw new Error(`unexpected command: ${command}`)
    })
    const contextWithoutGeneration = {...remoteContext, transportSessionGeneration: null}
    moduleAccessModel.setActiveCoreContext(contextWithoutGeneration, 'ready')
    await moduleAccessModel.ensureActiveCoreAccess()

    moduleAccessModel.setActiveCoreContext(contextWithoutGeneration, 'pending')
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    moduleAccessModel.setActiveCoreContext(contextWithoutGeneration, 'ready')
    await moduleAccessModel.ensureActiveCoreAccess()

    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'module_access_snapshot')).toHaveLength(2)
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'open'})
  })
})
