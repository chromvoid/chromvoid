import {action, atom, computed} from '@reatom/core'

import {i18n} from '@project/passmanager/i18n'
import type {SshKeyType} from '@project/passmanager/types'

export type PMEntrySshCreateResetOptions = {
  entryTitle?: string
  username?: string
}

export type PMEntrySshCreateResult = {
  keyId?: string
  keyType: SshKeyType
  fingerprint: string
  publicKey?: string
  name: string
  comment: string
  pending?: boolean
}

export type PMEntrySshCreateFormData = {
  keyType: SshKeyType
  name: string
  comment: string
}

export class PMEntrySshCreateModel {
  private readonly keyTypeState = atom<SshKeyType>('ed25519', 'passmanager.entrySshCreate.keyType')
  private readonly nameState = atom('', 'passmanager.entrySshCreate.name')
  private readonly commentState = atom('', 'passmanager.entrySshCreate.comment')
  private readonly advancedOpenState = atom(false, 'passmanager.entrySshCreate.advancedOpen')
  private readonly resultState = atom<PMEntrySshCreateResult | null>(null, 'passmanager.entrySshCreate.result')
  private readonly errorState = atom('', 'passmanager.entrySshCreate.error')
  private readonly nameTouchedState = atom(false, 'passmanager.entrySshCreate.nameTouched')
  private readonly commentTouchedState = atom(false, 'passmanager.entrySshCreate.commentTouched')

  private readonly nameErrorState = computed(() => this.getNameError(), 'passmanager.entrySshCreate.nameError')
  private readonly canSubmitState = computed(() => !this.getNameError(), 'passmanager.entrySshCreate.canSubmit')

  readonly state = {
    keyType: this.keyTypeState,
    name: this.nameState,
    comment: this.commentState,
    advancedOpen: this.advancedOpenState,
    result: this.resultState,
    error: this.errorState,
    nameError: this.nameErrorState,
    canSubmit: this.canSubmitState,
  }

  readonly keyType = this.keyTypeState
  readonly name = this.nameState
  readonly comment = this.commentState
  readonly advancedOpen = this.advancedOpenState
  readonly result = this.resultState
  readonly error = this.errorState
  readonly nameError = this.nameErrorState
  readonly canSubmit = this.canSubmitState

  readonly actions = {
    reset: action((options?: PMEntrySshCreateResetOptions) => {
      const defaults = this.getDefaults(options)
      this.keyTypeState.set('ed25519')
      this.nameState.set(defaults.name)
      this.commentState.set(defaults.comment)
      this.advancedOpenState.set(false)
      this.resultState.set(null)
      this.errorState.set('')
      this.nameTouchedState.set(false)
      this.commentTouchedState.set(false)
    }, 'passmanager.entrySshCreate.reset'),

    setDefaultEntry: action((options?: PMEntrySshCreateResetOptions) => {
      const defaults = this.getDefaults(options)
      if (!this.nameTouchedState()) {
        this.nameState.set(defaults.name)
      }
      if (!this.commentTouchedState()) {
        this.commentState.set(defaults.comment)
      }
      this.refreshResultAfterEdit()
    }, 'passmanager.entrySshCreate.setDefaultEntry'),

    setKeyType: action((value: SshKeyType) => {
      this.keyTypeState.set(value)
      if (value !== 'ed25519') {
        this.advancedOpenState.set(true)
      }
      this.refreshResultAfterEdit()
      this.errorState.set('')
    }, 'passmanager.entrySshCreate.setKeyType'),

    setName: action((value: string) => {
      this.nameState.set(value)
      this.nameTouchedState.set(true)
      this.refreshResultAfterEdit()
      this.errorState.set('')
    }, 'passmanager.entrySshCreate.setName'),

    setComment: action((value: string) => {
      this.commentState.set(value)
      this.commentTouchedState.set(true)
      this.refreshResultAfterEdit()
      this.errorState.set('')
    }, 'passmanager.entrySshCreate.setComment'),

    setAdvancedOpen: action((value: boolean) => {
      this.advancedOpenState.set(value)
    }, 'passmanager.entrySshCreate.setAdvancedOpen'),

    setPending: action(() => {
      const form = this.getFormData()
      this.resultState.set({
        keyType: form.keyType,
        fingerprint: '',
        name: form.name,
        comment: form.comment,
        pending: true,
      })
      this.errorState.set('')
    }, 'passmanager.entrySshCreate.setPending'),

    setResult: action((result: PMEntrySshCreateResult) => {
      this.resultState.set({
        ...result,
        name: result.name.trim(),
        comment: result.comment.trim(),
        pending: false,
      })
      this.errorState.set('')
    }, 'passmanager.entrySshCreate.setResult'),

    setError: action((value: string) => {
      this.errorState.set(value)
      this.resultState.set(null)
    }, 'passmanager.entrySshCreate.setError'),

    clearResult: action(() => {
      this.resultState.set(null)
    }, 'passmanager.entrySshCreate.clearResult'),
  }

  reset(options?: PMEntrySshCreateResetOptions): void {
    this.actions.reset(options)
  }

  setDefaultEntry(options?: PMEntrySshCreateResetOptions): void {
    this.actions.setDefaultEntry(options)
  }

  setKeyType(value: SshKeyType): void {
    this.actions.setKeyType(value)
  }

  setName(value: string): void {
    this.actions.setName(value)
  }

  setComment(value: string): void {
    this.actions.setComment(value)
  }

  setAdvancedOpen(value: boolean): void {
    this.actions.setAdvancedOpen(value)
  }

  setPending(): void {
    this.actions.setPending()
  }

  setResult(result: PMEntrySshCreateResult): void {
    this.actions.setResult(result)
  }

  setError(value: string): void {
    this.actions.setError(value)
  }

  clearResult(): void {
    this.actions.clearResult()
  }

  validate(): boolean {
    this.nameTouchedState.set(true)
    this.errorState.set('')
    return this.canSubmit()
  }

  getFormData(): PMEntrySshCreateFormData {
    return {
      keyType: this.keyTypeState(),
      name: this.nameState().trim(),
      comment: this.commentState().trim(),
    }
  }

  private getDefaults(options?: PMEntrySshCreateResetOptions): PMEntrySshCreateFormData {
    const entryTitle = options?.entryTitle?.trim() || ''
    const username = options?.username?.trim() || ''
    const name = entryTitle ? `${entryTitle} SSH` : i18n('ssh:name:default')
    const comment = username && entryTitle ? `${username}@${entryTitle}` : entryTitle || username

    return {
      keyType: 'ed25519',
      name,
      comment,
    }
  }

  private getNameError(): string {
    return this.nameState().trim() ? '' : i18n('ssh:error:name_required')
  }

  private refreshResultAfterEdit(): void {
    const current = this.resultState()
    if (!current) return
    if (!current.pending) {
      this.resultState.set(null)
      return
    }

    const form = this.getFormData()
    this.resultState.set({
      keyType: form.keyType,
      fingerprint: '',
      name: form.name,
      comment: form.comment,
      pending: true,
    })
  }
}
