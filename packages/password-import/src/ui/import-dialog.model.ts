import {abortVar, action, atom, withAbort, withAsync, wrap} from '@reatom/core'

import {i18n} from '../i18n.js'
import type {
  CredentialImportService,
  ImportReview,
  ImportTransferProgress,
} from '../credential-import-service.js'
import {getCredentialImportService} from './import-dialog-state.js'
import type {ImportProgress} from '../types.js'

export type DialogStep = 'file-select' | 'password' | 'preparing' | 'preview' | 'progress' | 'complete'
export type ImportCompleteDetail = {success: boolean; progress: ImportProgress}

const emptyProgress = (): ImportProgress => ({total: 0, imported: 0, updated: 0, skipped: 0, errors: 0})
export const VISIBLE_STEPS: DialogStep[] = ['file-select', 'preview', 'progress']

export function stepIndex(step: DialogStep): number {
  if (step === 'password' || step === 'preparing') return 0
  if (step === 'complete') return 3
  return VISIBLE_STEPS.indexOf(step)
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNKNOWN_COMMAND') {
    return i18n('import:error:update_host')
  }
  return error instanceof Error ? error.message : String(error)
}

export class ImportDialogModel {
  readonly step = atom<DialogStep>('file-select', 'import.step')
  readonly selectedFile = atom<File | null>(null, 'import.file')
  readonly review = atom<ImportReview | null>(null, 'import.review')
  readonly transfer = atom<ImportTransferProgress>({received: 0, total: 0}, 'import.transfer')
  readonly progressState = atom<ImportProgress>(emptyProgress(), 'import.progress')
  readonly importErrors = atom<string[]>([], 'import.errors')
  readonly isImporting = atom(false, 'import.committing')
  readonly parseError = atom<string | null>(null, 'import.error')
  private service: CredentialImportService | null = null

  reset(): void {
    this.prepare.abort()
    this.commitImport.abort()
    void this.service?.cancel()
    this.service = null
    this.step.set('file-select')
    this.selectedFile.set(null)
    this.review.set(null)
    this.transfer.set({received: 0, total: 0})
    this.progressState.set(emptyProgress())
    this.importErrors.set([])
    this.isImporting.set(false)
    this.parseError.set(null)
  }

  async selectFile(file: File): Promise<void> {
    if (this.isImporting()) return
    this.reset()
    if (!/\.(kdbx|csv|json|1pux)$/i.test(file.name)) {
      this.parseError.set(i18n('import:error:unsupported_format'))
      return
    }
    this.selectedFile.set(file)
    if (/\.kdbx$/i.test(file.name)) {
      this.step.set('password')
      return
    }
    await wrap(this.prepareFile(file))
  }

  async decrypt(password: string): Promise<void> {
    const file = this.selectedFile()
    if (!file || this.step() !== 'password') return
    // Empty passwords are valid for KeePass databases protected without a password.
    await wrap(this.prepareFile(file, password))
  }

  private async prepareFile(file: File, password?: string): Promise<void> {
    try {
      await wrap(this.prepare(file, password))
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error
    }
  }

  async startImport(): Promise<ImportCompleteDetail | null> {
    if (this.isImporting()) return null
    try {
      return await wrap(this.commitImport())
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return null
      throw error
    }
  }

  private readonly prepare = action(async (file: File, password?: string): Promise<void> => {
    const signal = abortVar.require().signal
    this.parseError.set(null)
    this.step.set('preparing')
    this.transfer.set({received: 0, total: file.size})
    this.service = getCredentialImportService()
    try {
      if (!this.service) throw new Error('Credential import is not connected to an unlocked vault.')
      const review = await wrap(
        this.service.review(
          file,
          password,
          signal,
          wrap((progress) => {
            if (!signal.aborted) this.transfer.set(progress)
          }),
        ),
      )
      this.review.set(review)
      this.selectedFile.set(null)
      this.step.set('preview')
    } catch (error) {
      if (signal.aborted) return
      this.parseError.set(errorMessage(error))
      this.step.set(/\.kdbx$/i.test(file.name) ? 'password' : 'file-select')
    }
  }, 'import.prepare').extend(withAsync(), withAbort())

  private readonly commitImport = action(async (): Promise<ImportCompleteDetail | null> => {
    if (this.isImporting()) return null
    const review = this.review()
    if (!review || !this.service || this.step() !== 'preview') return null
    const signal = abortVar.require().signal
    this.isImporting.set(true)
    this.step.set('progress')
    try {
      await wrap(this.service.commit(signal))
      const progress = {
        ...emptyProgress(),
        total: review.entry_count,
        imported: review.created_entry_count,
        updated: review.updated_entry_count,
      }
      this.progressState.set(progress)
      this.review.set(null)
      this.step.set('complete')
      return {success: true, progress}
    } catch (error) {
      if (signal.aborted) return null
      this.importErrors.set([errorMessage(error)])
      this.review.set(null)
      this.step.set('complete')
      return {success: false, progress: this.progressState()}
    } finally {
      if (!signal.aborted) this.isImporting.set(false)
    }
  }, 'import.commit').extend(withAsync(), withAbort('first-in-win'))
}
