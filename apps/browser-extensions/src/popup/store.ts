import {atom, computed} from '@reatom/core'

import type {ProviderStatus, RpcResult} from '@chromvoid/scheme'
import {type Entry, ManagerRoot} from '@project/passmanager'

import {GatewayRpcClient} from '../gateway/rpc-client'
import {PopupMessenger} from '../messenger'
import type {ExtensionTab} from '../runtime/webextension-api'
import {getCurrentTab} from '../utils'
import {i18n} from './i18n'
import {createExtensionManagerSaver} from './manager-saver-adapter'
import {pickOtp} from './otp-selection'
import {resolvePopupStatusError} from './status'

const getURL = (url: string | undefined) => {
  try {
    return new URL(url ?? '')
  } catch {
    return undefined
  }
}

const gateway = new GatewayRpcClient()
const currentTabUrl = atom<string | undefined>(undefined, 'currentTabUrl')
const saver = createExtensionManagerSaver(gateway, () => currentTabUrl())
const passmanager = new ManagerRoot(saver)
const messenger = new PopupMessenger()
const STATUS_CHECK_TIMEOUT_MS = 2500
const LIVE_REFRESH_INTERVAL_MS = 1500

const isRpcSuccess = <T>(value: RpcResult<T>): value is {ok: true; result: T} => {
  return value.ok === true && 'result' in value
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
  })

  const result = await Promise.race([promise, timeoutPromise])
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  return result
}

class Store {
  currentTabURL = atom<ExtensionTab | undefined>(undefined, 'store.currentTabURL')
  error = atom<undefined | string>(undefined, 'store.error')
  isLoading = atom(true, 'store.isLoading')
  pairingInProgress = atom(false, 'store.pairingInProgress')
  gatewayConnected = atom(false, 'store.gatewayConnected')
  gatewayReachable = atom<boolean | undefined>(undefined, 'store.gatewayReachable')
  vaultOpen = atom<boolean | undefined>(undefined, 'store.vaultOpen')
  providerEnabled = atom<boolean | undefined>(undefined, 'store.providerEnabled')
  selectedOtpByEntry = atom<Record<string, string>>({}, 'store.selectedOtpByEntry')
  private allEntries = atom<Entry[]>([], 'store.allEntries')
  private refreshInFlight = false
  private hasLoadedVaultData = false
  private refreshInterval: ReturnType<typeof setInterval> | undefined

  private async refreshGatewayStatus(): Promise<boolean> {
    const status = await withTimeout(
      gateway.call<ProviderStatus>('credential_provider:status', {}, 1500),
      STATUS_CHECK_TIMEOUT_MS,
      {
        ok: false,
        error: 'Gateway status check timeout',
        code: null,
      } satisfies RpcResult<ProviderStatus>,
    )

    if (!isRpcSuccess(status)) {
      this.gatewayConnected.set(false)
      const reachable = await gateway.probeReachable(1200)
      this.gatewayReachable.set(reachable)
      this.vaultOpen.set(undefined)
      this.providerEnabled.set(undefined)
      return false
    }

    this.gatewayConnected.set(true)
    this.gatewayReachable.set(true)
    this.vaultOpen.set(Boolean(status.result.vault_open))
    this.providerEnabled.set(Boolean(status.result.enabled))
    return true
  }

