import type {
  Algorithm,
  Encoding,
  OTPType,
  PassManagerRootV2,
  PassManagerRootV2Entry,
  PasswordsRepository,
  UrlMatch,
  UrlRule,
} from '@project/passmanager'
import type {CatalogDeps} from './types'
import type {CatalogTransport} from './catalog-transport'
import type {Logger} from '../../logger'
import {defaultLogger} from '../../logger'
import {normalizeGroupPath} from '../../pass-paths'
import {
  ADAPTER_ERROR,
  PASS_DIR,
  formatAdapterError,
  normalizeOTPEncoding,
  sanitizeName,
} from '../../pass-utils'

type RootExportShape = {
  version?: unknown
  createdTs?: unknown
  updatedTs?: unknown
  folders?: unknown
  foldersMeta?: unknown
  entries?: unknown
}

type IntegrityScanSource = 'readRoot' | 'saveRoot'

type IntegrityReconcileMode = 'report' | 'safe_fix'

type IntegrityMismatch = {
  kind: 'entry_icon_missing' | 'folder_icon_missing' | 'otp_secret_missing'
  entryId?: string
  folderPath?: string
  iconRef?: string
  otpId?: string
  details?: string
}

type IntegrityDiagnostics = {
  source: IntegrityScanSource
  ts: number
  scannedEntries: number
  scannedIconRefs: number
  scannedOtps: number
  skippedOtpChecks: number
  mismatches: IntegrityMismatch[]
  reconcileMode: IntegrityReconcileMode
  reconcileActions: IntegrityReconcileAction[]
}

type IntegrityReconcileAction = {
  kind: 'entry_icon_ref_clear' | 'folder_icon_ref_clear' | 'entry_otp_link_remove'
  status: 'fixed' | 'skipped' | 'failed'
  reason?:
    | 'report_only'
    | 'read_only_source'
    | 'entry_not_found'
    | 'otp_not_found'
    | 'entry_icon_clear_unsupported'
  entryId?: string
  folderPath?: string
  iconRef?: string
  otpId?: string
  details?: string
}

type CatalogPasswordsRepositoryOptions = {
  integrityReconcileMode?: IntegrityReconcileMode
}

const INTEGRITY_OTP_CHECK_LIMIT = 50
const INTEGRITY_ALERT_SAMPLE_LIMIT = 8
const INTEGRITY_RECONCILE_SAMPLE_LIMIT = 20

const DEFAULT_URL_MATCH: UrlMatch = 'base_domain'

const isLogger = (value: unknown): value is Logger => {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec['debug'] === 'function' &&
    typeof rec['info'] === 'function' &&
    typeof rec['warn'] === 'function' &&
    typeof rec['error'] === 'function'
  )
}

const isCatalogPasswordsRepositoryOptions = (value: unknown): value is CatalogPasswordsRepositoryOptions => {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  const rawMode = rec['integrityReconcileMode']
  return rawMode === undefined || rawMode === 'report' || rawMode === 'safe_fix'
}

const toFolderPathList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const folder of value) {
    if (typeof folder === 'string') {
      out.push(folder)
      continue
    }
    if (!folder || typeof folder !== 'object') continue
    const path = (folder as Record<string, unknown>)['path']
    if (typeof path === 'string') out.push(path)
  }
  return out
}

const normalizeUrls = (value: unknown): UrlRule[] => {
  if (!Array.isArray(value)) return []
  const out: UrlRule[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      out.push({value: item, match: DEFAULT_URL_MATCH})
      continue
    }
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawValue = rec['value']
    if (typeof rawValue !== 'string') continue
    const rawMatch = rec['match']
    out.push({
      value: rawValue,
      match: typeof rawMatch === 'string' ? (rawMatch as UrlMatch) : DEFAULT_URL_MATCH,
    })
  }
  return out
}

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

