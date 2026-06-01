import {atom} from '@reatom/core'

import {ImportOrchestrator} from '../mapper.js'
import {resolveConflictsAutoRename} from '../conflicts.js'
import {i18n} from '../i18n.js'
import {getExistingEntriesMap, getImportCatalogOps} from './import-dialog-state.js'
import type {ImportProgress, ImportResult} from '../types.js'

export type DialogStep = 'file-select' | 'password' | 'preview' | 'progress' | 'complete'

export type ImportCompleteDetail = {
  success: boolean
  progress: ImportProgress
}

type KeePassParserModule = {
  parseKeePass: (file: File, password: string) => Promise<ImportResult>
}

type KeePassParserLoader = () => Promise<KeePassParserModule>

const EMPTY_PROGRESS: ImportProgress = {
  total: 0,
  imported: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
}

export const VISIBLE_STEPS: DialogStep[] = ['file-select', 'preview', 'progress']

export function stepIndex(step: DialogStep): number {
  if (step === 'password') return 0
  if (step === 'complete') return 3
  return VISIBLE_STEPS.indexOf(step)
}

function createEmptyProgress(): ImportProgress {
  return {...EMPTY_PROGRESS}
}

function detectFormat(file: File): 'keepass' | 'csv' | 'bitwarden-json' | 'onepassword-1pux' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.kdbx')) return 'keepass'
  if (name.endsWith('.csv')) return 'csv'
  if (name.endsWith('.json')) return 'bitwarden-json'
  if (name.endsWith('.1pux')) return 'onepassword-1pux'
  return 'unknown'
}

export class ImportDialogModel {
  readonly step = atom<DialogStep>('file-select')
  readonly selectedFile = atom<File | null>(null)
  readonly parseResult = atom<ImportResult | null>(null)
  readonly progressState = atom<ImportProgress>(createEmptyProgress())
  readonly importErrors = atom<string[]>([])
  readonly isImporting = atom(false)
  readonly parseError = atom<string | null>(null)

  private orchestrator: ImportOrchestrator | null = null
  private activeImportRunId = 0
  private importStartInFlight = false

  reset() {
    this.activeImportRunId += 1
    this.importStartInFlight = false
    this.step.set('file-select')
    this.selectedFile.set(null)
    this.parseResult.set(null)
    this.progressState.set(createEmptyProgress())
    this.importErrors.set([])
    this.isImporting.set(false)
    this.parseError.set(null)
    this.orchestrator = null
  }

  async selectFile(file: File) {
    this.parseError.set(null)
    this.selectedFile.set(file)

    const format = detectFormat(file)
    if (format === 'unknown') {
      this.parseError.set(i18n('import:error:unsupported_format'))
      return
    }

    if (format === 'keepass') {
      this.step.set('password')
      return
    }

    await this.parseNonEncryptedFile(file, format)
  }

  async decrypt(password: string, loadKeePassParser: KeePassParserLoader = () => import('../parsers/keepass.js')) {
    const file = this.selectedFile()
    if (!file) return

    if (!password) {
      this.parseError.set(i18n('import:password:empty'))
      return
    }

    this.parseError.set(null)

    try {
      const {parseKeePass} = await loadKeePassParser()
      const result = await parseKeePass(file, password)
      this.parseResult.set(result)
      this.step.set('preview')
    } catch (e) {
      this.parseError.set(e instanceof Error ? e.message : String(e))
    }
  }

  async startImport(): Promise<ImportCompleteDetail | null> {
    if (this.importStartInFlight || this.isImporting()) return null

    const catalogOps = getImportCatalogOps()
    if (!catalogOps) {
      this.parseError.set('Catalog operations not configured.')
      return null
    }

    const result = this.parseResult()
    if (!result || result.entries.length === 0) return null

    this.importStartInFlight = true
    const runId = ++this.activeImportRunId
    let currentOrchestrator: ImportOrchestrator | null = null

    try {
      const existingEntriesMap = getExistingEntriesMap()
      if (catalogOps.setGroupIcon) {
        for (const folder of result.folders) {
          if (runId !== this.activeImportRunId) return null

          const icon = folder.icon
          if (!icon) continue

          let iconRef = icon.iconRef
          if (!iconRef && icon.contentBase64 && catalogOps.putIcon) {
            try {
              const uploaded = await catalogOps.putIcon(icon.contentBase64, icon.mimeType ?? 'image/png')
              iconRef = uploaded.iconRef
            } catch {
              result.warnings.push(`Failed to import icon for folder "${folder.path}"`)
              continue
            }
          }

          if (!iconRef) continue

          try {
            await catalogOps.setGroupIcon(folder.path, iconRef)
          } catch {
            result.warnings.push(`Failed to set icon metadata for folder "${folder.path}"`)
          }
        }
      }

      if (runId !== this.activeImportRunId) return null

      this.step.set('progress')
      this.isImporting.set(true)
      currentOrchestrator = new ImportOrchestrator()
      this.orchestrator = currentOrchestrator

      const importResult = await currentOrchestrator.execute(
        catalogOps,
        result.entries,
        (progress) => {
          if (runId !== this.activeImportRunId) return
          this.progressState.set({...progress})
        },
        existingEntriesMap ?? undefined,
      )

      if (runId !== this.activeImportRunId) return null

      this.importErrors.set(importResult.errors)
      this.step.set('complete')
      return {success: importResult.success, progress: importResult.progress}
    } finally {
      if (runId === this.activeImportRunId) {
        this.importStartInFlight = false
        this.isImporting.set(false)
        if (this.orchestrator === currentOrchestrator) {
          this.orchestrator = null
        }
      }
    }
  }

  cancelImport() {
    this.orchestrator?.abort()
  }

  private async parseNonEncryptedFile(file: File, format: 'csv' | 'bitwarden-json' | 'onepassword-1pux') {
    this.parseError.set(null)

    try {
      const result =
        format === 'csv'
          ? await (await import('../parsers/csv.js')).parseCSV(file)
          : format === 'bitwarden-json'
            ? await (await import('../parsers/bitwarden.js')).parseBitwardenJson(file)
            : await (await import('../parsers/1password.js')).parse1Password1PUX(file)

      resolveConflictsAutoRename(result.entries, new Set<string>())
      this.parseResult.set(result)
      this.step.set('preview')
    } catch (e) {
      this.parseError.set(e instanceof Error ? e.message : String(e))
    }
  }
}
