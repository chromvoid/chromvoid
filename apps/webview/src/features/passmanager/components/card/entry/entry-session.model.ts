import {computed, state} from '@statx/core'
import type {State} from '@statx/core'

import {Entry} from '@project/passmanager'
import {defaultLogger} from 'root/core/logger'

export type PMEntrySecretStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

export type PMEntrySecretResource = {
  status: PMEntrySecretStatus
  value: string
  error?: string
}

const createIdleSecretResource = (): PMEntrySecretResource => ({
  status: 'idle',
  value: '',
})

export class PMEntrySessionModel {
  private readonly logger = defaultLogger
  private readonly activeEntryId = state<string | undefined>(undefined)
  private readonly passwordResourceState = state<PMEntrySecretResource>(createIdleSecretResource())
  private readonly noteResourceState = state<PMEntrySecretResource>(createIdleSecretResource())

  readonly sshPublicKeys = state<Record<string, string>>({})
  readonly password = computed<string | undefined>(() => {
    const resource = this.passwordResourceState()
    return resource.status === 'ready' ? resource.value : undefined
  })
  readonly note = computed<string>(() => {
    const resource = this.noteResourceState()
    return resource.status === 'ready' ? resource.value : ''
  })
  readonly isNoteLoading = computed<boolean>(() => {
    const status = this.noteResourceState().status
    return status === 'idle' || status === 'loading'
  })

  private secretLoadVersion = 0
  private sshLoadVersion = 0
  private secretLoadEntryId: string | undefined
  private secretLoadPromise: Promise<void> | undefined
  private lastSshKeyRef: string | undefined

  get passwordResource(): State<PMEntrySecretResource> {
    return this.passwordResourceState
  }

  get noteResource(): State<PMEntrySecretResource> {
    return this.noteResourceState
  }

  attach(entry: Entry): void {
    const isNewEntry = this.activeEntryId.peek() !== entry.id
    if (isNewEntry) {
      this.resetForEntry(entry.id)
    }

    if (this.shouldLoadSecrets()) {
      void this.reloadSecrets(entry)
    }

    this.reloadSsh(entry)
  }

  detach(): void {
    this.secretLoadVersion++
    this.sshLoadVersion++
    this.secretLoadEntryId = undefined
    this.secretLoadPromise = undefined
    this.lastSshKeyRef = undefined
    this.activeEntryId.set(undefined)
    this.passwordResourceState.set(createIdleSecretResource())
    this.noteResourceState.set(createIdleSecretResource())
    this.sshPublicKeys.set({})
  }

  async ensureSecretsLoaded(entry: Entry): Promise<void> {
    this.attach(entry)

    if (this.secretLoadPromise) {
      return this.secretLoadPromise
    }

    if (!this.shouldLoadSecrets()) {
      return
    }

    await this.reloadSecrets(entry)
  }

  applySavedSecrets(next: {password?: string; note?: string}): void {
    if (next.password !== undefined) {
      this.passwordResourceState.set(this.toResolvedSecretResource(next.password))
    }

    if (next.note !== undefined) {
      this.noteResourceState.set(this.toResolvedSecretResource(next.note))
    }
  }

  async loadPasswordFor(entry: Entry): Promise<void> {
    await this.ensureSecretsLoaded(entry)
  }

  loadNoteFor(entry: Entry): void {
    void this.ensureSecretsLoaded(entry)
  }

  loadSshPublicKeysFor(entry: Entry): void {
    if (this.activeEntryId.peek() !== entry.id) {
      this.resetForEntry(entry.id)
    }

    this.reloadSsh(entry)
  }

  reloadSsh(entry: Entry): void {
    const sshKeyRef = `${entry.id}:${entry.sshKeys.map((key) => key.id).join(',')}`
    if (sshKeyRef === this.lastSshKeyRef) {
      return
    }

    this.lastSshKeyRef = sshKeyRef
    const loadVersion = ++this.sshLoadVersion

    try {
      this.logger.debug('[PassManager][EntrySession] ssh load begin', {
        entryId: entry.id,
        keyIds: entry.sshKeys.map((key) => key.id),
        loadVersion,
      })
    } catch {}

    this.sshPublicKeys.set({})
    if (entry.sshKeys.length === 0) {
      return
    }

    for (const key of entry.sshKeys) {
      void this.loadSshPublicKey(entry, key.id, loadVersion)
    }
  }

  disconnect(): void {
    this.detach()
  }

  private shouldLoadSecrets(): boolean {
    const passwordStatus = this.passwordResourceState.peek().status
    const noteStatus = this.noteResourceState.peek().status

    return passwordStatus === 'idle' || noteStatus === 'idle'
  }

