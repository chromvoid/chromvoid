import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {passmanagerMaintenanceModel} from '../../src/features/passmanager/models/passmanager-maintenance.model'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {dialogService} from '../../src/shared/services/dialog-service'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const {
  downloadPassmanagerJsonMock,
  notifySuccessMock,
  setExistingEntriesMapMock,
  setImportCatalogOpsMock,
} = vi.hoisted(() => ({
  downloadPassmanagerJsonMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  setExistingEntriesMapMock: vi.fn(),
  setImportCatalogOpsMock: vi.fn(),
}))

vi.mock('../../src/features/passmanager/service/passmanager-json-download', () => ({
  downloadPassmanagerJson: (...args: unknown[]) => downloadPassmanagerJsonMock(...args),
}))

vi.mock('@chromvoid/password-import/ui/import-dialog-state', () => ({
  setExistingEntriesMap: (...args: unknown[]) => setExistingEntriesMapMock(...args),
  setImportCatalogOps: (...args: unknown[]) => setImportCatalogOpsMock(...args),
}))

vi.mock('@project/passmanager/notify', () => ({
  notify: {
    success: (...args: unknown[]) => notifySuccessMock(...args),
  },
}))

type CatalogStub = ReturnType<typeof createCatalogStub>

function createCatalogStub() {
  const sendPassmanager = vi.fn(async (command: string) => {
    if (command === 'passmanager:entry:list') {
      return {ok: true, result: {entries: []}}
    }
    if (command === 'passmanager:root:export') {
      return {
        ok: true,
        result: {
          root: {
            version: 1,
            createdTs: 1,
            updatedTs: 1,
            folders: [],
            foldersMeta: [],
            entries: [],
          },
        },
      }
    }
    return {ok: true, result: {}}
  })

  return {
    api: {
      createDir: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
    },
    catalog: {
      findByPath: vi.fn().mockReturnValue(null),
      getChildren: vi.fn().mockReturnValue([]),
      getPath: vi.fn().mockReturnValue('/.password-store'),
    },
    ensureEntryMeta: vi.fn(),
    getEntryMeta: vi.fn(),
    queueRefresh: vi.fn(),
    refreshSilent: vi.fn(async () => undefined),
    secrets: {
      setOTP: vi.fn(),
    },
    transport: {
      sendPassmanager,
    },
  }
}

function initCatalogContext(catalog: CatalogStub) {
  initAppContext(
    createMockAppContext({
      catalog: catalog as any,
    }),
  )
}

