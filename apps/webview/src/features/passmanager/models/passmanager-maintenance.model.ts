import {atom, wrap} from '@reatom/core'
import {setCredentialImportService} from '@chromvoid/password-import/ui/import-dialog-state'
import {CredentialImportService} from '@chromvoid/password-import/service'
import {i18n} from '@project/passmanager/i18n'
import {notify} from '@project/passmanager/notify'

import {PassmanagerTransport} from 'root/core/state/passmanager'
import {dialogService} from 'root/shared/services/dialog-service'
import {getAppContext} from 'root/shared/services/app-context'
import {downloadPassmanagerJson} from '../service/passmanager-json-download'
import {pmComponentLoaderModel} from './pm-component-loader.model'
import {pmIconStore} from './pm-icon-store'
import {getPassmanagerRoot} from './pm-root.adapter'

export type PassmanagerMaintenanceAction = 'import' | 'export' | 'clean'

export class PassmanagerMaintenanceModel {
  private importDialogRequest = 0
  private importSessionRevision = 0

  readonly importDialogOpen = atom(false, 'passmanager.maintenance.importDialogOpen')
  readonly importCompletedSuccessfully = atom(false, 'passmanager.maintenance.importCompletedSuccessfully')
  readonly busyAction = atom<PassmanagerMaintenanceAction | null>(null, 'passmanager.maintenance.busyAction')
  readonly error = atom('', 'passmanager.maintenance.error')

  async prepareImport(): Promise<boolean> {
    const revision = this.importSessionRevision
    const {catalog} = getAppContext()
    await wrap(this.refreshCatalog())
    await wrap(pmComponentLoaderModel.ensureExtendedComponents())
    if (revision !== this.importSessionRevision) return false
    setCredentialImportService(new CredentialImportService((command, data) => catalog.transport.rpc(command, data)))
    return true
  }

  disposeImport(): void {
    this.importSessionRevision += 1
    this.closeSettingsImportDialog()
    setCredentialImportService(null)
  }

  async openSettingsImportDialog(): Promise<void> {
    if (this.busyAction()) return
    const request = ++this.importDialogRequest
    await wrap(
      this.runBusy('import', async () => {
        this.importCompletedSuccessfully.set(false)
        const prepared = await wrap(this.prepareImport())
        if (prepared && request === this.importDialogRequest) {
          this.importDialogOpen.set(true)
        }
      }),
    )
  }

  cancelSettingsImportDialogPreparation(): void {
    this.importDialogRequest += 1
  }

  closeSettingsImportDialog(): void {
    this.cancelSettingsImportDialogPreparation()
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
    await wrap(
      this.runBusy('export', async () => {
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
      }),
    )
  }

  async cleanRoot(): Promise<void> {
    await wrap(
      this.runBusy('clean', async () => {
        const confirmed = await wrap(
          dialogService.showConfirmDialog({
            title: i18n('maintenance:clean:confirm:title'),
            message: i18n('maintenance:clean:confirm:text'),
            variant: 'danger',
            confirmVariant: 'danger',
          }),
        )
        if (!confirmed) return

        const transport = new PassmanagerTransport(getAppContext().catalog)
        await wrap(
          transport.importRoot([], [], [], {
            mode: 'replace',
            allowDestructive: true,
            reason: 'settings-maintenance-clean',
          }),
        )
        await wrap(transport.gcIcons())
        pmIconStore.clearMissCache()
        await wrap(this.refreshCatalog())
        await wrap(this.reloadMountedRoot())
        notify.success(i18n('notify:clean:success'))
      }),
    )
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
        await wrap(
          dialogService.showAlertDialog({
            title: i18n('settings:passwords-maintenance-error-title' as never),
            message,
            variant: 'danger',
            confirmText: i18n('button:done'),
          }),
        )
      } catch {}
    } finally {
      this.busyAction.set(null)
    }
  }
}

export const passmanagerMaintenanceModel = new PassmanagerMaintenanceModel()
