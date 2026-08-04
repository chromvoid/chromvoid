import {afterEach, describe, expect, it, vi} from 'vitest'

const tauriInvoke = vi.hoisted(() => vi.fn())

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

import {
  moduleAccessModel,
  PRO_FEATURE_KEYS,
  type ModuleAccessState,
} from '../../src/core/pro/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

const originalWindowEnv = window.env
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

const LOCKED_PRO_STATES: ModuleAccessState[] = [
  {feature_key: 'remote', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'browser-extension', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'mounted-vault', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'credential-provider', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'ssh-agent', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'env-runtime', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'crypto-wallet', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
  {feature_key: 'emergency-access', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
]

afterEach(() => {
  window.env = originalWindowEnv
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  tauriInvoke.mockReset()
  if (originalTauriInternals === undefined) {
    Reflect.deleteProperty(globalThis, '__TAURI_INTERNALS__')
  } else {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: originalTauriInternals,
    })
  }
})

describe('moduleAccessModel runtime support overlay', () => {
  it('keeps external Pro enabled in the backward-compatible fallback', () => {
    expect(moduleAccessModel.supportsExternalPro()).toBe(true)
  })

  it('hides every Pro feature and skips all license IPC when the distribution disables Pro', async () => {
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {invoke: vi.fn()},
    })
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_external_pro: false,
      supports_network_remote: true,
      supports_autofill: true,
    })

    for (const feature of PRO_FEATURE_KEYS) {
      expect(moduleAccessModel.featureAccess(feature)).toMatchObject({
        status: 'unsupported',
        denial_code: 'FEATURE_UNAVAILABLE_IN_DISTRIBUTION',
      })
    }
    expect(moduleAccessModel.isSurfaceVisible('remote')).toBe(false)
    expect(moduleAccessModel.isSurfaceVisible('wallet')).toBe(false)

    await expect(moduleAccessModel.refresh()).resolves.toBeUndefined()
    await expect(moduleAccessModel.activateWithActivationCode('activation-code')).resolves.toBe(false)
    await expect(moduleAccessModel.createLicenseCabinetHandoff()).resolves.toBeNull()
    await expect(moduleAccessModel.refreshLicenseSeatStatus()).resolves.toBe(false)
    await expect(moduleAccessModel.releaseCurrentSeat()).resolves.toBe(false)

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(moduleAccessModel.entitlement()).toBeNull()
    expect(moduleAccessModel.licenseSeatStatus()).toBeNull()
  })

  it('keeps only Remote visible on mobile when storage and gateway are unsupported', () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
      supports_volume: false,
      supports_gateway: false,
    })

    expect(moduleAccessModel.featureAccess('remote').status).toBe('locked_pro')
    expect(moduleAccessModel.featureAccess('mounted-vault').status).toBe('unsupported')
    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('unsupported')
    expect(moduleAccessModel.featureAccess('env-runtime').status).toBe('unsupported')
    expect(moduleAccessModel.isSurfaceVisible('remote')).toBe(true)
    expect(moduleAccessModel.isSurfaceVisible('remote-storage')).toBe(false)
    expect(moduleAccessModel.isSurfaceVisible('gateway')).toBe(false)
  })

  it('keeps desktop storage and extensions visible as locked when runtime supports them', () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
      supports_volume: true,
      supports_gateway: true,
    })

    expect(moduleAccessModel.featureAccess('mounted-vault').status).toBe('locked_pro')
    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('locked_pro')
    expect(moduleAccessModel.featureAccess('env-runtime').status).toBe('locked_pro')
    expect(moduleAccessModel.isSurfaceVisible('remote-storage')).toBe(true)
    expect(moduleAccessModel.isSurfaceVisible('gateway')).toBe(true)
  })

  it('keeps Env Runtime unsupported on non-macOS desktop platforms', () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'windows',
      desktop: true,
    })

    expect(moduleAccessModel.featureAccess('env-runtime')).toMatchObject({
      status: 'unsupported',
      denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
    })
  })

  it('shows wallet as a locked Pro surface when Core reports wallet support', () => {
    moduleAccessModel.rawStates.set([
      {feature_key: 'crypto-wallet', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
    ])

    expect(moduleAccessModel.featureAccess('crypto-wallet').status).toBe('locked_pro')
    expect(moduleAccessModel.isSurfaceVisible('wallet')).toBe(true)
    expect(moduleAccessModel.canOpenSurface('wallet')).toBe(false)
  })

  it('hides wallet when Core reports wallet support is unavailable', () => {
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'crypto-wallet',
        status: 'unsupported',
        denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
      },
    ])

    expect(moduleAccessModel.featureAccess('crypto-wallet').status).toBe('unsupported')
    expect(moduleAccessModel.isSurfaceVisible('wallet')).toBe(false)
    expect(moduleAccessModel.canOpenSurface('wallet')).toBe(false)
  })

  it('recomputes effective access when runtime capabilities change', () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_gateway: true,
    })

    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('locked_pro')

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_gateway: false,
    })

    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('unsupported')
  })

  it('keeps production non-Tauri entitlement uncertainty fail-closed', async () => {
    window.env = 'prod'
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
      supports_volume: true,
      supports_gateway: true,
      supports_autofill: true,
    })

    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')
    await moduleAccessModel.refresh()

    expect(moduleAccessModel.featureAccess('remote').status).toBe('entitlement_unavailable')
    expect(moduleAccessModel.featureAccess('mounted-vault').status).toBe('entitlement_unavailable')
    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('entitlement_unavailable')
    expect(moduleAccessModel.canOpenSurface('remote')).toBe(false)
    expect(moduleAccessModel.canOpenSurface('remote-storage')).toBe(false)
  })

  it('keeps the non-Tauri bypass explicit to dev runtime', async () => {
    window.env = 'dev'
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_network_remote: true,
      supports_volume: true,
      supports_gateway: true,
      supports_autofill: true,
    })

    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'ready')
    await moduleAccessModel.refresh()

    expect(moduleAccessModel.featureAccess('remote').status).toBe('enabled')
    expect(moduleAccessModel.featureAccess('mounted-vault').status).toBe('enabled')
    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('enabled')
    expect(moduleAccessModel.canOpenSurface('remote')).toBe(true)
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
  const remoteEntitlement = {
    licensed: true,
    plan: 'pro' as const,
    feature_keys: ['remote'] as const,
    source_core: 'remote_host' as const,
    build_policy: 'enforce' as const,
  }

  it('stays fail-closed without license IPC until the active remote Core is ready', async () => {
    enableTauriRuntime()
    moduleAccessModel.setActiveCoreContext(remoteContext, 'pending')

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    await moduleAccessModel.ensureActiveCoreAccess()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(moduleAccessModel.featureAccess('remote').status).toBe('entitlement_unavailable')
  })

  it('resolves a ready remote Core once and coalesces concurrent ensure calls', async () => {
    enableTauriRuntime()
    const access = deferred<{ok: true; result: ModuleAccessState[]}>()
    const entitlement = deferred<{ok: true; result: typeof remoteEntitlement}>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'module_access_snapshot') return access.promise
      if (command === 'license_status') return entitlement.promise
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    const first = moduleAccessModel.ensureActiveCoreAccess()
    const second = moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    expect(tauriInvoke).toHaveBeenCalledTimes(2)
    access.resolve({ok: true, result: enabledRemoteStates})
    entitlement.resolve({ok: true, result: remoteEntitlement})
    await Promise.all([first, second])

    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'open'})
    await moduleAccessModel.ensureActiveCoreAccess()
    expect(tauriInvoke).toHaveBeenCalledTimes(2)
  })

  it('forces a same-context retry without reusing an in-flight result', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      if (command === 'license_status') return {ok: true, result: remoteEntitlement}
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()
    await moduleAccessModel.refresh()

    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'module_access_snapshot')).toHaveLength(2)
    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'license_status')).toHaveLength(2)
  })

  it('ignores a stale result after the active Core changes', async () => {
    enableTauriRuntime()
    const oldAccess = deferred<{ok: true; result: ModuleAccessState[]}>()
    const oldEntitlement = deferred<{ok: true; result: typeof remoteEntitlement}>()
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'module_access_snapshot') return oldAccess.promise
      if (command === 'license_status') return oldEntitlement.promise
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')
    const staleResolution = moduleAccessModel.ensureActiveCoreAccess()

    moduleAccessModel.setActiveCoreContext({sourceCore: 'local'}, 'pending')
    oldAccess.resolve({ok: true, result: enabledRemoteStates})
    oldEntitlement.resolve({ok: true, result: remoteEntitlement})
    await staleResolution

    expect(moduleAccessModel.activeCoreContext()).toEqual({sourceCore: 'local'})
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'checking'})
    expect(moduleAccessModel.entitlement()).toBeNull()
    expect(moduleAccessModel.featureAccess('remote').status).toBe('entitlement_unavailable')
  })

  it('fails closed when license metadata comes from a different Core', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      if (command === 'license_status') {
        return {ok: true, result: {...remoteEntitlement, source_core: 'local'}}
      }
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.featureAccess('remote').status).toBe('entitlement_unavailable')
    expect(moduleAccessModel.surfaceGate('remote')).toMatchObject({kind: 'blocked'})
    expect(moduleAccessModel.error()).toContain('License source mismatch')
  })

  it('keeps an authoritative access snapshot when license metadata is unavailable', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      if (command === 'license_status') return {ok: false, error: 'metadata unavailable'}
      throw new Error(`unexpected command: ${command}`)
    })
    moduleAccessModel.setActiveCoreContext(remoteContext, 'ready')

    await moduleAccessModel.ensureActiveCoreAccess()

    expect(moduleAccessModel.featureAccess('remote').status).toBe('enabled')
    expect(moduleAccessModel.surfaceGate('remote')).toEqual({kind: 'open'})
    expect(moduleAccessModel.error()).toBe('metadata unavailable')
  })

  it('creates a new revision when the same peer without a generation relocks and unlocks', async () => {
    enableTauriRuntime()
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'module_access_snapshot') return {ok: true, result: enabledRemoteStates}
      if (command === 'license_status') return {ok: true, result: remoteEntitlement}
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
