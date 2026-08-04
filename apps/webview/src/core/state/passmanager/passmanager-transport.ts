import type {PassmanagerGroupSummary} from '@chromvoid/scheme'

import type {CatalogDeps} from './types'
import type {
  Algorithm,
  Encoding,
  OTPType,
  PassManagerCreateEntryPayload,
  PassManagerEntryType,
  PaymentCardMeta,
  PassManagerSshKey,
  SshKeygenParams,
  SshKeygenResult,
  UrlRule,
} from '@project/passmanager/types'
import type {CredentialTagCatalogMeta} from '@project/passmanager/tags'
import type {CredentialSecurityAuditArtifactV1} from '@project/passmanager/security-audit'
import {normalizeOTPEncoding, streamToText} from '../../pass-utils'

function normalizeGroupDescription(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeGroupSummary(value: unknown): PassmanagerGroupSummary | undefined {
  if (typeof value === 'string') {
    const path = value.trim()
    return path ? {path, entry_count: 0} : undefined
  }
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const path = typeof record['path'] === 'string' ? record['path'].trim() : ''
  if (!path) return undefined

  const rawEntryCount = record['entry_count']
  const entryCount =
    typeof rawEntryCount === 'number' && Number.isFinite(rawEntryCount)
      ? Math.max(0, Math.floor(rawEntryCount))
      : 0
  return {path, entry_count: entryCount}
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

  async createEntry(params: PassManagerCreateEntryPayload): Promise<{entryId: string}> {
    const meta = params.meta
    const payload = this.toEntryPayload({
      entryId: meta.id,
      entryType: params.entryType,
      createdTs: meta.createdTs,
      updatedTs: meta.updatedTs,
      title: meta.title,
      urls: params.entryType === 'payment_card' ? undefined : meta.urls,
      username: params.entryType === 'payment_card' ? undefined : meta.username,
      otps: params.entryType === 'payment_card' ? undefined : meta.otps,
      paymentCard: params.entryType === 'payment_card' ? meta.paymentCard : undefined,
      groupPath: meta.groupPath,
      iconRef: meta.iconRef,
      tags: meta.tags,
    })
    payload['secrets'] =
      params.entryType === 'payment_card'
        ? {
            card_pan: params.secrets.cardPan,
            card_cvv: params.secrets.cardCvv,
            note: params.secrets.note,
          }
        : {
            password: params.secrets.password,
            note: params.secrets.note,
          }

    const res = await this.domainCall<{entry_id: string}>('passmanager:entry:create', payload)
    return {entryId: res.entry_id}
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
    tags?: string[]
  }): Promise<{entryId: string}> {
    const payload = this.toEntryPayload(params)
    const res = await this.domainCall<{entry_id: string}>('passmanager:entry:save', payload)
    return {entryId: res.entry_id}
  }

  private toEntryPayload(params: {
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
    tags?: string[]
  }): Record<string, unknown> {
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
    }
    if (params.tags !== undefined) {
      payload['tags'] = params.tags
    }
    return payload
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

  async listSshKeys(): Promise<{sshKeys: PassManagerSshKey[]}> {
    return this.domainCall('passmanager:ssh:list', {})
  }

  async updateSshKey(key: PassManagerSshKey): Promise<void> {
    await this.domainCall('passmanager:ssh:key:update', {key})
  }

  async deleteSshKey(keyId: string): Promise<void> {
    await this.domainCall('passmanager:ssh:key:delete', {key_id: keyId})
  }

  async readSshPublicKey(keyId: string): Promise<{value: string}> {
    return this.domainCall('passmanager:ssh:secret:read', {
      key_id: keyId,
      secret_type: 'ssh_public_key',
    })
  }

  async generateSshKey(params: SshKeygenParams): Promise<SshKeygenResult> {
    const result = await this.domainCall<{
      key_id: string
      public_key_openssh: string
      fingerprint: string
      key_type: PassManagerSshKey['type']
    }>('passmanager:ssh:keygen', {
      key_type: params.keyType,
      name: params.name,
      comment: params.comment,
      source_entry_id: params.sourceEntryId,
    })
    return {
      keyId: result.key_id,
      publicKeyOpenssh: result.public_key_openssh,
      fingerprint: result.fingerprint,
      keyType: result.key_type,
    }
  }

  async ensureGroup(path: string): Promise<void> {
    await this.domainCall('passmanager:group:ensure', {path})
  }

  async listGroups(): Promise<{groups: PassmanagerGroupSummary[]}> {
    const result = await this.domainCall<{groups?: unknown}>('passmanager:group:list', {})
    const groups = Array.isArray(result?.groups)
      ? result.groups
          .map((item) => normalizeGroupSummary(item))
          .filter((item): item is PassmanagerGroupSummary => Boolean(item))
      : []
    return {groups}
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

  async setTagCatalog(tags: readonly string[], tagMeta?: CredentialTagCatalogMeta): Promise<void> {
    const payload: Record<string, unknown> = {tags}
    if (tagMeta !== undefined) {
      payload['tag_meta'] = tagMeta
    }
    await this.domainCall('passmanager:tags:setCatalog', payload)
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

  async getCredentialSecurityAudit(): Promise<{artifact: unknown | null}> {
    return this.domainCall('passmanager:securityAudit:get', {})
  }

  async setCredentialSecurityAudit(artifact: CredentialSecurityAuditArtifactV1): Promise<void> {
    await this.domainCall('passmanager:securityAudit:set', {artifact})
  }

  async importRoot(
    entries: object[],
    folders: unknown[],
    foldersMeta?: object[],
    options?: {
      mode?: 'merge' | 'replace' | 'restore'
      reason?: string
      allowDestructive?: boolean
    },
    tags?: string[],
    tagMeta?: CredentialTagCatalogMeta,
    sshKeys?: PassManagerSshKey[],
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      entries,
      folders,
      folders_meta: foldersMeta,
      mode: options?.mode,
      reason: options?.reason,
      allow_destructive: options?.allowDestructive,
    }
    if (tags !== undefined) {
      payload['tags'] = tags
    }
    if (tagMeta !== undefined) {
      payload['tag_meta'] = tagMeta
    }
    if (sshKeys !== undefined) {
      payload['sshKeys'] = sshKeys
    }
    await this.domainCall('passmanager:root:import', payload)
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