const toEntry = (value: unknown): PassManagerRootV2Entry | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const id = toOptionalString(rec['id'] ?? rec['entry_id'])
  if (!id) return undefined
  const title = typeof rec['title'] === 'string' ? rec['title'] : id
  const username = typeof rec['username'] === 'string' ? rec['username'] : ''
  const folderPathRaw = rec['folderPath'] ?? rec['group_path']
  const normalizedFolder = normalizeGroupPath(typeof folderPathRaw === 'string' ? folderPathRaw : undefined)

  const rawOtps = Array.isArray(rec['otps']) ? rec['otps'] : []
  const otps = rawOtps
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((otp) => ({
      id: typeof otp['id'] === 'string' ? otp['id'] : undefined,
      label: typeof otp['label'] === 'string' ? otp['label'] : undefined,
      algorithm: otp['algorithm'] as Algorithm | undefined,
      digits: typeof otp['digits'] === 'number' ? otp['digits'] : undefined,
      period: typeof otp['period'] === 'number' ? otp['period'] : undefined,
      encoding: normalizeOTPEncoding(otp['encoding'] as string | undefined),
      type: otp['type'] as OTPType | undefined,
      counter: typeof otp['counter'] === 'number' ? otp['counter'] : undefined,
    }))

  // Parse sshKeys array (new format)
  const rawSshKeys = Array.isArray(rec['sshKeys']) ? rec['sshKeys'] : []
  let sshKeys = rawSshKeys
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .filter(
      (item) =>
        typeof item['id'] === 'string' &&
        typeof item['type'] === 'string' &&
        typeof item['fingerprint'] === 'string',
    )
    .map((item) => ({
      id: item['id'] as string,
      type: item['type'] as string,
      fingerprint: item['fingerprint'] as string,
      comment: typeof item['comment'] === 'string' ? item['comment'] : undefined,
    }))

  // Backward compat: old scalar fields → single-element array
  if (sshKeys.length === 0) {
    const t = toOptionalString(rec['sshKeyType'] ?? rec['ssh_key_type'])
    const f = toOptionalString(rec['sshKeyFingerprint'] ?? rec['ssh_key_fingerprint'])
    if (t && f) {
      sshKeys = [
        {
          id: 'default',
          type: t,
          fingerprint: f,
          comment: toOptionalString(rec['sshKeyComment'] ?? rec['ssh_key_comment']),
        },
      ]
    }
  }

  return {
    id,
    title,
    username,
    urls: normalizeUrls(rec['urls']),
    otps,
    folderPath: normalizedFolder ?? null,
    iconRef: toOptionalString(rec['iconRef'] ?? rec['icon_ref']),
    sshKeys: sshKeys.length > 0 ? sshKeys : undefined,
  }
}

export class CatalogPasswordsRepository implements PasswordsRepository {
  private readonly logger: Logger
  private readonly integrityReconcileMode: IntegrityReconcileMode
  private lastIntegrityKey = ''
  private lastIntegrityDiagnostics: IntegrityDiagnostics | undefined
  private lastIntegrityAlertKey = ''

  constructor(
    catalog: CatalogDeps,
    transport: CatalogTransport,
    logger?: Logger,
    options?: CatalogPasswordsRepositoryOptions,
  )
  constructor(catalog: CatalogDeps, transport: CatalogTransport, logger: unknown, ...legacy: unknown[])
  constructor(
    private readonly catalog: CatalogDeps,
    private readonly transport: CatalogTransport,
    logger: unknown = defaultLogger,
    ...legacy: unknown[]
  ) {
    const options =
      (isCatalogPasswordsRepositoryOptions(logger) ? logger : undefined) ??
      legacy.find((value): value is CatalogPasswordsRepositoryOptions =>
        isCatalogPasswordsRepositoryOptions(value),
      )
    this.integrityReconcileMode = options?.integrityReconcileMode === 'safe_fix' ? 'safe_fix' : 'report'

    if (isLogger(logger)) {
      this.logger = logger
      return
    }
    const legacyLogger = legacy.find((value): value is Logger => isLogger(value))
    this.logger = legacyLogger ?? defaultLogger
  }

  private setError(
    code: (typeof ADAPTER_ERROR)[keyof typeof ADAPTER_ERROR],
    details: string,
    cause?: unknown,
  ) {
    try {
      this.catalog.lastError.set(formatAdapterError(code, details, cause))
    } catch {}
  }

  private buildIntegrityKey(root: PassManagerRootV2): string {
    const entryParts = root.entries
      .map((entry) => {
        const otpIds = (entry.otps ?? [])
          .map((otp) => (typeof otp.id === 'string' ? otp.id : ''))
          .filter((id) => id.length > 0)
          .sort()
        const icon = typeof entry.iconRef === 'string' ? entry.iconRef : ''
        return `${entry.id}:${icon}:${otpIds.join(',')}`
      })
      .sort()

    const folderIconParts = (root.foldersMeta ?? [])
      .filter((meta): meta is {path: string; iconRef?: string} =>
        Boolean(meta && typeof meta === 'object' && typeof meta.path === 'string'),
      )
      .map((meta) => `${meta.path}:${typeof meta.iconRef === 'string' ? meta.iconRef : ''}`)
      .sort()

    return `${entryParts.join('|')}#${folderIconParts.join('|')}`
  }

