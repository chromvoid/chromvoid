import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {state} from '@statx/core'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

const {setImportCatalogOpsMock, setExistingEntriesMapMock} = vi.hoisted(() => {
  return {
    setImportCatalogOpsMock: vi.fn(),
    setExistingEntriesMapMock: vi.fn(),
  }
})

vi.mock('@chromvoid/password-import', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    setImportCatalogOps: setImportCatalogOpsMock,
    setExistingEntriesMap: setExistingEntriesMapMock,
  }
})

describe('pmModel.onImport sets catalogOps before showing dialog', () => {
  let origPassmanager: any
  let origCatalog: any

  beforeEach(() => {
    vi.clearAllMocks()
    setImportCatalogOpsMock.mockReset()

    origPassmanager = (window as any).passmanager
    origCatalog = (window as any).catalog
    ;(window as any).passmanager = {
      showElement: Object.assign(state<any>(null), {
        set: vi.fn(),
      }),
      load: vi.fn(async () => undefined),
    }
    ;(window as any).catalog = {
      api: {
        createDir: vi.fn(),
        prepareUpload: vi.fn(),
        upload: vi.fn(),
        delete: vi.fn(),
      },
      catalog: {
        findByPath: vi.fn().mockReturnValue(null),
      },
      secrets: {
        setOTP: vi.fn(),
      },
      refreshSilent: vi.fn(async () => undefined),
      queueRefresh: vi.fn(),
    }
  })

  afterEach(() => {
    ;(window as any).passmanager = origPassmanager
    ;(window as any).catalog = origCatalog
  })

  it('should call setImportCatalogOps before setting showElement', async () => {
    const callOrder: string[] = []

    setImportCatalogOpsMock.mockImplementation(() => callOrder.push('setCatalogOps'))
    ;(window.passmanager.showElement as any).set = vi.fn(() => callOrder.push('setShowElement'))

    await pmModel.onImport()

    expect(setImportCatalogOpsMock).toHaveBeenCalledTimes(1)
    expect(window.passmanager.showElement.set).toHaveBeenCalledWith('importDialog')
    expect(callOrder).toEqual(['setCatalogOps', 'setShowElement'])
  })

  it('should pass a valid CatalogOperations object', async () => {
    await pmModel.onImport()

    const calls = setImportCatalogOpsMock.mock.calls
    const ops = calls[0]?.[0]
    expect(ops).toBeDefined()
    expect(typeof ops.createDir).toBe('function')
    expect(typeof ops.prepareUpload).toBe('function')
    expect(typeof ops.upload).toBe('function')
    expect(typeof ops.setOTPSecret).toBe('function')
    expect(typeof ops.deleteNode).toBe('function')
    expect(typeof ops.putIcon).toBe('function')
    expect(typeof ops.setGroupIcon).toBe('function')
  })

  it('should refresh catalog before opening import dialog', async () => {
    const callOrder: string[] = []
    ;(window.catalog.refreshSilent as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('refreshSilent')
    })

    setImportCatalogOpsMock.mockImplementation(() => {
      callOrder.push('setCatalogOps')
    })
    ;(window.passmanager.showElement as any).set = vi.fn(() => {
      callOrder.push('setShowElement')
    })

    await pmModel.onImport()

    expect(window.catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['refreshSilent', 'setCatalogOps', 'setShowElement'])
  })

  it('should sync catalog and reload passmanager after import complete', async () => {
    const event = new CustomEvent('import-complete', {
      detail: {
        success: true,
        progress: {total: 1, imported: 1, updated: 0, skipped: 0, errors: 0},
      },
    })

    await pmModel.handleImportComplete(event)

    expect(window.catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(window.catalog.queueRefresh).not.toHaveBeenCalled()
    expect(window.passmanager.load).toHaveBeenCalledTimes(1)
  })

  it('should queue refresh fallback when silent sync fails', async () => {
    ;(window.catalog.refreshSilent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('sync failed'),
    )
    const event = new CustomEvent('import-complete', {
      detail: {
        success: false,
        progress: {total: 1, imported: 0, updated: 1, skipped: 0, errors: 0},
      },
    })

    await pmModel.handleImportComplete(event)

    expect(window.catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(window.catalog.queueRefresh).toHaveBeenCalledWith(150)
    expect(window.passmanager.load).toHaveBeenCalledTimes(1)
  })
})
