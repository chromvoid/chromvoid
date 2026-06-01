import {atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {dialogService} from 'root/shared/services/dialog'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

export type AndroidPasskeySummary = {
  credentialIdB64Url: string
  rpId: string
  userName: string
  userDisplayName: string
  signCount: number
  createdAtEpochMs: number
  lastUsedEpochMs: number
}

type AndroidPasskeysListResult = {
  passkeys: AndroidPasskeySummary[]
}

export type AndroidPasskeyGroup = {
  key: string
  rpId: string
  accountLabel: string
  primary: AndroidPasskeySummary
  duplicates: AndroidPasskeySummary[]
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

function androidPasskeyAccountKey(passkey: AndroidPasskeySummary): string {
  return passkey.userName.trim() || passkey.userDisplayName.trim()
}

function androidPasskeyDisplayLabel(passkey: AndroidPasskeySummary): string {
  return passkey.userName.trim() || passkey.userDisplayName.trim() || passkey.rpId
}

function androidPasskeyGroupKey(passkey: AndroidPasskeySummary): string {
  const accountKey = androidPasskeyAccountKey(passkey) || passkey.credentialIdB64Url
  return [encodeURIComponent(passkey.rpId), encodeURIComponent(accountKey)].join(':')
}

function androidPasskeySortValue(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function compareAndroidPasskeys(a: AndroidPasskeySummary, b: AndroidPasskeySummary): number {
  const createdDiff =
    androidPasskeySortValue(b.createdAtEpochMs) - androidPasskeySortValue(a.createdAtEpochMs)
  if (createdDiff !== 0) return createdDiff
  return androidPasskeySortValue(b.lastUsedEpochMs) - androidPasskeySortValue(a.lastUsedEpochMs)
}

function passkeyDebugCredentialLabel(credentialId: string): string {
  if (credentialId.length <= 14) return credentialId
  return `${credentialId.slice(0, 6)}...${credentialId.slice(-6)}`
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

function tracePasskeys(event: string, meta: Record<string, unknown> = {}): void {
  const payload = {
    perf_ms: Math.round(performance.now()),
    ...meta,
  }
  console.info('[passkeys-page]', event, payload)
  writeAndroidUnlockDebug('passkeys-page', event, payload)
}

export function supportsAndroidPasskeysRuntime(): boolean {
  return supportsCredentialProviderPasskeysRuntime()
}

export function supportsCredentialProviderPasskeysRuntime(): boolean {
  const caps = getRuntimeCapabilities()
  return isTauriRuntime() && caps.mobile && Boolean(caps.supports_credential_provider_passkeys_lite)
}

export function groupAndroidPasskeys(passkeys: AndroidPasskeySummary[]): AndroidPasskeyGroup[] {
  const grouped = new Map<string, AndroidPasskeySummary[]>()
  for (const passkey of passkeys) {
    const key = androidPasskeyGroupKey(passkey)
    grouped.set(key, [...(grouped.get(key) ?? []), passkey])
  }

  return [...grouped.entries()]
    .map(([key, values]) => {
      const sorted = [...values].sort(compareAndroidPasskeys)
      const primary = sorted[0]!
      return {
        key,
        rpId: primary.rpId,
        accountLabel: androidPasskeyDisplayLabel(primary),
        primary,
        duplicates: sorted.slice(1),
      }
    })
    .sort((a, b) => compareAndroidPasskeys(a.primary, b.primary))
}

class PasskeysPageModel {
  readonly androidPasskeys = atom<AndroidPasskeySummary[]>([])
  readonly androidPasskeysLoading = atom(false)
  readonly androidPasskeysError = atom<string | null>(null)
  readonly androidPasskeyDeletingCredentialId = atom<string | null>(null)
  readonly androidPasskeyExpandedGroupKeys = atom<Set<string>>(new Set<string>())
  readonly androidPasskeyGroups = computed(() => groupAndroidPasskeys(this.androidPasskeys()))

  private androidPasskeysRefreshId = 0
  private androidPasskeysLoadingRefreshId = 0

  isAvailable(): boolean {
    return supportsCredentialProviderPasskeysRuntime()
  }

  async load(): Promise<void> {
    await this.refreshAndroidPasskeys()
  }

  goBack(): void {
    navigationModel.goBack()
  }

  async refreshAndroidPasskeys(options: {showLoading?: boolean} = {}): Promise<void> {
    const refreshId = ++this.androidPasskeysRefreshId
    if (!this.isAvailable()) {
      this.androidPasskeys.set([])
      this.androidPasskeysLoading.set(false)
      this.androidPasskeysLoadingRefreshId = 0
      this.androidPasskeysError.set(null)
      return
    }

    const showLoading = options.showLoading ?? true
    const startedAt = performance.now()
    tracePasskeys('list:start', {show_loading: showLoading})
    if (showLoading) {
      this.androidPasskeysLoadingRefreshId = refreshId
      this.androidPasskeysLoading.set(true)
    }
    this.androidPasskeysError.set(null)
    try {
      const res = await wrap(
        tauriInvoke<RpcResult<AndroidPasskeysListResult>>(
          'credential_provider_passkeys_list',
        ),
      )
      if (this.androidPasskeysRefreshId !== refreshId) return
      if (!isOk(res)) {
        throw new Error(res.error || i18n('passkeys:list-failed'))
      }
      this.androidPasskeys.set(Array.isArray(res.result.passkeys) ? res.result.passkeys : [])
      tracePasskeys('list:done', {
        dt_ms: elapsedMs(startedAt),
        count: this.androidPasskeys().length,
      })
    } catch (error) {
      if (this.androidPasskeysRefreshId !== refreshId) return
      const message = error instanceof Error ? error.message : i18n('passkeys:list-failed')
      console.warn('Failed to query Android passkeys', error)
      this.androidPasskeys.set([])
      this.androidPasskeysError.set(message)
      tracePasskeys('list:error', {
        dt_ms: elapsedMs(startedAt),
        error: message,
      })
    } finally {
      if (showLoading && this.androidPasskeysLoadingRefreshId === refreshId) {
        this.androidPasskeysLoading.set(false)
        this.androidPasskeysLoadingRefreshId = 0
      }
    }
  }

  async deletePasskey(credentialId: string): Promise<void> {
    if (!this.isAvailable()) return
    const deleteStartedAt = performance.now()
    const normalizedCredentialId = credentialId.trim()
    if (!normalizedCredentialId) return
    const credential = passkeyDebugCredentialLabel(normalizedCredentialId)
    tracePasskeys('delete:requested', {credential})
    const passkey = this.androidPasskeys().find((item) => item.credentialIdB64Url === normalizedCredentialId)
    if (passkey) {
      const isDuplicate = groupAndroidPasskeys(this.androidPasskeys()).some((group) =>
        group.duplicates.some((duplicate) => duplicate.credentialIdB64Url === normalizedCredentialId),
      )
      const confirmStartedAt = performance.now()
      tracePasskeys('delete:confirm:start', {
        credential,
        duplicate: isDuplicate,
        rp_id: passkey.rpId,
      })
      const confirmed = await wrap(this.confirmAndroidPasskeyDelete(passkey))
      tracePasskeys('delete:confirm:resolved', {
        credential,
        duplicate: isDuplicate,
        confirmed,
        dt_ms: elapsedMs(confirmStartedAt),
        total_dt_ms: elapsedMs(deleteStartedAt),
      })
      if (!confirmed) return
    }

    this.androidPasskeyDeletingCredentialId.set(normalizedCredentialId)
    this.androidPasskeysError.set(null)
    try {
      const nativeStartedAt = performance.now()
      tracePasskeys('delete:native:start', {
        credential,
        total_dt_ms: elapsedMs(deleteStartedAt),
      })
      const res = await wrap(
        tauriInvoke<RpcResult<{deleted: boolean}>>(
          'credential_provider_passkey_delete',
          {
            credentialId: normalizedCredentialId,
          },
        ),
      )
      tracePasskeys('delete:native:done', {
        credential,
        ok: isOk(res),
        deleted: isOk(res) ? res.result.deleted : false,
        dt_ms: elapsedMs(nativeStartedAt),
        total_dt_ms: elapsedMs(deleteStartedAt),
      })
      if (!isOk(res) || !res.result.deleted) {
        throw new Error(isOk(res) ? i18n('passkeys:delete-failed') : res.error)
      }
      this.androidPasskeys.set(
        this.androidPasskeys().filter((item) => item.credentialIdB64Url !== normalizedCredentialId),
      )
      getAppContext().store.pushNotification('success', i18n('passkeys:delete-success'))
      void this.refreshAndroidPasskeys({showLoading: false}).then(
        () =>
          tracePasskeys('delete:refresh:done', {
            credential,
            total_dt_ms: elapsedMs(deleteStartedAt),
          }),
        (error) =>
          tracePasskeys('delete:refresh:error', {
            credential,
            total_dt_ms: elapsedMs(deleteStartedAt),
            error: error instanceof Error ? error.message : String(error),
          }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : i18n('passkeys:delete-failed')
      console.warn('Failed to delete Android passkey', error)
      this.androidPasskeysError.set(message)
      getAppContext().store.pushNotification('error', message)
      tracePasskeys('delete:error', {
        credential,
        dt_ms: elapsedMs(deleteStartedAt),
        error: message,
      })
    } finally {
      if (this.androidPasskeyDeletingCredentialId() === normalizedCredentialId) {
        this.androidPasskeyDeletingCredentialId.set(null)
      }
      tracePasskeys('delete:finished', {
        credential,
        dt_ms: elapsedMs(deleteStartedAt),
      })
    }
  }

  androidPasskeyDisplayName(passkey: AndroidPasskeySummary): string {
    return androidPasskeyDisplayLabel(passkey)
  }

  androidPasskeyShortCredentialId(passkey: AndroidPasskeySummary): string {
    const id = passkey.credentialIdB64Url
    if (id.length <= 16) return id
    return `${id.slice(0, 8)}...${id.slice(-6)}`
  }

  androidPasskeyLastUsedLabel(passkey: AndroidPasskeySummary): string {
    if (!Number.isFinite(passkey.lastUsedEpochMs) || passkey.lastUsedEpochMs <= 0) {
      return i18n('passkeys:last-used-never')
    }
    return this.androidPasskeyDateLabel(passkey.lastUsedEpochMs)
  }

  androidPasskeyCreatedLabel(passkey: AndroidPasskeySummary): string {
    if (!Number.isFinite(passkey.createdAtEpochMs) || passkey.createdAtEpochMs <= 0) {
      return i18n('passkeys:created-unknown')
    }
    return this.androidPasskeyDateLabel(passkey.createdAtEpochMs)
  }

  androidPasskeySignCountLabel(passkey: AndroidPasskeySummary): string {
    return Number.isFinite(passkey.signCount) ? String(passkey.signCount) : '0'
  }

  androidPasskeyStorageLabel(): string {
    return i18n('passkeys:storage-vault')
  }

  androidPasskeyDeleteActionLabel(): string {
    return i18n('passkeys:delete-vault')
  }

  androidPasskeyIsDeleting(passkey: AndroidPasskeySummary): boolean {
    return this.androidPasskeyDeletingCredentialId() === passkey.credentialIdB64Url
  }

  isAndroidPasskeyGroupExpanded(groupKey: string): boolean {
    return this.androidPasskeyExpandedGroupKeys().has(groupKey)
  }

  toggleAndroidPasskeyGroup(groupKey: string): void {
    const next = new Set(this.androidPasskeyExpandedGroupKeys())
    if (next.has(groupKey)) {
      next.delete(groupKey)
    } else {
      next.add(groupKey)
    }
    this.androidPasskeyExpandedGroupKeys.set(next)
  }

  private androidPasskeyDateLabel(epochMs: number): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(epochMs))
  }

  private async confirmAndroidPasskeyDelete(passkey: AndroidPasskeySummary): Promise<boolean> {
    return dialogService.showConfirmDialog({
      title: i18n('passkeys:delete-vault-confirm-title'),
      message: i18n('passkeys:delete-vault-confirm-message', {
        account: this.androidPasskeyDisplayName(passkey),
        rpId: passkey.rpId,
      }),
      confirmText: i18n('passkeys:delete-vault-confirm-action'),
      cancelText: i18n('button:cancel'),
      confirmVariant: 'danger',
      variant: 'danger',
      size: 'm',
    })
  }
}

export const passkeysPageModel = new PasskeysPageModel()
