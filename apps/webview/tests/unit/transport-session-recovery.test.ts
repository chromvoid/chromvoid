import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

const mediaLifecycleMocks = vi.hoisted(() => ({
  releaseMediaSourcesForTransportSessionChange: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/features/media/models/media-lifecycle', () => mediaLifecycleMocks)

import {setupTransportSessionRecovery} from '../../src/app/bootstrap/transport-session-recovery'

describe('transport session recovery', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('releases media sources when the remote transport generation changes', async () => {
    const store = {
      remoteSessionPeerId: atom<string | null>('peer-1'),
      remoteSessionGeneration: atom<number | null>(1),
    }

    const cleanup = setupTransportSessionRecovery(store as never)

    expect(mediaLifecycleMocks.releaseMediaSourcesForTransportSessionChange).not.toHaveBeenCalled()

    store.remoteSessionGeneration.set(2)
    await Promise.resolve()

    expect(mediaLifecycleMocks.releaseMediaSourcesForTransportSessionChange).toHaveBeenCalledTimes(1)

    cleanup()
    store.remoteSessionGeneration.set(3)
    await Promise.resolve()

    expect(mediaLifecycleMocks.releaseMediaSourcesForTransportSessionChange).toHaveBeenCalledTimes(1)
  })
})
