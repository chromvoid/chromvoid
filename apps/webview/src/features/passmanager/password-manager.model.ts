import {atom} from '@reatom/core'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {syncUiModeWithQuery} from '@project/passmanager/flags'
import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'
import type {ManagerSaver} from '@project/passmanager/types'
import {announce} from '@chromvoid/ui'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {defaultLogger} from 'root/core/logger'
import {i18n as appI18n} from 'root/i18n'
import {pmIconStore} from './models/pm-icon-store'
import {
  finishAndroidPasswordSave,
  hasActiveAndroidPasswordSaveToken,
  hasAndroidPasswordSavePrefill,
} from './models/android-password-save-prefill'
import {pmActiveRowModel} from './models/pm-active-row.model'
import {pmEntryEditorModel} from './models/pm-entry-editor.model'
import {pmMobileSelectionModel} from './models/pm-mobile-selection.model'
import {pmCredentialSecurityAuditModel} from './models/pm-credential-security-audit.model'
import {
  clearPassmanagerRoot,
  getPassmanagerRoot,
  getPassmanagerShowElement,
  passmanagerRoot,
  setPassmanagerRoot,
  type PMRootShowElement,
} from './models/pm-root.adapter'
import {passmanagerMaintenanceModel} from './models/passmanager-maintenance.model'
import {passmanagerNavigationController} from './passmanager-navigation.controller'
import {initPassmanagerDialogAdapter} from './service/passmanager-dialog-adapter'

function describeShowElement(showElement: PMRootShowElement): string {
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

function shouldExposePassmanagerRootForDebug(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return window.env === 'dev' || host === 'localhost' || host === '127.0.0.1'
}

export class PasswordManagerModel {
  managerSaver!: ManagerSaver

  readonly alive = atom(false)
  readonly root = passmanagerRoot

  private readonly logger = defaultLogger

  init(): void {
    if (this.alive()) return

    pmActiveRowModel.clearAll()
    pmMobileSelectionModel.exit()
    initPassmanagerDialogAdapter()
    const root = new ManagerRoot(this.managerSaver)
    setPassmanagerRoot(root)
    pmCredentialSecurityAuditModel.attachRoot(root)
    this.exposeRootForDebug(root)
    root.load()
    passmanagerNavigationController.reset()
    navigationModel.attachPassmanager(root)

    try {
      syncUiModeWithQuery()
    } catch {}

    this.alive.set(true)

    if (hasAndroidPasswordSavePrefill()) {
      passmanagerNavigationController.openCreateEntry()
    }
  }

  cleanup(): void {
    if (!this.alive()) return

    pmActiveRowModel.clearAll()
    pmMobileSelectionModel.exit()
    if (hasActiveAndroidPasswordSaveToken()) {
      void finishAndroidPasswordSave('dismissed')
    }

    getPassmanagerRoot()?.clean()
    pmCredentialSecurityAuditModel.dispose()
    this.clearDebugRoot()
    clearPassmanagerRoot()
    pmIconStore.dispose()
    navigationModel.detachPassmanager()

    this.alive.set(false)
  }

  private exposeRootForDebug(root: ManagerRoot): void {
    if (!shouldExposePassmanagerRootForDebug()) return
    ;(window as Window & {passmanager?: ManagerRoot}).passmanager = root
  }

  private clearDebugRoot(): void {
    if (typeof window === 'undefined') return
    const debugWindow = window as Window & {passmanager?: ManagerRoot}
    if (debugWindow.passmanager === getPassmanagerRoot()) {
      Reflect.deleteProperty(debugWindow, 'passmanager')
    }
  }

  openItem(item: Entry | Group): void {
    passmanagerNavigationController.openItem(item)
  }

  openOtpView(): void {
    navigationModel.openPassmanagerRoute({kind: 'otp-view'})
  }

  consumeRestoreSelection(containerId: string): string | undefined {
    return passmanagerNavigationController.consumeRestoreSelection(containerId)
  }

  goBackFromCurrent(): boolean {
    const current = getPassmanagerShowElement()
    const route = passmanagerNavigationController.readRoute()
    this.logger.debug('[PassManager][Nav] goBackFromCurrent begin', {
      current: describeShowElement(current),
      hasActiveEntryEditor: pmEntryEditorModel.active(),
      route,
    })

    const handled = passmanagerNavigationController.goBackFromCurrent()
    this.logger.debug('[PassManager][Nav] goBackFromCurrent result', {
      handled,
      next: describeShowElement(getPassmanagerShowElement()),
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
    void passmanagerMaintenanceModel.exportRoot()
  }

  onFullClean(): void {
    void passmanagerMaintenanceModel.cleanRoot()
  }

  async onImport(): Promise<void> {
    await passmanagerMaintenanceModel.prepareImport()
    passmanagerNavigationController.openImport()
  }

  async handleImportComplete(e: Event): Promise<void> {
    await passmanagerMaintenanceModel.handleImportComplete(e)
  }

  handleImportClose(): void {
    passmanagerNavigationController.closeImport()
  }

  async copyCurrentPassword(): Promise<void> {
    const selected = getPassmanagerShowElement()
    if (!(selected instanceof Entry)) return
    try {
      const pwd = selected.entryType === 'payment_card' ? await selected.cardPan() : await selected.password()
      if (!pwd) {
        throw new Error('Secret is unavailable')
      }
      await copyWithAutoWipe(pwd, DEFAULT_CLIPBOARD_WIPE_MS)
      try {
        announce(appI18n('password-manager:password-copied' as any), 'polite')
      } catch {}
    } catch {
      try {
        announce(appI18n('password-manager:password-copy-failed' as any), 'assertive')
      } catch {}
    }
  }
}

export const pmModel = new PasswordManagerModel()
