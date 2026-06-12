import type {CatalogDeps} from './types'
import type {
  Algorithm,
  Encoding,
  OTPType,
  PassManagerEntryType,
  PaymentCardMeta,
  UrlRule,
} from '@project/passmanager/types'
import {normalizeOTPEncoding, streamToText} from '../../pass-utils'

function normalizeGroupDescription(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

type SaveEntryOtpMeta = {
  id?: string
  label?: string
  algorithm?: Algorithm
  digits?: number
  period?: number
  encoding?: Encoding | 'hex'
  type?: OTPType
  counter?: number
}

function toSaveEntryOtpPayload(otp: SaveEntryOtpMeta): Record<string, unknown> {
  return {
    id: otp.id,
    label: otp.label,
    algorithm: otp.algorithm,
    digits: otp.digits,
    period: otp.period,
    encoding: normalizeOTPEncoding(otp.encoding),
    type: otp.type,
    counter: otp.counter,
  }
}

export class PassmanagerTransport {
  private lastRuntimeRootImportTs = 0
  private postImportMissCounters: Record<'secret' | 'icon' | 'otp', number> = {
    secret: 0,
    icon: 0,
    otp: 0,
  }

  constructor(private readonly catalog: CatalogDeps) {}

  private get transport() {
    return this.catalog.transport
  }

  async saveEntry(params: {
    entryId?: string
    title: string
    entryType?: PassManagerEntryType
    createdTs?: number
    updatedTs?: number
    urls?: Array<string | UrlRule>
    username?: string
    otps?: SaveEntryOtpMeta[]
    paymentCard?: PaymentCardMeta
    groupPath?: string
    iconRef?: string
    sshKeys?: Array<{id: string; type: string; fingerprint: string; name?: string; comment?: string}>
    tags?: string[]
  }): Promise<{entryId: string}> {
    const payload: Record<string, unknown> = {
      entry_id: params.entryId,
      title: params.title,
      entry_type: params.entryType,
      created_ts: params.createdTs,
      updated_ts: params.updatedTs,
      urls: params.urls,
      username: params.username,
      otps: params.otps?.map(toSaveEntryOtpPayload),
      payment_card: params.paymentCard
        ? {
            cardholder_name: params.paymentCard.cardholderName,
            brand: params.paymentCard.brand,
            exp_month: params.paymentCard.expMonth,
            exp_year: params.paymentCard.expYear,
            last4: params.paymentCard.last4,
          }
        : undefined,
      group_path: params.groupPath,
      icon_ref: params.iconRef,
      sshKeys: params.sshKeys,
    }
    if (params.tags !== undefined) {
      payload['tags'] = params.tags
    }
    const res = await this.domainCall<{entry_id: string}>('passmanager:entry:save', payload)
    return {entryId: res.entry_id}
  }

  async readEntry(entryId: string): Promise<{entry: object}> {
    return this.domainCall('passmanager:entry:read', {entry_id: entryId})
  }

  async deleteEntry(entryId: string): Promise<void> {
    await this.domainCall('passmanager:entry:delete', {entry_id: entryId})
  }

  async moveEntry(entryId: string, targetGroupPath: string): Promise<void> {
    await this.domainCall('passmanager:entry:move', {
      entry_id: entryId,
      target_group_path: targetGroupPath,
    })
  }

  async renameEntry(entryId: string, newTitle: string): Promise<void> {
    await this.domainCall('passmanager:entry:rename', {
      entry_id: entryId,
      new_title: newTitle,
    })
  }

  async listEntries(): Promise<{entries: object[]; folders: object[]}> {
    return this.domainCall('passmanager:entry:list', {})
  }

  async saveSecret(entryId: string, secretType: string, value: string): Promise<void> {
    await this.domainCall('passmanager:secret:save', {
      entry_id: entryId,
      secret_type: secretType,
      value,
    })
  }

  async readSecret(entryId: string, secretType: string): Promise<{value: string}> {
    return this.domainCall('passmanager:secret:read', {
      entry_id: entryId,
      secret_type: secretType,
    })
  }

  async deleteSecret(entryId: string, secretType: string): Promise<void> {
    await this.domainCall('passmanager:secret:delete', {
      entry_id: entryId,
      secret_type: secretType,
    })
  }

  async ensureGroup(path: string): Promise<void> {
    await this.domainCall('passmanager:group:ensure', {path})
  }

  async listGroups(): Promise<{groups: object[]}> {
    return this.domainCall('passmanager:group:list', {})
  }

  async deleteGroup(path: string): Promise<void> {
    await this.domainCall('passmanager:group:delete', {path})
  }

  async setGroupMeta(
    path: string,
    meta: {iconRef?: string | null; description?: string | null},
  ): Promise<void> {
    const payload: Record<string, unknown> = {path}
    if ('iconRef' in meta) {
      payload['icon_ref'] = meta.iconRef ?? null
    }
    if ('description' in meta) {
      payload['description'] = normalizeGroupDescription(meta.description)
    }
    await this.domainCall('passmanager:group:setMeta', payload)
  }

  async setTagCatalog(tags: readonly string[]): Promise<void> {
    await this.domainCall('passmanager:tags:setCatalog', {tags})
  }

  async putIcon(
    contentBase64: string,
    mimeType: string | null,
    backgroundColor?: string | null,
  ): Promise<{
    icon_ref: string
    mime_type: string
    background_color?: string | null
    width: number
    height: number
    bytes: number
  }> {
    return this.domainCall('passmanager:icon:put', {
      content_base64: contentBase64,
      mime_type: mimeType,
      ...(backgroundColor !== undefined ? {background_color: backgroundColor} : {}),
    })
  }

  async getIcon(iconRef: string): Promise<{
    icon_ref: string
    mime_type: string
    background_color?: string | null
    content_base64: string
  }> {
    return this.domainCall('passmanager:icon:get', {icon_ref: iconRef})
  }

  async setIconMeta(iconRef: string, backgroundColor: string | null): Promise<void> {
    await this.domainCall('passmanager:icon:setMeta', {
      icon_ref: iconRef,
      background_color: backgroundColor,
    })
  }

  async listIcons(): Promise<{
    icons: Array<{
      icon_ref: string
      mime_type: string
      background_color?: string | null
      width: number
      height: number
      bytes: number
      created_at: number
      updated_at: number
    }>
  }> {
    return this.domainCall('passmanager:icon:list', {})
  }

  async gcIcons(): Promise<{deleted: number}> {
    return this.domainCall('passmanager:icon:gc', {})
  }

  async importRoot(
    entries: object[],
    folders: object[],
    foldersMeta?: object[],
    options?: {
      mode?: 'merge' | 'replace' | 'restore'
      reason?: string
      allowDestructive?: boolean
    },
    tags?: string[],
  ): Promise<void> {
    await this.domainCall('passmanager:root:import', {
      entries,
      folders,
      folders_meta: foldersMeta,
      tags,
      mode: options?.mode,
      reason: options?.reason,
      allow_destructive: options?.allowDestructive,
    })
  }

  async exportRoot(): Promise<{root: object}> {
    return this.domainCall('passmanager:root:export', {})
  }

  async download(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    return this.catalog.api.download(nodeId)
  }

  async downloadText(nodeId: number): Promise<string> {
    const stream = await this.download(nodeId)
    return streamToText(stream)
  }

  async sendPassmanager(command: string, params: Record<string, unknown>): Promise<unknown> {
    const transport = this.transport
    if (transport?.sendPassmanager) {
      return transport.sendPassmanager(command, params)
    }
    if (transport?.sendCatalog) {
      return transport.sendCatalog(command, params)
    }
    throw new Error('passmanager transport not available')
  }

  get hasSendPassmanager(): boolean {
    return Boolean(this.transport?.sendPassmanager || this.transport?.sendCatalog)
  }

  markRuntimeRootImport(ts = Date.now()): void {
    this.lastRuntimeRootImportTs = ts
    this.postImportMissCounters.secret = 0
    this.postImportMissCounters.icon = 0
    this.postImportMissCounters.otp = 0
  }

  isPostRuntimeImportWindow(windowMs = 30_000): boolean {
    if (!this.lastRuntimeRootImportTs) return false
    return Date.now() - this.lastRuntimeRootImportTs <= windowMs
  }

  recordPostImportMiss(kind: 'secret' | 'icon' | 'otp'): number {
    this.postImportMissCounters[kind] += 1
    return this.postImportMissCounters[kind]
  }

  private async domainCall<T>(command: string, params: Record<string, unknown>): Promise<T> {
    const transport = this.transport
    if (!transport?.sendPassmanager && !transport?.sendCatalog) {
      throw new Error('passmanager transport not available')
    }
    const raw = transport.sendPassmanager
      ? transport.sendPassmanager(command, params)
      : transport.sendCatalog(command, params)
    const res = (await raw) as {
      ok: boolean
      result: T
      error?: string
    }
    if (!res.ok) throw new Error(String(res.error || `${command} failed`))
    return res.result
  }
}
