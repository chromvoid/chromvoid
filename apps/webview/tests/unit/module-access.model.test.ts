import {afterEach, describe, expect, it} from 'vitest'

import {
  moduleAccessModel,
  type ModuleAccessState,
} from '../../src/core/pro/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

const LOCKED_PRO_STATES: ModuleAccessState[] = [
  {feature_key: 'remote', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'browser-extension', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'mounted-vault', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'credential-provider', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'ssh-agent', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'crypto-wallet', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
  {feature_key: 'emergency-access', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
]

afterEach(() => {
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
})

describe('moduleAccessModel runtime support overlay', () => {
  it('keeps only Remote visible on mobile when storage and gateway are unsupported', () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
      supports_usb_remote: false,
      supports_volume: false,
      supports_gateway: false,
    })

    expect(moduleAccessModel.featureAccess('remote').status).toBe('locked_pro')
    expect(moduleAccessModel.featureAccess('mounted-vault').status).toBe('unsupported')
    expect(moduleAccessModel.featureAccess('browser-extension').status).toBe('unsupported')
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
    expect(moduleAccessModel.isSurfaceVisible('remote-storage')).toBe(true)
    expect(moduleAccessModel.isSurfaceVisible('gateway')).toBe(true)
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
})
