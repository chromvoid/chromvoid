import {describe, expect, it, vi} from 'vitest'

import {CatalogTransport} from '../../src/core/state/passmanager'

describe('CatalogTransport root import options', () => {
  it('forwards explicit restore mode and destructive flag to domain command', async () => {
    const sendPassmanager = vi.fn(async () => ({ok: true, result: undefined}))
    const transport = new CatalogTransport({transport: {sendPassmanager}} as any)

    await transport.importRoot(
      [{id: 'entry-1', title: 'Entry 1'}],
      [{path: '/restored'}],
      [{path: '/restored', iconRef: `sha256:${'d'.repeat(64)}`, description: 'Recovered folder'}],
      {
        mode: 'restore',
        reason: 'operator-recovery',
        allowDestructive: true,
      },
    )

    expect(sendPassmanager).toHaveBeenCalledTimes(1)
    expect(sendPassmanager).toHaveBeenCalledWith(
      'passmanager:root:import',
      expect.objectContaining({
        entries: [{id: 'entry-1', title: 'Entry 1'}],
        folders: [{path: '/restored'}],
        folders_meta: [
          {path: '/restored', iconRef: `sha256:${'d'.repeat(64)}`, description: 'Recovered folder'},
        ],
        mode: 'restore',
        reason: 'operator-recovery',
        allow_destructive: true,
      }),
    )
  })
})
