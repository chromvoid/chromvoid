import type {CatalogDeps} from './types'
import {streamToText} from '../../pass-utils'

export class CatalogTransport {
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
    urls?: string[]
    username?: string
    groupPath?: string
    iconRef?: string
    sshKeys?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
  }): Promise<{entryId: string}> {
    const res = await this.domainCall<{entry_id: string}>('passmanager:entry:save', {
      entry_id: params.entryId,
      title: params.title,
      urls: params.urls,
      username: params.username,
      group_path: params.groupPath,
      icon_ref: params.iconRef,
      sshKeys: params.sshKeys,
    })
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

  async setGroupMeta(path: string, iconRef: string | null): Promise<void> {
    await this.domainCall('passmanager:group:setMeta', {
      path,
      icon_ref: iconRef,
    })
  }

  async putIcon(
    contentBase64: string,
    mimeType: string | null,
  ): Promise<{
    icon_ref: string
    mime_type: string
    width: number
    height: number
    bytes: number
  }> {
    return this.domainCall('passmanager:icon:put', {
      content_base64: contentBase64,
      mime_type: mimeType,
    })
  }

  async getIcon(iconRef: string): Promise<{icon_ref: string; mime_type: string; content_base64: string}> {
    return this.domainCall('passmanager:icon:get', {icon_ref: iconRef})
  }

  async listIcons(): Promise<{
    icons: Array<{
      icon_ref: string
      mime_type: string
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
  ): Promise<void> {
    await this.domainCall('passmanager:root:import', {
      entries,
      folders,
      folders_meta: foldersMeta,
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

  async sendCatalog(command: string, params: Record<string, unknown>): Promise<unknown> {
    const transport = this.transport
    if (!transport?.sendCatalog) throw new Error('passmanager transport not available')
    return transport.sendCatalog(command, params)
  }

  get hasSendCatalog(): boolean {
    return Boolean(this.transport?.sendCatalog)
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
    if (!transport?.sendCatalog) throw new Error('passmanager transport not available')
    const res = (await transport.sendCatalog(command, params)) as {
      ok: boolean
      result: T
      error?: string
    }
    if (!res.ok) throw new Error(String(res.error || `${command} failed`))
    return res.result
  }
}
