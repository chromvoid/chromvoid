import {atom, computed, wrap} from '@reatom/core'

import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {dialogService} from 'root/shared/services/dialog'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

export type PasskeySummary = {
  credentialIdB64Url: string
  rpId: string
  userName: string
  userDisplayName: string
  signCount: number
  createdAtEpochMs: number
  lastUsedEpochMs: number
}

type PasskeysListResult = {
  passkeys: PasskeySummary[]
}

export type PasskeyGroup = {
  key: string
  rpId: string
  accountLabel: string
  primary: PasskeySummary
  duplicates: PasskeySummary[]
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

function passkeyAccountKey(passkey: PasskeySummary): string {
  return passkey.userName.trim() || passkey.userDisplayName.trim()
}

function passkeyDisplayLabel(passkey: PasskeySummary): string {
  return passkey.userName.trim() || passkey.userDisplayName.trim() || passkey.rpId
}

function passkeyGroupKey(passkey: PasskeySummary): string {
  const accountKey = passkeyAccountKey(passkey) || passkey.credentialIdB64Url
  return [encodeURIComponent(passkey.rpId), encodeURIComponent(accountKey)].join(':')
}

function passkeySortValue(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function comparePasskeys(a: PasskeySummary, b: PasskeySummary): number {
  const createdDiff = passkeySortValue(b.createdAtEpochMs) - passkeySortValue(a.createdAtEpochMs)
  if (createdDiff !== 0) return createdDiff
  return passkeySortValue(b.lastUsedEpochMs) - passkeySortValue(a.lastUsedEpochMs)
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

export function supportsCredentialProviderPasskeysRuntime(): boolean {
  return isTauriRuntime() && runtimeCapabilitiesAtom().supports_credential_provider_passkeys_lite
}

export function groupPasskeys(passkeys: PasskeySummary[]): PasskeyGroup[] {
  const grouped = new Map<string, PasskeySummary[]>()
  for (const passkey of passkeys) {
    const key = passkeyGroupKey(passkey)
    grouped.set(key, [...(grouped.get(key) ?? []), passkey])
  }

  return [...grouped.entries()]
    .map(([key, values]) => {
      const sorted = [...values].sort(comparePasskeys)
      const primary = sorted[0]!
      return {
        key,
        rpId: primary.rpId,
        accountLabel: passkeyDisplayLabel(primary),
        primary,
        duplicates: sorted.slice(1),
      }
    })
    .sort((a, b) => comparePasskeys(a.primary, b.primary))
}

class PasskeysPageModel {
  readonly passkeys = atom<PasskeySummary[]>([])
  readonly passkeysLoading = atom(false)
  readonly passkeysError = atom<string | null>(null)
  readonly passkeyDeletingCredentialId = atom<string | null>(null)
  readonly passkeyExpandedGroupKeys = atom<Set<string>>(new Set<string>())
  readonly passkeyGroups = computed(() => groupPasskeys(this.passkeys()))

  private passkeysRefreshId = 0
  private passkeysLoadingRefreshId = 0

  isAvailable(): boolean {
    return supportsCredentialProviderPasskeysRuntime()
  }

  async load(): Promise<void> {
    await this.refreshPasskeys()
  }

  async refreshPasskeys(options: {showLoading?: boolean} = {}): Promise<void> {
    const refreshId = ++this.passkeysRefreshId
    if (!this.isAvailable()) {
      this.passkeys.set([])
      this.passkeysLoading.set(false)
      this.passkeysLoadingRefreshId = 0
      this.passkeysError.set(null)
      return
    }

    const showLoading = options.showLoading ?? true
    const startedAt = performance.now()
    tracePasskeys('list:start', {show_loading: showLoading})
    if (showLoading) {
      this.passkeysLoadingRefreshId = refreshId
      this.passkeysLoading.set(true)
    }
    this.passkeysError.set(null)
    try {
      const res = await wrap(tauriInvoke<RpcResult<PasskeysListResult>>('credential_provider_passkeys_list'))
      if (this.passkeysRefreshId !== refreshId) return
      if (!isOk(res)) {
        throw new Error(res.error || i18n('passkeys:list-failed'))
      }
      this.passkeys.set(Array.isArray(res.result.passkeys) ? res.result.passkeys : [])
      tracePasskeys('list:done', {
        dt_ms: elapsedMs(startedAt),
        count: this.passkeys().length,
      })
    } catch (error) {
      if (this.passkeysRefreshId !== refreshId) return
      const message = error instanceof Error ? error.message : i18n('passkeys:list-failed')
      console.warn('Failed to query credential provider passkeys', error)
      this.passkeys.set([])
      this.passkeysError.set(message)
      tracePasskeys('list:error', {
        dt_ms: elapsedMs(startedAt),
        error: message,
      })
    } finally {
      if (showLoading && this.passkeysLoadingRefreshId === refreshId) {
        this.passkeysLoading.set(false)
        this.passkeysLoadingRefreshId = 0
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
    const passkey = this.passkeys().find((item) => item.credentialIdB64Url === normalizedCredentialId)
    if (passkey) {
      const isDuplicate = groupPasskeys(this.passkeys()).some((group) =>
        group.duplicates.some((duplicate) => duplicate.credentialIdB64Url === normalizedCredentialId),
      )
      const confirmStartedAt = performance.now()
      tracePasskeys('delete:confirm:start', {
        credential,
        duplicate: isDuplicate,
        rp_id: passkey.rpId,
      })
      const confirmed = await wrap(this.confirmPasskeyDelete(passkey))
      tracePasskeys('delete:confirm:resolved', {
        credential,
        duplicate: isDuplicate,
        confirmed,
        dt_ms: elapsedMs(confirmStartedAt),
        total_dt_ms: elapsedMs(deleteStartedAt),
      })
      if (!confirmed) return
    }

    this.passkeyDeletingCredentialId.set(normalizedCredentialId)
    this.passkeysError.set(null)
    try {
      const nativeStartedAt = performance.now()
      tracePasskeys('delete:native:start', {
        credential,
        total_dt_ms: elapsedMs(deleteStartedAt),
      })
      const res = await wrap(
        tauriInvoke<RpcResult<{deleted: boolean}>>('credential_provider_passkey_delete', {
          credentialId: normalizedCredentialId,
        }),
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
      this.passkeys.set(this.passkeys().filter((item) => item.credentialIdB64Url !== normalizedCredentialId))
      getAppContext().store.pushNotification('success', i18n('passkeys:delete-success'))
      void this.refreshPasskeys({showLoading: false}).then(
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
      console.warn('Failed to delete credential provider passkey', error)
      this.passkeysError.set(message)
      getAppContext().store.pushNotification('error', message)
      tracePasskeys('delete:error', {
        credential,
        dt_ms: elapsedMs(deleteStartedAt),
        error: message,
      })
    } finally {
      if (this.passkeyDeletingCredentialId() === normalizedCredentialId) {
        this.passkeyDeletingCredentialId.set(null)
      }
      tracePasskeys('delete:finished', {
        credential,
        dt_ms: elapsedMs(deleteStartedAt),
      })
    }
  }

  passkeyDisplayName(passkey: PasskeySummary): string {
    return passkeyDisplayLabel(passkey)
  }

  passkeyShortCredentialId(passkey: PasskeySummary): string {
    const id = passkey.credentialIdB64Url
    if (id.length <= 16) return id
    return `${id.slice(0, 8)}...${id.slice(-6)}`
  }

  passkeyLastUsedLabel(passkey: PasskeySummary): string {
    if (!Number.isFinite(passkey.lastUsedEpochMs) || passkey.lastUsedEpochMs <= 0) {
      return i18n('passkeys:last-used-never')
    }
    return this.passkeyDateLabel(passkey.lastUsedEpochMs)
  }

  passkeyCreatedLabel(passkey: PasskeySummary): string {
    if (!Number.isFinite(passkey.createdAtEpochMs) || passkey.createdAtEpochMs <= 0) {
      return i18n('passkeys:created-unknown')
    }
    return this.passkeyDateLabel(passkey.createdAtEpochMs)
  }

  passkeySignCountLabel(passkey: PasskeySummary): string {
    return Number.isFinite(passkey.signCount) ? String(passkey.signCount) : '0'
  }

  passkeyStorageLabel(): string {
    return i18n('passkeys:storage-vault')
  }

  passkeyDeleteActionLabel(): string {
    return i18n('passkeys:delete-vault')
  }

  passkeyIsDeleting(passkey: PasskeySummary): boolean {
    return this.passkeyDeletingCredentialId() === passkey.credentialIdB64Url
  }

  isPasskeyGroupExpanded(groupKey: string): boolean {
    return this.passkeyExpandedGroupKeys().has(groupKey)
  }

  togglePasskeyGroup(groupKey: string): void {
    const next = new Set(this.passkeyExpandedGroupKeys())
    if (next.has(groupKey)) {
      next.delete(groupKey)
    } else {
      next.add(groupKey)
    }
    this.passkeyExpandedGroupKeys.set(next)
  }

  private passkeyDateLabel(epochMs: number): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(epochMs))
  }

  private async confirmPasskeyDelete(passkey: PasskeySummary): Promise<boolean> {
    return dialogService.showConfirmDialog({
      title: i18n('passkeys:delete-vault-confirm-title'),
      message: i18n('passkeys:delete-vault-confirm-message', {
        account: this.passkeyDisplayName(passkey),
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
