import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  confirmPassManagerAction,
  getPassManagerDialogAdapter,
  setPassManagerDialogAdapter,
  showPassManagerAlert,
} from './dialog'

describe('passmanager dialog adapter', () => {
  afterEach(() => {
    setPassManagerDialogAdapter(null)
  })

  it('starts without an adapter', () => {
    expect(getPassManagerDialogAdapter()).toBeNull()
  })

  it('delegates confirmations to the adapter', async () => {
    const confirm = vi.fn(async () => true)
    setPassManagerDialogAdapter({confirm})

    await expect(confirmPassManagerAction({title: 'Delete'})).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledWith({title: 'Delete'})
  })

  it('returns false when the adapter rejects a confirmation', async () => {
    setPassManagerDialogAdapter({
      confirm: vi.fn(async () => false),
    })

    await expect(confirmPassManagerAction({title: 'Delete'})).resolves.toBe(false)
  })

  it('fails closed when no confirmation adapter exists', async () => {
    await expect(confirmPassManagerAction({title: 'Delete'})).resolves.toBe(false)
  })

  it('fails closed when the confirmation adapter throws', async () => {
    setPassManagerDialogAdapter({
      confirm: vi.fn(() => {
        throw new Error('dialog unavailable')
      }),
    })

    await expect(confirmPassManagerAction({title: 'Delete'})).resolves.toBe(false)
  })

  it('delegates alerts when an alert adapter exists', async () => {
    const alert = vi.fn(async () => {})
    setPassManagerDialogAdapter({
      confirm: vi.fn(async () => true),
      alert,
    })

    await showPassManagerAlert({title: 'Import failed', message: 'Bad payload'})
    expect(alert).toHaveBeenCalledWith({title: 'Import failed', message: 'Bad payload'})
  })

  it('ignores missing or failing alert adapters', async () => {
    await expect(showPassManagerAlert({title: 'Import failed'})).resolves.toBeUndefined()

    setPassManagerDialogAdapter({
      confirm: vi.fn(async () => true),
      alert: vi.fn(() => {
        throw new Error('dialog unavailable')
      }),
    })

    await expect(showPassManagerAlert({title: 'Import failed'})).resolves.toBeUndefined()
  })
})
