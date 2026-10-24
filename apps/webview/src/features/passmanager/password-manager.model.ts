import {atom, wrap} from '@reatom/core'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {syncUiModeWithQuery} from '@project/passmanager/flags'
import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'
import type {ManagerSaver} from '@project/passmanager/types'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {defaultLogger} from 'root/core/logger'
import {i18n as appI18n} from 'root/i18n'
import {toast} from 'root/shared/services/toast-manager'
import {subscribeAfterInitial, type Unsubscribe} from 'root/shared/services/subscribed-signal'
import {pmIconStore} from './models/pm-icon-store'
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
  private managerSaver?: ManagerSaver

  readonly alive = atom(false, 'passmanager.sessionAlive')
  readonly sessionStatus = atom<PassmanagerSessionStatus>('inactive', 'passmanager.sessionStatus')
  readonly root = passmanagerRoot

  private readonly logger = defaultLogger
  private sessionKey: string | null = null
  private sessionGeneration = 0
  private settlementPromise: Promise<PassmanagerSessionStatus> | null = null
  private settleSession: ((status: PassmanagerSessionStatus) => void) | null = null
  private rootUnsubscribers: Unsubscribe[] = []

  configure(managerSaver: ManagerSaver): void {
    if (this.managerSaver === managerSaver) return
    if (this.alive()) this.disposeSession()
    this.managerSaver = managerSaver
  }

  prepareSession(sessionKey: string): Promise<PassmanagerSessionStatus> {
    if (!this.managerSaver) {
      this.sessionStatus.set('error')
      return Promise.resolve('error')
    }

    if (this.sessionKey === sessionKey && this.alive()) {
      return this.whenSessionSettled()
    }

    this.disposeSession()
    this.sessionKey = sessionKey
    const generation = this.sessionGeneration
    const root = this.createSessionRoot(this.managerSaver)
    this.beginSettlement()
    this.sessionStatus.set('loading')
    this.observeRootSettlement(root, generation)
    void this.loadSessionRoot(root, generation)

    return this.whenSessionSettled()
  }

  whenSessionSettled(): Promise<PassmanagerSessionStatus> {
    if (this.settlementPromise) return this.settlementPromise
    if (this.sessionStatus() !== 'inactive') return Promise.resolve(this.sessionStatus())

    return Promise.resolve().then(() => this.settlementPromise ?? this.sessionStatus())
  }

  retrySessionLoad(): Promise<PassmanagerSessionStatus> {
    const root = getPassmanagerRoot()
    if (!root || !this.sessionKey) return Promise.resolve(this.sessionStatus())
    if (this.sessionStatus() === 'loading') return this.whenSessionSettled()

    const generation = this.sessionGeneration
    this.beginSettlement()
    this.sessionStatus.set('loading')
    void this.loadSessionRoot(root, generation)
    return this.whenSessionSettled()
  }

  init(): void {
    if (this.alive()) return
    void this.prepareSession('legacy-component-session')
  }

  cleanup(): void {
    this.disposeSession()
  }

  deactivateSurface(): void {
    pmActiveRowModel.clearAll()
    pmMobileSelectionModel.exit()
  }

  disposeSession(): void {
    passmanagerMaintenanceModel.disposeImport()
    this.sessionGeneration += 1
    this.clearRootSubscriptions()
    this.settleCurrentSession('inactive')
    this.sessionKey = null

    if (!this.alive()) return

    this.deactivateSurface()

    getPassmanagerRoot()?.clean()
    pmCredentialSecurityAuditModel.dispose()
    this.clearDebugRoot()
    clearPassmanagerRoot()
    pmIconStore.dispose()
    navigationModel.detachPassmanager()

    this.alive.set(false)
  }

  private createSessionRoot(managerSaver: ManagerSaver): ManagerRoot {
    pmActiveRowModel.clearAll()
    pmMobileSelectionModel.exit()
    initPassmanagerDialogAdapter()
    const root = new ManagerRoot(managerSaver)
    setPassmanagerRoot(root)
    pmCredentialSecurityAuditModel.attachRoot(root)
    this.exposeRootForDebug(root)
    passmanagerNavigationController.reset()
    navigationModel.attachPassmanager(root)

    try {
      syncUiModeWithQuery()
    } catch {}

    this.alive.set(true)

    return root
  }

  private observeRootSettlement(root: ManagerRoot, generation: number): void {
    const reconcile = () => this.reconcileRootSettlement(root, generation)
    this.rootUnsubscribers = [
      subscribeAfterInitial(root.entries, reconcile),
      subscribeAfterInitial(root.isLoading, reconcile),
    ]
  }

  private async loadSessionRoot(root: ManagerRoot, generation: number): Promise<void> {
    try {
      await wrap(root.load())
    } catch (error) {
      if (this.isCurrentSession(root, generation)) {
        this.logger.error('[PassManager][Session] root load failed', error)
        this.settleCurrentSession('error')
      }
      return
    }

    this.reconcileRootSettlement(root, generation)
  }

  private reconcileRootSettlement(root: ManagerRoot, generation: number): void {
    if (!this.isCurrentSession(root, generation)) return
    if (root.entries() !== undefined) {
      this.settleCurrentSession('ready')
      return
    }
    if (!root.isLoading()) {
      this.settleCurrentSession('error')
    }
  }

  private isCurrentSession(root: ManagerRoot, generation: number): boolean {
    return generation === this.sessionGeneration && getPassmanagerRoot() === root
  }

  private beginSettlement(): void {
    this.settlementPromise = new Promise<PassmanagerSessionStatus>((resolve) => {
      this.settleSession = resolve
    })
  }

  private settleCurrentSession(status: PassmanagerSessionStatus): void {
    this.sessionStatus.set(status)
    this.settleSession?.(status)
    this.settleSession = null
    this.settlementPromise = null
  }

  private clearRootSubscriptions(): void {
    for (const unsubscribe of this.rootUnsubscribers.splice(0)) unsubscribe()
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

  openSshView(): void {
    navigationModel.openPassmanagerRoute({kind: 'ssh-view'})
  }

  openEnvRuntimeView(): void {
    navigationModel.openPassmanagerRoute({kind: 'env-runtime-view'})
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
    return handled
  }

  onCreateEntry(): void {
    passmanagerNavigationController.openCreateEntry()
  }

  onCreateGroup(): void {
    passmanagerNavigationController.openCreateGroup()
  }

  onCreateTopLevelGroup(): void {
    passmanagerNavigationController.openCreateGroup(null)
  }

  onExport(): void {
    void passmanagerMaintenanceModel.exportRoot()
  }

  onFullClean(): void {
    void passmanagerMaintenanceModel.cleanRoot()
  }

  async onImport(): Promise<void> {
    if (await passmanagerMaintenanceModel.prepareImport()) {
      passmanagerNavigationController.openImport()
    }
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
      toast.success(appI18n('password-manager:password-copied' as any), undefined, {
        key: 'passmanager.clipboard.copy',
      })
    } catch {
      toast.show({
        key: 'passmanager.clipboard.copy',
        message: appI18n('password-manager:password-copy-failed' as any),
        variant: 'error',
      })
    }
  }
}

export type PassmanagerSessionStatus = 'inactive' | 'loading' | 'ready' | 'error'

export const pmModel = new PasswordManagerModel()