  constructor() {
    void this.initialize()
    this.startLiveRefresh()
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        void this.refreshLiveState()
      })
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.refreshLiveState()
        }
      })
    }
  }

  private resolveStatusError() {
    return resolvePopupStatusError({
      gatewayConnected: this.gatewayConnected(),
      gatewayReachable: this.gatewayReachable(),
      providerEnabled: this.providerEnabled(),
      vaultOpen: this.vaultOpen(),
    })
  }

  private async syncStatusAndData(forceReload: boolean) {
    const previousError = this.error()
    await this.refreshGatewayStatus()

    const statusError = this.resolveStatusError()
    if (statusError) {
      this.error.set(statusError)
      this.hasLoadedVaultData = false
      return
    }

    this.error.set(undefined)
    if (!forceReload && this.hasLoadedVaultData && !previousError) {
      return
    }

    try {
      await passmanager.load()
      this.allEntries.set([...passmanager.allEntries])
      this.hasLoadedVaultData = true
    } catch (error) {
      this.hasLoadedVaultData = false
      this.error.set(error instanceof Error ? error.message : i18n('error.loadSiteData'))
    }
  }

  private startLiveRefresh() {
    if (this.refreshInterval) {
      return
    }
    this.refreshInterval = setInterval(() => {
      void this.refreshLiveState()
    }, LIVE_REFRESH_INTERVAL_MS)
  }

  private async refreshLiveState() {
    if (this.refreshInFlight || this.isLoading() || this.pairingInProgress()) {
      return
    }

    this.refreshInFlight = true
    try {
      await this.loadTab()
      await this.syncStatusAndData(false)
    } finally {
      this.refreshInFlight = false
    }
  }

  private async initialize() {
    this.isLoading.set(true)
    this.error.set(undefined)

    await this.loadTab()
    await this.syncStatusAndData(true)
    this.isLoading.set(false)
  }

  async loadTab() {
    const tab = await getCurrentTab()
    this.currentTabURL.set(tab)
    currentTabUrl.set(getURL(tab?.url)?.toString())
  }

  async pairWithPin(pin: string): Promise<boolean> {
    const normalized = pin.trim()
    if (!/^\d{6}$/.test(normalized)) {
      this.error.set(i18n('error.pinInvalid'))
      return false
    }

    this.pairingInProgress.set(true)
    this.error.set(undefined)

    try {
      const paired = await gateway.pairWithPin(normalized)
      if (!paired) {
        const reachable = await gateway.probeReachable(1200)
        this.gatewayReachable.set(reachable)
        this.error.set(reachable ? i18n('error.pairingFailed') : i18n('error.gatewayUnreachable'))
        return false
      }

      await this.initialize()
      return this.gatewayConnected()
    } finally {
      this.pairingInProgress.set(false)
    }
  }

  tabUrl = computed(() => getURL(this.currentTabURL()?.url), 'store.tabUrl')

  tabHost = computed(() => {
    const url = this.tabUrl()
    if (!url) {
      return ''
    }

    return url.hostname.replace(/^www\./i, '')
  }, 'store.tabHost')

  list = computed(() => {
    const url = this.tabUrl()
    if (!url) {
      return []
    }

    return this.allEntries().filter((item) => item.matchesUrl(url))
  }, 'store.list')

  private isAllowedForCurrentSite(item: Entry) {
    const url = this.tabUrl()
    return Boolean(url && item.matchesUrl(url))
  }

  selectedOtpId(item: Entry): string | undefined {
    const otps = item.otps()
    if (!otps.length) {
      return undefined
    }

    const selectedMap = this.selectedOtpByEntry()
    const selected = selectedMap[item.id]
    const otp = pickOtp(otps, selected)
    return otp?.id
  }

  setSelectedOtp(item: Entry, otpId: string) {
    const selected = pickOtp(item.otps(), otpId)
    if (!selected) {
      return
    }

    const current = this.selectedOtpByEntry()[item.id]
    if (current === selected.id) {
      return
    }

    this.selectedOtpByEntry.set({...this.selectedOtpByEntry(), [item.id]: selected.id})
  }

  async fillData(item: Entry) {
    await this.loadTab()
    if (!this.isAllowedForCurrentSite(item)) {
      return
    }

    const password = await item.password()
    if (!password) {
      return
    }

    await messenger.sendToActiveTab('fill_form', {
      id: item.id,
      username: item.username,
      password,
    })
  }

  async fillOTP(item: Entry, otpId?: string) {
    await this.loadTab()
    if (!this.isAllowedForCurrentSite(item)) {
      return
    }

    const otpEntity = pickOtp(item.otps(), otpId)
    const otp = await otpEntity?.loadCode()
    if (!otp) {
      return
    }

    await messenger.sendToActiveTab('fill_otp', {
      id: item.id,
      username: item.username,
      otp,
    })
  }

  async copyPassword(item: Entry): Promise<string | undefined> {
    await this.loadTab()
    if (!this.isAllowedForCurrentSite(item)) {
      return undefined
    }

    return item.password()
  }

  async copyOtp(item: Entry, otpId?: string): Promise<string | undefined> {
    await this.loadTab()
    if (!this.isAllowedForCurrentSite(item)) {
      return undefined
    }

    const otpEntity = pickOtp(item.otps(), otpId)
    return otpEntity?.loadCode()
  }
}

export const store = new Store()