  private reportIntegrityDiagnostics(key: string, diagnostics: IntegrityDiagnostics) {
    if (diagnostics.mismatches.length === 0) {
      this.logger.debug('[PassManager][integrity] scan ok', {
        source: diagnostics.source,
        scannedEntries: diagnostics.scannedEntries,
        scannedIconRefs: diagnostics.scannedIconRefs,
        scannedOtps: diagnostics.scannedOtps,
        skippedOtpChecks: diagnostics.skippedOtpChecks,
        reconcileMode: diagnostics.reconcileMode,
      })
      return
    }

    this.logger.warn('[PassManager][integrity] mismatches detected', diagnostics)
    const alertKey = `${key}:${diagnostics.mismatches
      .map((m) => `${m.kind}:${m.entryId ?? ''}:${m.folderPath ?? ''}:${m.iconRef ?? ''}:${m.otpId ?? ''}`)
      .join('|')}`
    if (alertKey === this.lastIntegrityAlertKey) return

    this.lastIntegrityAlertKey = alertKey
    const sample = diagnostics.mismatches.slice(0, INTEGRITY_ALERT_SAMPLE_LIMIT)
    this.setError(
      ADAPTER_ERROR.READ_ROOT,
      'PassManager integrity mismatches detected',
      JSON.stringify({
        source: diagnostics.source,
        mismatchCount: diagnostics.mismatches.length,
        reconcileMode: diagnostics.reconcileMode,
        reconciledCount: diagnostics.reconcileActions.filter((action) => action.status === 'fixed').length,
        sample,
      }),
    )
  }

  private async runIntegrityReconciliation(
    source: IntegrityScanSource,
    root: PassManagerRootV2,
    mismatches: IntegrityMismatch[],
  ): Promise<IntegrityReconcileAction[]> {
    const actions: IntegrityReconcileAction[] = []
    const reconcileMode = this.integrityReconcileMode

    for (const mismatch of mismatches.slice(0, INTEGRITY_RECONCILE_SAMPLE_LIMIT)) {
      if (mismatch.kind === 'entry_icon_missing') {
        if (reconcileMode === 'report') {
          actions.push({
            kind: 'entry_icon_ref_clear',
            status: 'skipped',
            reason: 'report_only',
            entryId: mismatch.entryId,
            iconRef: mismatch.iconRef,
          })
          continue
        }
        actions.push({
          kind: 'entry_icon_ref_clear',
          status: 'skipped',
          reason: source === 'saveRoot' ? 'entry_icon_clear_unsupported' : 'read_only_source',
          entryId: mismatch.entryId,
          iconRef: mismatch.iconRef,
        })
        continue
      }

      if (mismatch.kind === 'folder_icon_missing') {
        if (reconcileMode === 'report') {
          actions.push({
            kind: 'folder_icon_ref_clear',
            status: 'skipped',
            reason: 'report_only',
            folderPath: mismatch.folderPath,
            iconRef: mismatch.iconRef,
          })
          continue
        }
        if (source !== 'saveRoot') {
          actions.push({
            kind: 'folder_icon_ref_clear',
            status: 'skipped',
            reason: 'read_only_source',
            folderPath: mismatch.folderPath,
            iconRef: mismatch.iconRef,
          })
          continue
        }

        const normalizedPath = normalizeGroupPath(mismatch.folderPath)
        if (!normalizedPath) {
          actions.push({
            kind: 'folder_icon_ref_clear',
            status: 'failed',
            folderPath: mismatch.folderPath,
            iconRef: mismatch.iconRef,
            details: 'invalid folder path for reconciliation',
          })
          continue
        }

        try {
          await this.transport.setGroupMeta(normalizedPath, null)
          actions.push({
            kind: 'folder_icon_ref_clear',
            status: 'fixed',
            folderPath: normalizedPath,
            iconRef: mismatch.iconRef,
          })
        } catch (e) {
          actions.push({
            kind: 'folder_icon_ref_clear',
            status: 'failed',
            folderPath: normalizedPath,
            iconRef: mismatch.iconRef,
            details: e instanceof Error ? e.message : String(e),
          })
        }
        continue
      }

      if (mismatch.kind !== 'otp_secret_missing') continue

      if (reconcileMode === 'report') {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'skipped',
          reason: 'report_only',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
          details: mismatch.details,
        })
        continue
      }