describe('PassmanagerMaintenanceModel', () => {
  let catalog: CatalogStub

  beforeEach(() => {
    catalog = createCatalogStub()
    initCatalogContext(catalog)
    downloadPassmanagerJsonMock.mockReset()
    downloadPassmanagerJsonMock.mockResolvedValue(true)
    notifySuccessMock.mockReset()
    setExistingEntriesMapMock.mockReset()
    setImportCatalogOpsMock.mockReset()
    passmanagerMaintenanceModel.importDialogOpen.set(false)
    passmanagerMaintenanceModel.importCompletedSuccessfully.set(false)
    passmanagerMaintenanceModel.busyAction.set(null)
    passmanagerMaintenanceModel.error.set('')
    setPassmanagerRoot(undefined)
  })

  afterEach(() => {
    clearAppContext()
    setPassmanagerRoot(undefined)
    passmanagerMaintenanceModel.importDialogOpen.set(false)
    passmanagerMaintenanceModel.importCompletedSuccessfully.set(false)
    passmanagerMaintenanceModel.busyAction.set(null)
    passmanagerMaintenanceModel.error.set('')
    vi.restoreAllMocks()
  })

  it('prepares import catalog operations before opening the Settings import dialog', async () => {
    const ensureSpy = vi
      .spyOn(pmComponentLoaderModel, 'ensureExtendedComponents')
      .mockResolvedValue(undefined)

    await passmanagerMaintenanceModel.openSettingsImportDialog()

    expect(catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(setImportCatalogOpsMock).toHaveBeenCalledTimes(1)
    expect(setExistingEntriesMapMock).toHaveBeenCalledTimes(1)
    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(passmanagerMaintenanceModel.importDialogOpen()).toBe(true)
    expect(passmanagerMaintenanceModel.busyAction()).toBeNull()
  })

  it('exports through the mounted root when Passwords is mounted', async () => {
    const root = {
      export: vi.fn(async () => undefined),
    }
    setPassmanagerRoot(root as any)

    await passmanagerMaintenanceModel.exportRoot()

    expect(root.export).toHaveBeenCalledTimes(1)
    expect(downloadPassmanagerJsonMock).not.toHaveBeenCalled()
  })

  it('exports through the passmanager transport when Passwords is not mounted', async () => {
    await passmanagerMaintenanceModel.exportRoot()

    expect(catalog.transport.sendPassmanager).toHaveBeenCalledWith('passmanager:root:export', {})
    expect(downloadPassmanagerJsonMock).toHaveBeenCalledWith({
      version: 1,
      createdTs: 1,
      updatedTs: 1,
      folders: [],
      foldersMeta: [],
      entries: [],
    })
    expect(notifySuccessMock).toHaveBeenCalledWith('Exported successfully')
  })

  it('does not run destructive clean when confirmation is canceled', async () => {
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(false)

    await passmanagerMaintenanceModel.cleanRoot()

    expect(catalog.transport.sendPassmanager).not.toHaveBeenCalledWith(
      'passmanager:root:import',
      expect.anything(),
    )
  })

  it('uses destructive replace import for confirmed unmounted clean', async () => {
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)

    await passmanagerMaintenanceModel.cleanRoot()

    expect(catalog.transport.sendPassmanager).toHaveBeenCalledWith('passmanager:root:import', {
      entries: [],
      folders: [],
      folders_meta: [],
      mode: 'replace',
      reason: 'settings-maintenance-clean',
      allow_destructive: true,
    })
    expect(catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(notifySuccessMock).toHaveBeenCalledWith('Vault cleared')
  })

  it('uses the persistent replace path and reloads mounted root for confirmed mounted clean', async () => {
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const root = {
      fullClean: vi.fn(async () => undefined),
      load: vi.fn(async () => undefined),
    }
    setPassmanagerRoot(root as any)

    await passmanagerMaintenanceModel.cleanRoot()

    expect(root.fullClean).not.toHaveBeenCalled()
    expect(catalog.transport.sendPassmanager).toHaveBeenCalledWith('passmanager:root:import', {
      entries: [],
      folders: [],
      folders_meta: [],
      mode: 'replace',
      reason: 'settings-maintenance-clean',
      allow_destructive: true,
    })
    expect(root.load).toHaveBeenCalledTimes(1)
  })

  it('shows a danger alert dialog on maintenance failures', async () => {
    catalog.transport.sendPassmanager.mockRejectedValueOnce(new Error('export failed'))
    const alertSpy = vi.spyOn(dialogService, 'showAlertDialog').mockResolvedValue(undefined)

    await passmanagerMaintenanceModel.exportRoot()

    expect(passmanagerMaintenanceModel.error()).toBe('export failed')
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'export failed',
        variant: 'danger',
      }),
    )
    expect(passmanagerMaintenanceModel.busyAction()).toBeNull()
  })

  it('keeps busy state active while a maintenance task is pending and dedupes other actions', async () => {
    let resolveExport: (() => void) | null = null
    const root = {
      export: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveExport = resolve
          }),
      ),
    }
    const confirmSpy = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    setPassmanagerRoot(root as any)

    const exportPromise = passmanagerMaintenanceModel.exportRoot()
    await Promise.resolve()

    expect(passmanagerMaintenanceModel.busyAction()).toBe('export')

    await passmanagerMaintenanceModel.cleanRoot()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(passmanagerMaintenanceModel.busyAction()).toBe('export')

    resolveExport?.()
    await exportPromise

    expect(passmanagerMaintenanceModel.busyAction()).toBeNull()
  })

  it('reloads a mounted root after import completion', async () => {
    const root = {
      load: vi.fn(async () => undefined),
    }
    setPassmanagerRoot(root as any)

    await passmanagerMaintenanceModel.handleImportComplete(
      new CustomEvent('import-complete', {
        detail: {
          success: true,
          progress: {total: 1, imported: 1, updated: 0, skipped: 0, errors: 0},
        },
      }),
    )

    expect(catalog.refreshSilent).toHaveBeenCalledTimes(1)
    expect(root.load).toHaveBeenCalledTimes(1)
    expect(passmanagerMaintenanceModel.importCompletedSuccessfully()).toBe(true)
    expect(notifySuccessMock).toHaveBeenCalledWith('Imported successfully')
  })
})
