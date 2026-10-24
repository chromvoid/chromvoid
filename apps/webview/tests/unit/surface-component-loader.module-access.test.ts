import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('root/routes/gateway/gateway-page', () => {
  throw new Error('gateway surface should not be imported')
})

vi.mock('root/routes/remote-storage.route', () => {
  throw new Error('remote-storage surface should not be imported')
})

vi.mock('root/routes/wallet/wallet-page', () => {
  throw new Error('wallet surface should not be imported')
})

import {ensureDashboardSurfaceComponents} from '../../src/app/bootstrap/surface-component-loader'
import {moduleAccessModel} from '../../src/core/modules/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

afterEach(() => {
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
})

describe('surface component loader module access gating', () => {
  it('does not import gateway, remote-storage, and wallet surfaces that cannot open', async () => {
    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {feature_key: 'browser-extension', status: 'enabled', denial_code: null},
        {feature_key: 'mounted-vault', status: 'enabled', denial_code: null},
        {feature_key: 'crypto-wallet', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      ],
    })
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_gateway: false,
      supports_volume: false,
    })

    await expect(ensureDashboardSurfaceComponents('gateway')).resolves.toBeUndefined()
    await expect(ensureDashboardSurfaceComponents('remote-storage')).resolves.toBeUndefined()
    await expect(ensureDashboardSurfaceComponents('wallet')).resolves.toBeUndefined()
  })

  it('does not import a gated surface while its availability is still being checked', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, supports_gateway: true})

    await expect(ensureDashboardSurfaceComponents('gateway')).resolves.toBeUndefined()
  })
})
