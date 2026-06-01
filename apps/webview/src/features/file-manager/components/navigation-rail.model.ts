import {atom} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {moduleAccessModel, type ModuleAccessState} from 'root/core/pro/module-access.model'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {getAppContext} from 'root/shared/services/app-context'
import {lockVaultFromUi} from 'root/shared/services/vault-lock'
import {supportsCredentialProviderPasskeysRuntime} from 'root/routes/passkeys/passkeys.model'

class NavigationRailModel {
  readonly expanded = atom(false)

  isExpanded(): boolean {
    if (this.isMobileLayout()) {
      return true
    }

    return this.expanded()
  }

  canToggleExpanded(): boolean {
    return !this.isMobileLayout()
  }

  currentSurface() {
    return navigationModel.currentSurface()
  }

  theme() {
    return getAppContext().store.theme()
  }

  supportsStorage(): boolean {
    return moduleAccessModel.isSurfaceVisible('remote-storage')
  }

  supportsRemote(): boolean {
    return moduleAccessModel.isSurfaceVisible('remote')
  }

  supportsExtensions(): boolean {
    return moduleAccessModel.isSurfaceVisible('gateway')
  }

  supportsPasskeys(): boolean {
    return supportsCredentialProviderPasskeysRuntime()
  }

  storageAccess(): ModuleAccessState {
    return moduleAccessModel.featureAccess('mounted-vault')
  }

  remoteAccess(): ModuleAccessState {
    return moduleAccessModel.featureAccess('remote')
  }

  extensionsAccess(): ModuleAccessState {
    return moduleAccessModel.featureAccess('browser-extension')
  }

  isLocked(access: ModuleAccessState): boolean {
    return access.status !== 'enabled'
  }

  commandPaletteShortcutLabel(): string | undefined {
    return keyboardShortcutsModel.label('app.commandPalette.open')
  }

  vaultLockShortcutLabel(): string | undefined {
    return keyboardShortcutsModel.label('app.vault.lock')
  }

  isVaultLockPending(): boolean {
    const pending = (getAppContext().store as {vaultLockPending?: () => boolean}).vaultLockPending
    return typeof pending === 'function' ? pending() : false
  }

  isFilesActive(): boolean {
    return this.currentSurface() === 'files'
  }

  isNotesActive(): boolean {
    return this.currentSurface() === 'notes'
  }

  isPasswordsActive(): boolean {
    const snapshot = navigationModel.snapshot()
    return snapshot.surface === 'passwords' && snapshot.passwords?.kind !== 'otp-view'
  }

  isOtpActive(): boolean {
    const snapshot = navigationModel.snapshot()
    return snapshot.surface === 'passwords' && snapshot.passwords?.kind === 'otp-view'
  }

  isPasskeysActive(): boolean {
    return this.currentSurface() === 'passkeys'
  }

  isStorageActive(): boolean {
    return this.currentSurface() === 'remote-storage'
  }

  isRemoteActive(): boolean {
    return this.currentSurface() === 'remote'
  }

  isExtensionsActive(): boolean {
    return this.currentSurface() === 'gateway'
  }

  isSettingsActive(): boolean {
    return this.currentSurface() === 'settings'
  }

  toggleExpanded(): void {
    if (!this.canToggleExpanded()) {
      return
    }

    this.expanded.set(!this.expanded())
  }

  toggleTheme(): void {
    getAppContext().store.switchTheme()
  }

  openCommandPalette(): void {
    openCommandPalette({mode: 'all', source: 'rail'})
    this.closeSidebarOnMobile()
  }

  openFiles(): void {
    navigationModel.navigateToSurface('files')
    this.closeSidebarOnMobile()
  }

  openNotes(): void {
    navigationModel.navigateToSurface('notes')
    this.closeSidebarOnMobile()
  }

  openPasswords(): void {
    navigationModel.navigateToSurface('passwords')
    this.closeSidebarOnMobile()
  }

  openOtpCodes(): void {
    navigationModel.openPassmanagerRoute({kind: 'otp-view'})
    this.closeSidebarOnMobile()
  }

  openPasskeys(): void {
    if (!this.supportsPasskeys()) return
    navigationModel.navigateToSurface('passkeys')
    this.closeSidebarOnMobile()
  }

  openStorage(): void {
    if (!this.supportsStorage()) return
    navigationModel.navigateToSurface('remote-storage')
    this.closeSidebarOnMobile()
  }

  openRemote(): void {
    if (!this.supportsRemote()) return
    navigationModel.navigateToSurface('remote')
    this.closeSidebarOnMobile()
  }

  openExtensions(): void {
    if (!this.supportsExtensions()) return
    navigationModel.navigateToSurface('gateway')
    this.closeSidebarOnMobile()
  }

  openSettings(): void {
    navigationModel.navigateToSurface('settings')
    this.closeSidebarOnMobile()
  }

  async lockVault(): Promise<void> {
    if (this.isVaultLockPending()) return
    this.closeSidebarOnMobile()
    await lockVaultFromUi()
  }

  private closeSidebarOnMobile(): void {
    const {store} = getAppContext()
    if (store.layoutMode() === 'mobile' && store.sidebarOpen()) {
      store.setSidebarOpen(false)
    }
  }

  isMobileLayout(): boolean {
    return getAppContext().store.layoutMode() === 'mobile'
  }
}

export const navigationRailModel = new NavigationRailModel()
