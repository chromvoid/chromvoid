import {atom, wrap} from '@reatom/core'
import {
  setExistingEntriesMap,
  setImportCatalogOps,
} from '@chromvoid/password-import/ui/import-dialog-state'
import {i18n} from '@project/passmanager/i18n'
import {notify} from '@project/passmanager/notify'

import {PassmanagerTransport} from 'root/core/state/passmanager'
import {dialogService} from 'root/shared/services/dialog-service'
import {getAppContext} from 'root/shared/services/app-context'
import {
  buildExistingEntriesByOriginalId,
  createCatalogOperationsAdapter,
} from '../service/catalog-import-adapter'
import {downloadPassmanagerJson} from '../service/passmanager-json-download'
import {pmComponentLoaderModel} from './pm-component-loader.model'
import {pmIconStore} from './pm-icon-store'
import {getPassmanagerRoot} from './pm-root.adapter'

export type PassmanagerMaintenanceAction = 'import' | 'export' | 'clean'

export class PassmanagerMaintenanceModel {
  readonly importDialogOpen = atom(false, 'passmanager.maintenance.importDialogOpen')
  readonly importCompletedSuccessfully = atom(
    false,
    'passmanager.maintenance.importCompletedSuccessfully',
  )
  readonly busyAction = atom<PassmanagerMaintenanceAction | null>(
    null,
    'passmanager.maintenance.busyAction',
  )
  readonly error = atom('', 'passmanager.maintenance.error')

  async prepareImport(): Promise<void> {
    const {catalog} = getAppContext()

    await wrap(this.refreshCatalog())

    const catalogOps = createCatalogOperationsAdapter(catalog)
    setImportCatalogOps(catalogOps)

    const existingMap = await wrap(buildExistingEntriesByOriginalId(catalog))
    setExistingEntriesMap(existingMap)

    await wrap(pmComponentLoaderModel.ensureExtendedComponents())
  }

  async openSettingsImportDialog(): Promise<void> {
    await wrap(this.runBusy('import', async () => {
      this.importCompletedSuccessfully.set(false)
      await wrap(this.prepareImport())
      this.importDialogOpen.set(true)
    }))
  }

  closeSettingsImportDialog(): void {
    this.importDialogOpen.set(false)
    this.importCompletedSuccessfully.set(false)
  }

  async handleImportComplete(event: Event): Promise<void> {
    const detail = (event as CustomEvent).detail as {
      success: boolean
    }

    if (detail.success) {
      pmIconStore.clearMissCache()
      this.importCompletedSuccessfully.set(true)
      notify.success(i18n('notify:import:success'))
    }

    await wrap(this.refreshCatalog())
    await wrap(this.reloadMountedRoot())
  }

  async exportRoot(): Promise<void> {
    await wrap(this.runBusy('export', async () => {
      const root = getPassmanagerRoot()
      if (root) {
        await wrap(root.export())
        return
      }

      const transport = new PassmanagerTransport(getAppContext().catalog)
      const exported = await wrap(transport.exportRoot())
      const saved = await wrap(downloadPassmanagerJson(exported.root))
      if (saved) {
        notify.success(i18n('notify:export:success'))
      }
    }))
  }

  async cleanRoot(): Promise<void> {
    await wrap(this.runBusy('clean', async () => {
      const confirmed = await wrap(dialogService.showConfirmDialog({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      }))
      if (!confirmed) return

      const transport = new PassmanagerTransport(getAppContext().catalog)
      await wrap(transport.importRoot([], [], [], {
        mode: 'replace',
        allowDestructive: true,
        reason: 'settings-maintenance-clean',
      }))
      await wrap(transport.gcIcons())
      pmIconStore.clearMissCache()
      await wrap(this.refreshCatalog())
      await wrap(this.reloadMountedRoot())
      notify.success(i18n('notify:clean:success'))
    }))
  }

  private async refreshCatalog(): Promise<void> {
    const {catalog} = getAppContext()
    try {
      await wrap(catalog.refreshSilent())
    } catch {
      catalog.queueRefresh(150)
    }
  }

  private async reloadMountedRoot(): Promise<void> {
    try {
      const root = getPassmanagerRoot()
      if (root) {
        await wrap(root.load())
      }
    } catch {}
  }

  private async runBusy(action: PassmanagerMaintenanceAction, task: () => Promise<void>): Promise<void> {
    if (this.busyAction()) return

    this.busyAction.set(action)
    this.error.set('')
    try {
      await wrap(task())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error.set(message)
      try {
        await wrap(dialogService.showAlertDialog({
          title: i18n('settings:passwords-maintenance-error-title' as never),
          message,
          variant: 'danger',
          confirmText: i18n('button:done'),
        }))
      } catch {}
    } finally {
      this.busyAction.set(null)
    }
  }
}

export const passmanagerMaintenanceModel = new PassmanagerMaintenanceModel()