      if (source !== 'saveRoot') {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'skipped',
          reason: 'read_only_source',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
          details: mismatch.details,
        })
        continue
      }

      if (!this.transport.hasSendCatalog) {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'failed',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
          details: 'transport does not support sendCatalog',
        })
        continue
      }

      const entry = root.entries.find((item) => item.id === mismatch.entryId)
      if (!entry) {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'skipped',
          reason: 'entry_not_found',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
        })
        continue
      }

      const nextOtps = (entry.otps ?? []).filter((otp) => toOptionalString(otp.id) !== mismatch.otpId)
      if (nextOtps.length === (entry.otps ?? []).length) {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'skipped',
          reason: 'otp_not_found',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
        })
        continue
      }

      const groupPath = normalizeGroupPath(entry.folderPath ?? undefined)
      try {
        await this.transport.sendCatalog('passmanager:entry:save', {
          id: entry.id,
          title: entry.title,
          urls: entry.urls,
          username: entry.username,
          groupPath: groupPath ?? '',
          iconRef: entry.iconRef,
          sshKeys: entry.sshKeys,
          otps: nextOtps,
        })
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'fixed',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
        })
      } catch (e) {
        actions.push({
          kind: 'entry_otp_link_remove',
          status: 'failed',
          entryId: mismatch.entryId,
          otpId: mismatch.otpId,
          details: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return actions
  }

  private async runIntegrityScan(
    source: IntegrityScanSource,
    root: PassManagerRootV2,
  ): Promise<IntegrityDiagnostics | undefined> {
    const key = this.buildIntegrityKey(root)
    if (source === 'readRoot' && key === this.lastIntegrityKey && this.lastIntegrityDiagnostics) {
      return this.lastIntegrityDiagnostics
    }

    const mismatches: IntegrityMismatch[] = []
    const entryIconRefs = root.entries
      .map((entry) => ({entryId: entry.id, iconRef: toOptionalString(entry.iconRef)}))
      .filter((item): item is {entryId: string; iconRef: string} => Boolean(item.iconRef))
    const folderIconRefs = (root.foldersMeta ?? [])
      .filter((meta): meta is {path: string; iconRef?: string} =>
        Boolean(meta && typeof meta === 'object' && typeof meta.path === 'string'),
      )
      .map((meta) => ({path: meta.path, iconRef: toOptionalString(meta.iconRef)}))
      .filter((item): item is {path: string; iconRef: string} => Boolean(item.iconRef))

    const requestedIconRefs = new Set<string>([
      ...entryIconRefs.map((item) => item.iconRef),
      ...folderIconRefs.map((item) => item.iconRef),
    ])

    if (requestedIconRefs.size > 0) {
      try {
        const listed = await this.transport.listIcons()
        const existingIconRefs = new Set(
          (listed.icons ?? [])
            .map((item) => {
              if (!item || typeof item !== 'object') return undefined
              const rec = item as Record<string, unknown>
              return toOptionalString(rec['icon_ref'] ?? rec['iconRef'])
            })
            .filter((iconRef): iconRef is string => Boolean(iconRef)),
        )

        for (const item of entryIconRefs) {
          if (!existingIconRefs.has(item.iconRef)) {
            mismatches.push({
              kind: 'entry_icon_missing',
              entryId: item.entryId,
              iconRef: item.iconRef,
            })
          }
        }
        for (const item of folderIconRefs) {
          if (!existingIconRefs.has(item.iconRef)) {
            mismatches.push({
              kind: 'folder_icon_missing',
              folderPath: item.path,
              iconRef: item.iconRef,
            })
          }
        }
      } catch (e) {
        this.logger.debug('[PassManager][integrity] icon scan skipped', {
          source,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const otpChecks = root.entries.flatMap((entry) =>
      (entry.otps ?? [])
        .map((otp) => ({
          entryId: entry.id,
          otpId: toOptionalString(otp.id),
          digits: typeof otp.digits === 'number' ? otp.digits : 6,
          period: typeof otp.period === 'number' ? otp.period : 30,
          algorithm: otp.algorithm ?? 'SHA1',
        }))
        .filter(
          (
            item,
          ): item is {entryId: string; otpId: string; digits: number; period: number; algorithm: Algorithm} =>
            Boolean(item.otpId),
        ),
    )

    let scannedOtps = 0
    let skippedOtpChecks = Math.max(0, otpChecks.length - INTEGRITY_OTP_CHECK_LIMIT)
    if (otpChecks.length > 0 && this.transport.hasSendCatalog) {
      let otpScanUnsupported = false
      for (const otp of otpChecks.slice(0, INTEGRITY_OTP_CHECK_LIMIT)) {
        if (otpScanUnsupported) {
          skippedOtpChecks += 1
          continue
        }
        scannedOtps += 1
        try {
          const result = (await this.transport.sendCatalog('passmanager:otp:generate', {
            otp_id: otp.otpId,
            entry_id: otp.entryId,
            ts: Date.now(),
            digits: otp.digits,
            period: otp.period,
            ha: otp.algorithm,
          })) as {ok?: boolean; error?: unknown}

          if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
            continue
          }

          const message = String(result.error ?? 'passmanager:otp:generate failed')
          if (/unknown command|unsupported command/i.test(message)) {
            otpScanUnsupported = true
            continue
          }
          if (/OTP_SECRET_NOT_FOUND|NODE_NOT_FOUND|not\s*found/i.test(message)) {
            mismatches.push({
              kind: 'otp_secret_missing',
              entryId: otp.entryId,
              otpId: otp.otpId,
              details: message,
            })
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          if (/unknown command|unsupported command/i.test(message)) {
            otpScanUnsupported = true
            continue
          }
          if (/OTP_SECRET_NOT_FOUND|NODE_NOT_FOUND|not\s*found/i.test(message)) {
            mismatches.push({
              kind: 'otp_secret_missing',
              entryId: otp.entryId,
              otpId: otp.otpId,
              details: message,
            })
          }
        }
      }
    }

    const reconcileActions = await this.runIntegrityReconciliation(source, root, mismatches)

    const diagnostics: IntegrityDiagnostics = {
      source,
      ts: Date.now(),
      scannedEntries: root.entries.length,
      scannedIconRefs: requestedIconRefs.size,
      scannedOtps,
      skippedOtpChecks,
      mismatches,
      reconcileMode: this.integrityReconcileMode,
      reconcileActions,
    }

    this.lastIntegrityKey = key
    this.lastIntegrityDiagnostics = diagnostics
    this.reportIntegrityDiagnostics(key, diagnostics)
    return diagnostics
  }

  private normalizeRootPayload(raw: unknown): PassManagerRootV2 {
    const rec = (raw && typeof raw === 'object' ? raw : {}) as RootExportShape
    const entriesRaw = Array.isArray(rec.entries) ? rec.entries : []
    const foldersRaw = toFolderPathList(rec.folders)

    const folders = new Set<string>()
    const entries: PassManagerRootV2Entry[] = []

    for (const folder of foldersRaw) {
      const normalized = normalizeGroupPath(folder)
      if (!normalized) continue
      // Skip system folders like /.icons — they are not user groups.
      const segment = normalized.startsWith('/') ? normalized.slice(1) : normalized
      if (segment.startsWith('.')) continue
      folders.add(normalized)
    }

    for (const item of entriesRaw) {
      const entry = toEntry(item)
      if (!entry) continue
      if (entry.folderPath) folders.add(entry.folderPath)
      entries.push(entry)
    }

    const version = rec.version === 2 ? 2 : 2
    const now = Date.now()
    return {
      version,
      createdTs: typeof rec.createdTs === 'number' ? rec.createdTs : now,
      updatedTs: typeof rec.updatedTs === 'number' ? rec.updatedTs : now,
      folders: Array.from(folders).sort(),
      foldersMeta: Array.isArray(rec.foldersMeta)
        ? (rec.foldersMeta as PassManagerRootV2['foldersMeta'])
        : [],
      entries,
    }
  }

  private appendMirrorFolders(root: PassManagerRootV2): PassManagerRootV2 {
    const folders = new Set(root.folders)
    const top = this.catalog.catalog.getChildren(PASS_DIR) ?? []
    for (const node of top) {
      if (!node?.isDir) continue
      if (node.name.startsWith('.')) continue // skip system dirs (.icons etc.)
      const children = this.catalog.catalog.getChildren(node.nodeId) ?? []
      const hasMeta = children.some((child) => child.isFile && child.name === 'meta.json')
      if (!hasMeta) folders.add(node.name)
    }
    return {...root, folders: Array.from(folders).sort()}
  }

  async saveRoot(file: File): Promise<boolean> {
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as Partial<PassManagerRootV2>
      if (parsed?.version !== 2) {
        this.setError(
          ADAPTER_ERROR.SAVE_ROOT_PARSE,
          'Unsupported PassManager root payload: expected version 2',
          new Error('Invalid root version'),
        )
        return false
      }

      const folders = Array.isArray(parsed.folders) ? parsed.folders : []
      const foldersMeta = Array.isArray(parsed.foldersMeta) ? parsed.foldersMeta : []
      const entries = Array.isArray(parsed.entries) ? parsed.entries : []
      const normalizedRoot = this.normalizeRootPayload({
        ...parsed,
        folders,
        foldersMeta,
        entries,
      })
      const importMode = 'incremental' as const
      const importReason = 'runtime-save' as const

      this.logger.info('[PassManager][saveRoot] reconcile begin', {
        mode: importMode,
        reason: importReason,
        folders: normalizedRoot.folders.length,
        entries: normalizedRoot.entries.length,
      })

      for (const folderPath of normalizedRoot.folders) {
        const normalized = normalizeGroupPath(folderPath)
        if (!normalized) continue
        await this.transport.ensureGroup(normalized)
      }

      const listed = await this.transport.listEntries()
      const existingIds = new Set(
        (listed.entries ?? [])
          .map((item) => {
            if (!item || typeof item !== 'object') return undefined
            const rec = item as Record<string, unknown>
            return toOptionalString(rec['id'] ?? rec['entry_id'])
          })
          .filter((id): id is string => Boolean(id)),
      )

      const desiredIds = new Set(normalizedRoot.entries.map((entry) => entry.id))
      for (const entryId of existingIds) {
        if (desiredIds.has(entryId)) continue
        await this.transport.deleteEntry(entryId)
      }

      for (const entry of normalizedRoot.entries) {
        const groupPath = normalizeGroupPath(entry.folderPath ?? undefined)
        if (groupPath) {
          await this.transport.ensureGroup(groupPath)
        }

        await this.transport.saveEntry({
          entryId: entry.id,
          title: entry.title,
          urls: (entry.urls ?? []).map((rule) => rule.value),
          username: entry.username,
          groupPath,
          iconRef: entry.iconRef,
          sshKeys: entry.sshKeys,
        })

        if ((entry.otps ?? []).length > 0 && this.transport.hasSendCatalog) {
          await this.transport.sendCatalog('passmanager:entry:save', {
            id: entry.id,
            title: entry.title,
            urls: entry.urls,
            username: entry.username,
            groupPath: groupPath ?? '',
            iconRef: entry.iconRef,
            sshKeys: entry.sshKeys,
            otps: entry.otps,
          })
        }
      }

      for (const item of normalizedRoot.foldersMeta ?? []) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        if (!('iconRef' in rec) && !('icon_ref' in rec)) continue
        const path = normalizeGroupPath(typeof rec['path'] === 'string' ? rec['path'] : undefined)
        if (!path) continue
        const rawIconRef = rec['iconRef'] ?? rec['icon_ref']
        const iconRef = typeof rawIconRef === 'string' && rawIconRef.trim() ? rawIconRef : null
        await this.transport.setGroupMeta(path, iconRef)
      }

      const importTs = Date.now()
      this.transport.markRuntimeRootImport(importTs)
      const integrity = await this.runIntegrityScan('saveRoot', normalizedRoot)
      this.logger.info('[PassManager][saveRoot] reconcile done', {
        mode: importMode,
        reason: importReason,
        ts: importTs,
        integrityMismatches: integrity?.mismatches.length ?? 0,
      })
      this.catalog.queueRefresh(150)
      return true
    } catch (e) {
      this.logger.error('[PassManager][saveRoot] import failed', e)
      this.setError(ADAPTER_ERROR.SAVE_ROOT_PARSE, 'Ошибка импорта PassManager root', e)
      return false
    }
  }

  async readRoot<T>(): Promise<T | undefined> {
    try {
      const exported = await this.transport.exportRoot()
      const maybeRoot =
        exported && typeof exported === 'object' && 'root' in exported
          ? (exported as {root?: unknown}).root
          : exported

      const normalized = this.normalizeRootPayload(maybeRoot)
      const withMirrorFolders = this.appendMirrorFolders(normalized)
      const integrity = await this.runIntegrityScan('readRoot', withMirrorFolders)
      return {
        ...withMirrorFolders,
        integrity,
      } as unknown as T
    } catch (e) {
      this.setError(ADAPTER_ERROR.READ_ROOT, 'Ошибка чтения PassManager root', e)
      return undefined
    }
  }

  async removeRoot(): Promise<boolean> {
    return true
  }

  async saveEntryMeta(data: {
    id: string
    title: string
    urls: UrlRule[]
    username: string
    otps: Array<{
      id?: string
      label?: string
      algorithm?: Algorithm
      digits?: number
      period?: number
      encoding?: Encoding
      type?: OTPType
      counter?: number
    }>
    groupPath?: string
    iconRef?: string
    sshKeys?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
  }): Promise<boolean> {
    try {
      const groupPath = normalizeGroupPath(data.groupPath)
      if (groupPath) {
        await this.transport.ensureGroup(groupPath)
      }

      await this.transport.saveEntry({
        entryId: data.id,
        title: data.title,
        urls: (data.urls ?? []).map((rule) => rule.value),
        username: data.username,
        groupPath,
        iconRef: data.iconRef,
        sshKeys: data.sshKeys,
      })

      if ((data.otps ?? []).length > 0 && this.transport.hasSendCatalog) {
        await this.transport.sendCatalog('passmanager:entry:save', {
          id: data.id,
          title: data.title,
          urls: data.urls ?? [],
          username: data.username,
          otps: (data.otps ?? []).map((otp) => ({
            id: otp.id,
            label: otp.label,
            algorithm: otp.algorithm,
            digits: otp.digits,
            period: otp.period,
            encoding: normalizeOTPEncoding(otp.encoding),
            type: otp.type,
            counter: otp.counter,
          })),
          groupPath: groupPath ?? '',
          iconRef: data.iconRef,
          sshKeys: data.sshKeys,
        })
      }

      try {
        await this.catalog.refresh()
      } catch {}

      return true
    } catch (e) {
      this.setError(ADAPTER_ERROR.SAVE_ROOT_PARSE, 'Ошибка точечной записи meta.json', e)
      return false
    }
  }

  private toSecretType(fileName: string): string | undefined {
    if (fileName === '.password') return 'password'
    if (fileName === '.note') return 'note'
    // Backward compat: old static filenames
    if (fileName === '.ssh_private_key') return 'ssh_private_key'
    if (fileName === '.ssh_public_key') return 'ssh_public_key'
    // New indexed format: .ssh_private_key.<id> / .ssh_public_key.<id>
    if (fileName.startsWith('.ssh_private_key.'))
      return `ssh_private_key:${fileName.slice('.ssh_private_key.'.length)}`
    if (fileName.startsWith('.ssh_public_key.'))
      return `ssh_public_key:${fileName.slice('.ssh_public_key.'.length)}`
    return undefined
  }

  private async loadEntrySecretFile(entryId: string, fileName: string): Promise<string | undefined> {
    const secretType = this.toSecretType(fileName)
    if (!secretType) return undefined
    try {
      const result = await this.transport.readSecret(entryId, secretType)
      return typeof result?.value === 'string' ? result.value : undefined
    } catch {
      if (this.transport.isPostRuntimeImportWindow()) {
        const misses = this.transport.recordPostImportMiss('secret')
        this.logger.warn('[PassManager][saveRoot] post-import secret read miss', {
          entryId,
          secretType,
          misses,
        })
      }
      return undefined
    }
  }

  private async saveEntrySecretFile(
    entryId: string,
    fileName: string,
    value: string | null,
  ): Promise<boolean> {
    const secretType = this.toSecretType(fileName)
    if (!secretType) return false
    try {
      if (value === null) {
        await this.transport.deleteSecret(entryId, secretType)
      } else {
        await this.transport.saveSecret(entryId, secretType, value)
      }
      try {
        await this.catalog.refresh()
      } catch {}
      return true
    } catch {
      return false
    }
  }

  private async removeEntrySecretFile(entryId: string, fileName: string): Promise<boolean> {
    return this.saveEntrySecretFile(entryId, fileName, null)
  }

  private async loadPassword(entryId: string): Promise<string | undefined> {
    return this.loadEntrySecretFile(entryId, '.password')
  }

  private async loadNote(entryId: string): Promise<string | undefined> {
    return this.loadEntrySecretFile(entryId, '.note')
  }

  private async savePassword(entryId: string, password: string | null): Promise<boolean> {
    return this.saveEntrySecretFile(entryId, '.password', password)
  }

  private async saveNote(entryId: string, note: string | null): Promise<boolean> {
    return this.saveEntrySecretFile(entryId, '.note', note)
  }

  async readEntryPassword(entryId: string): Promise<string | undefined> {
    return this.loadPassword(entryId)
  }

  async saveEntryPassword(entryId: string, password: string | null): Promise<boolean> {
    return this.savePassword(entryId, password)
  }

  async removeEntryPassword(entryId: string): Promise<boolean> {
    return this.removeEntrySecretFile(entryId, '.password')
  }

  async readEntryNote(entryId: string): Promise<string | undefined> {
    return this.loadNote(entryId)
  }

  async saveEntryNote(entryId: string, note: string | null): Promise<boolean> {
    return this.saveNote(entryId, note)
  }

  async removeEntryNote(entryId: string): Promise<boolean> {
    return this.removeEntrySecretFile(entryId, '.note')
  }

  async readEntrySshPrivateKey(entryId: string, keyId: string): Promise<string | undefined> {
    return this.loadEntrySecretFile(entryId, `.ssh_private_key.${keyId}`)
  }

  async saveEntrySshPrivateKey(entryId: string, keyId: string, key: string | null): Promise<boolean> {
    return this.saveEntrySecretFile(entryId, `.ssh_private_key.${keyId}`, key)
  }

  async removeEntrySshPrivateKey(entryId: string, keyId: string): Promise<boolean> {
    return this.removeEntrySecretFile(entryId, `.ssh_private_key.${keyId}`)
  }

  async readEntrySshPublicKey(entryId: string, keyId: string): Promise<string | undefined> {
    return this.loadEntrySecretFile(entryId, `.ssh_public_key.${keyId}`)
  }

  async saveEntrySshPublicKey(entryId: string, keyId: string, key: string | null): Promise<boolean> {
    return this.saveEntrySecretFile(entryId, `.ssh_public_key.${keyId}`, key)
  }

  async removeEntrySshPublicKey(entryId: string, keyId: string): Promise<boolean> {
    return this.removeEntrySecretFile(entryId, `.ssh_public_key.${keyId}`)
  }

  async removeEntry(id: string): Promise<boolean> {
    try {
      await this.transport.deleteEntry(id)
      try {
        await this.catalog.refresh()
      } catch {}
      return true
    } catch (e) {
      this.setError(ADAPTER_ERROR.READ_ROOT, 'Ошибка точечного удаления записи', e)
      return false
    }
  }

  async moveEntryToGroup(id: string, targetGroupPath: string | undefined): Promise<boolean> {
    try {
      const normalized = normalizeGroupPath(targetGroupPath)
      if (normalized) await this.transport.ensureGroup(normalized)
      await this.transport.moveEntry(id, normalized ?? '')
      this.catalog.queueRefresh(150)
      return true
    } catch (e) {
      this.setError(ADAPTER_ERROR.SAVE_ROOT_WRITE, 'Ошибка перемещения записи в группу', e)
      return false
    }
  }

  async renameEntryTitle(id: string, newTitle: string): Promise<boolean> {
    try {
      const title = sanitizeName(newTitle || id)
      await this.transport.renameEntry(id, title)
      this.catalog.queueRefresh(150)
      return true
    } catch (e) {
      this.setError(ADAPTER_ERROR.SAVE_ROOT_WRITE, 'Ошибка переименования записи', e)
      return false
    }
  }

  async putIcon(contentBase64: string, mimeType: string): Promise<{iconRef: string}> {
    const result = await this.transport.putIcon(contentBase64, mimeType)
    return {iconRef: String(result.icon_ref)}
  }

  async getIcon(iconRef: string): Promise<{iconRef: string; mimeType: string; contentBase64: string}> {
    try {
      const result = await this.transport.getIcon(iconRef)
      return {
        iconRef: String(result.icon_ref),
        mimeType: String(result.mime_type),
        contentBase64: String(result.content_base64),
      }
    } catch (e) {
      if (this.transport.isPostRuntimeImportWindow()) {
        const misses = this.transport.recordPostImportMiss('icon')
        this.logger.warn('[PassManager][saveRoot] post-import icon read miss', {
          iconRef,
          misses,
        })
      }
      throw e
    }
  }

  async gcIcons(): Promise<{deleted: number}> {
    const result = await this.transport.gcIcons()
    return {deleted: Number(result.deleted)}
  }

  async setGroupMeta(path: string, iconRef: string | null): Promise<boolean> {
    try {
      const normalized = normalizeGroupPath(path)
      if (!normalized) return false
      await this.transport.setGroupMeta(normalized, iconRef)
      this.catalog.queueRefresh(150)
      return true
    } catch (e) {
      this.setError(ADAPTER_ERROR.SAVE_ROOT_WRITE, 'Ошибка сохранения метаданных группы', e)
      return false
    }
  }
}