  private resetForEntry(entryId: string): void {
    this.secretLoadVersion++
    this.sshLoadVersion++
    this.secretLoadEntryId = undefined
    this.secretLoadPromise = undefined
    this.lastSshKeyRef = undefined
    this.activeEntryId.set(entryId)
    this.passwordResourceState.set(createIdleSecretResource())
    this.noteResourceState.set(createIdleSecretResource())
    this.sshPublicKeys.set({})
  }

  private reloadSecrets(entry: Entry): Promise<void> {
    if (this.secretLoadPromise && this.secretLoadEntryId === entry.id) {
      return this.secretLoadPromise
    }

    const loadVersion = ++this.secretLoadVersion
    this.passwordResourceState.set({
      status: 'loading',
      value: '',
    })
    this.noteResourceState.set({
      status: 'loading',
      value: '',
    })

    try {
      this.logger.debug('[PassManager][EntrySession] secrets load begin', {
        entryId: entry.id,
        loadVersion,
      })
    } catch {}

    this.secretLoadEntryId = entry.id

    const promise = (async () => {
      let passwordResult: PromiseSettledResult<string | undefined>
      let noteResult: PromiseSettledResult<string | undefined>

      try {
        await entry.flushPendingPersistence()
        ;[passwordResult, noteResult] = await Promise.allSettled([entry.password(), entry.note()])
      } catch (error) {
        passwordResult = {
          status: 'rejected',
          reason: error,
        }
        noteResult = {
          status: 'rejected',
          reason: error,
        }
      }

      if (loadVersion !== this.secretLoadVersion || this.activeEntryId.peek() !== entry.id) {
        try {
          this.logger.debug('[PassManager][EntrySession] secrets load stale', {
            entryId: entry.id,
            loadVersion,
            activeLoadVersion: this.secretLoadVersion,
            activeEntryId: this.activeEntryId.peek(),
          })
        } catch {}
        return
      }

      const nextPassword = this.resolveSecretResult(passwordResult)
      const nextNote = this.resolveSecretResult(noteResult)
      this.passwordResourceState.set(nextPassword)
      this.noteResourceState.set(nextNote)

      try {
        this.logger.debug('[PassManager][EntrySession] secrets load result', {
          entryId: entry.id,
          loadVersion,
          passwordStatus: nextPassword.status,
          noteStatus: nextNote.status,
        })
      } catch {}
    })().finally(() => {
      if (this.secretLoadPromise === promise) {
        this.secretLoadEntryId = undefined
        this.secretLoadPromise = undefined
      }
    })

    this.secretLoadPromise = promise
    return promise
  }

  private resolveSecretResult(
    result: PromiseSettledResult<string | undefined>,
  ): PMEntrySecretResource {
    if (result.status === 'rejected') {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      try {
        this.logger.warn('[PassManager][EntrySession] secret read failed', {message})
      } catch {}

      return {
        status: 'error',
        value: '',
        error: message,
      }
    }

    return this.toResolvedSecretResource(result.value)
  }

  private toResolvedSecretResource(value: string | undefined): PMEntrySecretResource {
    const resolvedValue = value ? String(value) : ''
    if (!resolvedValue) {
      return {
        status: 'missing',
        value: '',
      }
    }

    return {
      status: 'ready',
      value: resolvedValue,
    }
  }

  private async loadSshPublicKey(entry: Entry, keyId: string, loadVersion: number): Promise<void> {
    let publicKey = ''

    try {
      this.logger.debug('[PassManager][EntrySession] ssh read begin', {
        entryId: entry.id,
        keyId,
        loadVersion,
      })
    } catch {}

    try {
      publicKey = (await entry.sshPublicKey(keyId)) ?? ''
      try {
        this.logger.debug('[PassManager][EntrySession] ssh read result', {
          entryId: entry.id,
          keyId,
          loadVersion,
          hasValue: publicKey.length > 0,
        })
      } catch {}
    } catch (error) {
      try {
        this.logger.warn('[PassManager][EntrySession] ssh read failed', {
          entryId: entry.id,
          keyId,
          loadVersion,
          message: error instanceof Error ? error.message : String(error),
        })
      } catch {}
    }

    if (loadVersion !== this.sshLoadVersion || this.activeEntryId.peek() !== entry.id) {
      try {
        this.logger.debug('[PassManager][EntrySession] ssh read stale', {
          entryId: entry.id,
          keyId,
          loadVersion,
          activeLoadVersion: this.sshLoadVersion,
          activeEntryId: this.activeEntryId.peek(),
        })
      } catch {}
      return
    }

    this.sshPublicKeys.set({
      ...this.sshPublicKeys.peek(),
      [keyId]: publicKey,
    })
  }
}
