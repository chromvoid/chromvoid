import {state} from '@statx/core'

import {ManagerRoot, bindPMTheme, syncUiModeWithQuery} from '@project/passmanager'
import type {ManagerSaver} from '@project/passmanager'
import {Entry, Group} from '@project/passmanager'
import {i18n, copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS, notify} from '@project/passmanager'
import {announce} from '@chromvoid/ui'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {defaultLogger} from 'root/core/logger'
import {
  createCatalogOperationsAdapter,
  buildExistingEntriesByOriginalId,
} from './service/catalog-import-adapter'
import type {ImportProgress} from '@chromvoid/password-import'
import {setImportCatalogOps, setExistingEntriesMap} from '@chromvoid/password-import'
import {pmIconStore} from './models/pm-icon-store'
import {
  finishAndroidPasswordSave,
  hasActiveAndroidPasswordSaveToken,
  hasAndroidPasswordSavePrefill,
} from './models/android-password-save-prefill'
import {passmanagerNavigationController} from './passmanager-navigation.controller'

function describeShowElement(showElement: ReturnType<typeof window.passmanager.showElement> | undefined): string {
  if (showElement instanceof Entry) return `entry:${showElement.id}`
  if (showElement instanceof Group) return `group:${showElement.id}`
  if (showElement instanceof ManagerRoot) return `root:${showElement.id}`
  if (
    typeof showElement === 'object' &&
    showElement !== null &&
    'showElement' in showElement &&
    'isEditMode' in showElement
  ) {
    return 'root-like'
  }
  if (showElement === undefined) return 'undefined'
  return String(showElement)
}

export class PasswordManagerModel {
  managerSaver!: ManagerSaver

  readonly alive = state(false)

  private readonly logger = defaultLogger
  private _unbindTheme?: () => void

  init(): void {
    if (this.alive()) return

    window.passmanager = new ManagerRoot(this.managerSaver)
    window.passmanager.load()
    passmanagerNavigationController.reset()
    navigationModel.attachPassmanager(window.passmanager)

    try {
      syncUiModeWithQuery()
    } catch {}

    this._unbindTheme = bindPMTheme()

    this.alive.set(true)

    if (hasAndroidPasswordSavePrefill()) {
      passmanagerNavigationController.openCreateEntry()
    }
  }

  cleanup(): void {
    if (!this.alive()) return

    if (hasActiveAndroidPasswordSaveToken()) {
      void finishAndroidPasswordSave('dismissed')
    }

    window.passmanager?.clean()
    // @ts-ignore
    window.passmanager = undefined
    pmIconStore.dispose()
    navigationModel.detachPassmanager()

    this._unbindTheme?.()
    this._unbindTheme = undefined

    this.alive.set(false)
  }

  openItem(item: Entry | Group): void {
    passmanagerNavigationController.openItem(item)
  }

  consumeRestoreSelection(containerId: string): string | undefined {
    return passmanagerNavigationController.consumeRestoreSelection(containerId)
  }

  goBackFromCurrent(): boolean {
    const current = window.passmanager.showElement()
    const route = passmanagerNavigationController.readRoute()
    this.logger.debug('[PassManager][Nav] goBackFromCurrent begin', {
      current: describeShowElement(current),
      isEditMode: window.passmanager.isEditMode(),
      route,
    })

    const handled = passmanagerNavigationController.goBackFromCurrent()
    this.logger.debug('[PassManager][Nav] goBackFromCurrent result', {
      handled,
      next: describeShowElement(window.passmanager.showElement()),
      route: passmanagerNavigationController.readRoute(),
    })
    if (handled && route.kind === 'create-entry' && hasActiveAndroidPasswordSaveToken()) {
      void finishAndroidPasswordSave('dismissed')
    }
    return handled
  }

  onCreateEntry(): void {
    passmanagerNavigationController.openCreateEntry()
  }

  onCreateGroup(): void {
    passmanagerNavigationController.openCreateGroup()
  }

  onExport(): void {
    window.passmanager.export()
  }

  onFullClean(): void {
    window.passmanager.fullClean()
  }

  async onImport(): Promise<void> {
    const catalog = window.catalog

    try {
      await catalog.refreshSilent()
    } catch {
      catalog.queueRefresh(150)
    }

    const catalogOps = createCatalogOperationsAdapter(catalog)
    setImportCatalogOps(catalogOps)

    const existingMap = await buildExistingEntriesByOriginalId(catalog)
    setExistingEntriesMap(existingMap)

    passmanagerNavigationController.openImport()
  }

  async handleImportComplete(e: Event): Promise<void> {
    const detail = (e as CustomEvent).detail as {success: boolean; progress: ImportProgress}
    if (detail.success) {
      pmIconStore.clearMissCache()
      notify.success(i18n('notify:import:success'))
    }

    const catalog = window.catalog
    if (catalog) {
      try {
        await catalog.refreshSilent()
      } catch {
        catalog.queueRefresh(150)
      }
    }

    try {
      await window.passmanager.load()
    } catch {}
  }

  handleImportClose(): void {
    passmanagerNavigationController.closeImport()
  }

  async copyCurrentPassword(): Promise<void> {
    const selected = window.passmanager?.showElement()
    if (!(selected instanceof Entry)) return
    try {
      const pwd = await selected.password()
      await copyWithAutoWipe(pwd ?? '', DEFAULT_CLIPBOARD_WIPE_MS)
      try {
        announce('Пароль скопирован', 'polite')
      } catch {}
    } catch {
      try {
        announce('Не удалось скопировать пароль', 'assertive')
      } catch {}
    }
  }
}

export const pmModel = new PasswordManagerModel()
