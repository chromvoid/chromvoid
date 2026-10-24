import {atom} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import type {RemoteSessionState} from 'root/app/state/store'
import {moduleAccessModel} from 'root/core/modules/module-access.model'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
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
    return moduleAccessModel.isSurfaceOffered('remote-storage')
  }

  supportsRemote(): boolean {
    return moduleAccessModel.isSurfaceOffered('remote')
  }

  supportsExtensions(): boolean {
    return moduleAccessModel.isSurfaceOffered('gateway')
  }

  supportsPasskeys(): boolean {
    return supportsCredentialProviderPasskeysRuntime()
  }

  supportsWallet(): boolean {
    return moduleAccessModel.isSurfaceOffered('wallet')
  }

  vaultLockShortcutLabel(): string | undefined {
    return keyboardShortcutsModel.label('app.vault.lock')
  }

  vaultLockActionLabelKey(): 'navigation:lock' | 'button:disconnect' {
    if (this.isDesktopRemoteSession()) return 'button:disconnect'
    return 'navigation:lock'
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
    return (
      snapshot.surface === 'passwords' &&
      snapshot.passwords?.kind !== 'otp-view' &&
      (!this.isMobileLayout() || snapshot.passwords?.kind !== 'ssh-view')
    )
  }

  isOtpActive(): boolean {
    const snapshot = navigationModel.snapshot()
    return snapshot.surface === 'passwords' && snapshot.passwords?.kind === 'otp-view'
  }

  isSshKeysActive(): boolean {
    const snapshot = navigationModel.snapshot()
    return (
      this.isMobileLayout() && snapshot.surface === 'passwords' && snapshot.passwords?.kind === 'ssh-view'
    )
  }

  isPasskeysActive(): boolean {
    return this.currentSurface() === 'passkeys'
  }

  isWalletActive(): boolean {
    return this.currentSurface() === 'wallet'
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

  openSshKeys(): void {
    navigationModel.openPassmanagerRoute({kind: 'ssh-view'})
    this.closeSidebarOnMobile()
  }

  openPasskeys(): void {
    if (!this.supportsPasskeys()) return
    navigationModel.navigateToSurface('passkeys')
    this.closeSidebarOnMobile()
  }

  openWallet(): void {
    if (!this.supportsWallet()) return
    navigationModel.navigateToSurface('wallet')
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

  private isDesktopRemoteSession(): boolean {
    if (this.isMobileLayout()) return false
    const remoteSessionState = (getAppContext().store as {remoteSessionState?: () => RemoteSessionState})
      .remoteSessionState
    return typeof remoteSessionState === 'function' && remoteSessionState() !== 'inactive'
  }

  isMobileLayout(): boolean {
    return getAppContext().store.layoutMode() === 'mobile'
  }
}

export const navigationRailModel = new NavigationRailModel()
