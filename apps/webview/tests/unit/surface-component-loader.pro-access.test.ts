import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('root/routes/gateway/gateway-page', () => {
  throw new Error('gateway surface should not be imported')
})

vi.mock('root/routes/remote-storage.route', () => {
  throw new Error('remote-storage surface should not be imported')
})

import {ensureDashboardSurfaceComponents} from '../../src/app/bootstrap/surface-component-loader'
import {
  moduleAccessModel,
  type ModuleAccessState,
} from '../../src/core/pro/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

const LOCKED_PRO_STATES: ModuleAccessState[] = [
  {feature_key: 'browser-extension', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {feature_key: 'mounted-vault', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
]

afterEach(() => {
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
})

describe('surface component loader Pro access gating', () => {
  it('does not import unsupported gateway and remote-storage surfaces', async () => {
    moduleAccessModel.rawStates.set(LOCKED_PRO_STATES)
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_gateway: false,
      supports_volume: false,
    })

    await expect(ensureDashboardSurfaceComponents('gateway')).resolves.toBeUndefined()
    await expect(ensureDashboardSurfaceComponents('remote-storage')).resolves.toBeUndefined()
  })
})
