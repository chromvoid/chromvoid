import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

const {setCredentialImportServiceMock} = vi.hoisted(() => {
  return {
    setCredentialImportServiceMock: vi.fn(),
  }
})

vi.mock('@chromvoid/password-import/ui/import-dialog-state', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    setCredentialImportService: setCredentialImportServiceMock,
  }
})

describe('pmModel.onImport connects Core before showing dialog', () => {
  let origPassmanager: any
  let origCatalog: any

  beforeEach(() => {
    vi.clearAllMocks()
    setCredentialImportServiceMock.mockReset()

    origPassmanager = (window as any).passmanager
    origCatalog = (window as any).catalog
    ;(window as any).passmanager = {
      isEditMode: atom(false),
      showElement: Object.assign(atom<any>(null), {
        set: vi.fn(),
      }),
      load: vi.fn(async () => undefined),
    }
    setPassmanagerRoot((window as any).passmanager)
    ;(window as any).catalog = {
      api: {
        createDir: vi.fn(),
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
    initAppContext(createMockAppContext({catalog: (window as any).catalog}))
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
  })

  afterEach(() => {
    ;(window as any).passmanager = origPassmanager
    ;(window as any).catalog = origCatalog
    setPassmanagerRoot(undefined)
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('should call setCredentialImportService before setting showElement', async () => {
    const callOrder: string[] = []

    setCredentialImportServiceMock.mockImplementation(() => callOrder.push('setCoreService'))
    ;(window.passmanager.showElement as any).set = vi.fn(() => callOrder.push('setShowElement'))

    await pmModel.onImport()

    expect(setCredentialImportServiceMock).toHaveBeenCalledTimes(1)
    expect(window.passmanager.showElement.set).toHaveBeenCalledWith('importDialog')
    expect(callOrder).toEqual(['setCoreService', 'setShowElement'])
  })

  it('should pass a Core import service', async () => {
    await pmModel.onImport()

    const calls = setCredentialImportServiceMock.mock.calls
    const ops = calls[0]?.[0]
    expect(ops).toBeDefined()
    expect(typeof ops.review).toBe('function')
    expect(typeof ops.commit).toBe('function')
    expect(typeof ops.cancel).toBe('function')
  })

  it('should refresh catalog before opening import dialog', async () => {
    const callOrder: string[] = []
    ;(window.catalog.refreshSilent as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('refreshSilent')
    })

    setCredentialImportServiceMock.mockImplementation(() => {
      callOrder.push('setCoreService')
    })
    ;(window.passmanager.showElement as any).set = vi.fn(() => {
      callOrder.push('setShowElement')
    })

    await pmModel.onImport()

    expect(window.catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['refreshSilent', 'setCoreService', 'setShowElement'])
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
