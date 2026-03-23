import {describe, expect, it, vi} from 'vitest'

import {CatalogTransport} from '../../src/core/state/passmanager'

describe('CatalogTransport root import options', () => {
  it('forwards explicit restore mode and destructive flag to domain command', async () => {
    const sendCatalog = vi.fn(async () => ({ok: true, result: undefined}))
    const transport = new CatalogTransport({transport: {sendCatalog}} as any)

    await transport.importRoot(
      [{id: 'entry-1', title: 'Entry 1'}],
      [{path: '/restored'}],
      [{path: '/restored', iconRef: `sha256:${'d'.repeat(64)}`}],
      {
        mode: 'restore',
        reason: 'operator-recovery',
        allowDestructive: true,
      },
    )

    expect(sendCatalog).toHaveBeenCalledTimes(1)
    expect(sendCatalog).toHaveBeenCalledWith(
      'passmanager:root:import',
      expect.objectContaining({
        entries: [{id: 'entry-1', title: 'Entry 1'}],
        folders: [{path: '/restored'}],
        folders_meta: [{path: '/restored', iconRef: `sha256:${'d'.repeat(64)}`}],
        mode: 'restore',
        reason: 'operator-recovery',
        allow_destructive: true,
      }),
    )
  })
})
