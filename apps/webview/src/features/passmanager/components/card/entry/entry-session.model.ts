import {
  action,
  atom,
  computed,
  type Atom,
  type Computed,
  withConnectHook,
  wrap,
} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
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

export interface PMEntrySessionState {
  readonly passwordResource: Computed<PMEntrySecretResource>
  readonly noteResource: Computed<PMEntrySecretResource>
  readonly cardPanResource: Computed<PMEntrySecretResource>
  readonly cardCvvResource: Computed<PMEntrySecretResource>
  readonly sshPublicKeys: Atom<Record<string, string>>
  readonly password: Computed<string | undefined>
  readonly note: Computed<string>
  readonly cardPan: Computed<string | undefined>
  readonly cardCvv: Computed<string | undefined>
  readonly isNoteLoading: Computed<boolean>
  readonly isCardPanLoading: Computed<boolean>
  readonly isCardCvvLoading: Computed<boolean>
}

export interface PMEntrySessionActions {
  attach(entry: Entry): void
  detach(): void
  disconnect(): void
  ensureSecretsLoaded(entry: Entry): Promise<void>
  applySavedSecrets(next: {password?: string; note?: string; cardPan?: string; cardCvv?: string | null}): void
  loadPasswordFor(entry: Entry): Promise<void>
  loadNoteFor(entry: Entry): void
  loadSshPublicKeysFor(entry: Entry): Promise<void>
  reloadSsh(entry: Entry): Promise<void>
}

export interface PMEntrySessionController {
  readonly state: PMEntrySessionState
  readonly actions: PMEntrySessionActions
}

export class PMEntrySessionModel implements PMEntrySessionController {
  private readonly logger = defaultLogger
  private readonly activeEntryId = atom<string | undefined>(undefined, 'passmanager.entrySession.activeEntryId')
  private readonly activeEntryState = atom<Entry | undefined>(undefined, 'passmanager.entrySession.activeEntry')
  private readonly activeSshSignature = atom<string | undefined>(undefined, 'passmanager.entrySession.activeSshSignature')
  private readonly setPasswordResourceState = action((resource: PMEntrySecretResource) => {
    this.passwordResourceState.set(resource)
  }, 'passmanager.entrySession.setPasswordResource')
  private readonly setNoteResourceState = action((resource: PMEntrySecretResource) => {
    this.noteResourceState.set(resource)
  }, 'passmanager.entrySession.setNoteResource')
  private readonly setCardPanResourceState = action((resource: PMEntrySecretResource) => {
    this.cardPanResourceState.set(resource)
  }, 'passmanager.entrySession.setCardPanResource')
  private readonly setCardCvvResourceState = action((resource: PMEntrySecretResource) => {
    this.cardCvvResourceState.set(resource)
  }, 'passmanager.entrySession.setCardCvvResource')
  private readonly setSshPublicKeysState = action((next: Record<string, string>) => {
    this.sshPublicKeysState.set(next)
  }, 'passmanager.entrySession.setSshPublicKeys')

  private readonly passwordResourceState = atom<PMEntrySecretResource>(
    createIdleSecretResource(),
    'passmanager.entrySession.passwordResource',
  ).extend(
    withConnectHook(() => {
      const entry = this.activeEntryState()
      if (entry && this.passwordResourceState().status === 'idle') {
        void this.actions.ensureSecretsLoaded(entry)
      }
    }),
  )
  private readonly noteResourceState = atom<PMEntrySecretResource>(
    createIdleSecretResource(),
    'passmanager.entrySession.noteResource',
  )
  private readonly cardPanResourceState = atom<PMEntrySecretResource>(
    createIdleSecretResource(),
    'passmanager.entrySession.cardPanResource',
  )
  private readonly cardCvvResourceState = atom<PMEntrySecretResource>(
    createIdleSecretResource(),
    'passmanager.entrySession.cardCvvResource',
  )
  private readonly sshPublicKeysState = atom<Record<string, string>>({}, 'passmanager.entrySession.sshPublicKeys').extend(
    withConnectHook(() => {
      const entry = this.activeEntryState()
      if (entry && Object.keys(this.sshPublicKeysState()).length === 0) {
        void this.actions.reloadSsh(entry)
      }
    }),
  )

  readonly state: PMEntrySessionState = {
    passwordResource: this.passwordResourceState,
    noteResource: this.noteResourceState,
    cardPanResource: this.cardPanResourceState,
    cardCvvResource: this.cardCvvResourceState,
    sshPublicKeys: this.sshPublicKeysState,
    password: computed<string | undefined>(() => {
      const resource = this.passwordResourceState()
      return resource.status === 'ready' ? resource.value : undefined
    }, 'passmanager.entrySession.password'),
    note: computed<string>(() => {
      const resource = this.noteResourceState()
      return resource.status === 'ready' ? resource.value : ''
    }, 'passmanager.entrySession.note'),
    cardPan: computed<string | undefined>(() => {
      const resource = this.cardPanResourceState()
      return resource.status === 'ready' ? resource.value : undefined
    }, 'passmanager.entrySession.cardPan'),
    cardCvv: computed<string | undefined>(() => {
      const resource = this.cardCvvResourceState()
      return resource.status === 'ready' ? resource.value : undefined
    }, 'passmanager.entrySession.cardCvv'),
    isNoteLoading: computed<boolean>(() => {
      const status = this.noteResourceState().status
      return status === 'idle' || status === 'loading'
    }, 'passmanager.entrySession.isNoteLoading'),
    isCardPanLoading: computed<boolean>(() => {
      const status = this.cardPanResourceState().status
      return status === 'idle' || status === 'loading'
    }, 'passmanager.entrySession.isCardPanLoading'),
    isCardCvvLoading: computed<boolean>(() => {
      const status = this.cardCvvResourceState().status
      return status === 'idle' || status === 'loading'
    }, 'passmanager.entrySession.isCardCvvLoading'),
  }

  readonly actions: PMEntrySessionActions = {
    attach: action((entry: Entry) => {
      this.syncActiveEntry(entry)
    }, 'passmanager.entrySession.attach'),

    detach: action(() => {
      this.activeEntryId.set(undefined)
      this.activeEntryState.set(undefined)
      this.activeSshSignature.set(undefined)
      this.passwordResourceState.set(createIdleSecretResource())
      this.noteResourceState.set(createIdleSecretResource())
      this.cardPanResourceState.set(createIdleSecretResource())
      this.cardCvvResourceState.set(createIdleSecretResource())
      this.sshPublicKeysState.set({})
    }, 'passmanager.entrySession.detach'),

    disconnect: action(() => {
      this.actions.detach()
    }, 'passmanager.entrySession.disconnect'),

    ensureSecretsLoaded: action(async (entry: Entry) => {
      this.syncActiveEntry(entry, {skipLoads: true})
      if (entry.entryType === 'payment_card') {
        await wrap(
          Promise.all([
            this.loadCardPanResource(entry),
            this.loadCardCvvResource(entry),
            this.loadNoteResource(entry),
          ]),
        )
        return
      }

      await wrap(Promise.all([this.loadPasswordResource(entry), this.loadNoteResource(entry)]))
    }, 'passmanager.entrySession.ensureSecretsLoaded'),

    applySavedSecrets: action((next: {password?: string; note?: string; cardPan?: string; cardCvv?: string | null}) => {
      if (next.password !== undefined) {
        this.passwordResourceState.set(this.toResolvedSecretResource(next.password))
      }

      if (next.note !== undefined) {
        this.noteResourceState.set(this.toResolvedSecretResource(next.note))
      }

      if (next.cardPan !== undefined) {
        this.cardPanResourceState.set(this.toResolvedSecretResource(next.cardPan))
      }

      if (next.cardCvv !== undefined) {
        this.cardCvvResourceState.set(this.toResolvedSecretResource(next.cardCvv ?? undefined))
      }
    }, 'passmanager.entrySession.applySavedSecrets'),

    loadPasswordFor: action(async (entry: Entry) => {
      await this.actions.ensureSecretsLoaded(entry)
    }, 'passmanager.entrySession.loadPasswordFor'),

    loadNoteFor: action((entry: Entry) => {
      void this.actions.ensureSecretsLoaded(entry)
    }, 'passmanager.entrySession.loadNoteFor'),

    loadSshPublicKeysFor: action(async (entry: Entry) => {
      this.syncActiveEntry(entry, {skipLoads: true})
      await this.actions.reloadSsh(entry)
    }, 'passmanager.entrySession.loadSshPublicKeysFor'),

    reloadSsh: action(async (entry: Entry) => {
      const signature = this.getSshSignature(entry)
      const currentKeys = this.sshPublicKeysState()
      if (
        this.activeSshSignature() === signature &&
        Object.keys(currentKeys).length > 0 &&
        Object.values(currentKeys).some((value) => value.length > 0)
      ) {
        return
      }

      try {
        this.logger.debug('[PassManager][EntrySession] ssh load begin', {
          entryId: entry.id,
          keyIds: entry.sshKeys.map((key) => key.id),
          signature,
        })
      } catch {}

      await this.loadSshPublicKeys(entry, signature).catch((error) => {
        if (!this.isAbortError(error)) {
          try {
            this.logger.warn('[PassManager][EntrySession] ssh read failed', {
              entryId: entry.id,
              signature,
              message: this.toErrorMessage(error),
            })
          } catch {}
        }
      })
    }, 'passmanager.entrySession.reloadSsh'),
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

  private syncActiveEntry(entry: Entry, options: {skipLoads?: boolean} = {}): void {
    const currentEntry = this.activeEntryState()
    const currentEntryId = this.activeEntryId()
    const currentSignature = this.activeSshSignature()
    const nextSignature = this.getSshSignature(entry)

    this.activeEntryId.set(entry.id)
    this.activeEntryState.set(entry)

    if (currentEntryId !== entry.id) {
      this.passwordResourceState.set(createIdleSecretResource())
      this.noteResourceState.set(createIdleSecretResource())
      this.cardPanResourceState.set(createIdleSecretResource())
      this.cardCvvResourceState.set(createIdleSecretResource())
      this.sshPublicKeysState.set({})
      this.activeSshSignature.set(nextSignature)
      if (!options.skipLoads) {
        void this.actions.ensureSecretsLoaded(entry).catch(() => {})
        this.actions.reloadSsh(entry)
      }
      return
    }

    if (currentEntry !== entry || currentSignature !== nextSignature) {
      this.passwordResourceState.set(createIdleSecretResource())
      this.noteResourceState.set(createIdleSecretResource())
      this.cardPanResourceState.set(createIdleSecretResource())
      this.cardCvvResourceState.set(createIdleSecretResource())
      this.sshPublicKeysState.set({})
      this.activeSshSignature.set(nextSignature)
      if (!options.skipLoads) {
        void this.actions.ensureSecretsLoaded(entry).catch(() => {})
        this.actions.reloadSsh(entry)
      }
      return
    }

    this.activeSshSignature.set(nextSignature)
  }

  private async loadPasswordResource(entry: Entry): Promise<void> {
    this.passwordResourceState.set({
      status: 'loading',
      value: '',
    })

    const resource = await wrap(this.loadSecretResource(entry, 'password'))
    this.setPasswordResourceState(resource)
  }

  private async loadNoteResource(entry: Entry): Promise<void> {
    this.noteResourceState.set({
      status: 'loading',
      value: '',
    })

    const resource = await wrap(this.loadSecretResource(entry, 'note'))
    this.setNoteResourceState(resource)
  }

  private async loadCardPanResource(entry: Entry): Promise<void> {
    this.cardPanResourceState.set({
      status: 'loading',
      value: '',
    })

    const resource = await wrap(this.loadSecretResource(entry, 'card_pan'))
    this.setCardPanResourceState(resource)
  }

  private async loadCardCvvResource(entry: Entry): Promise<void> {
    this.cardCvvResourceState.set({
      status: 'loading',
      value: '',
    })

    const resource = await wrap(this.loadSecretResource(entry, 'card_cvv'))
    this.setCardCvvResourceState(resource)
  }

  private async loadSecretResource(
    entry: Entry,
    kind: 'password' | 'note' | 'card_pan' | 'card_cvv',
  ): Promise<PMEntrySecretResource> {
    const read =
      kind === 'password'
        ? entry.password.bind(entry)
        : kind === 'note'
          ? entry.note.bind(entry)
          : kind === 'card_pan'
            ? entry.cardPan.bind(entry)
            : entry.cardCvv.bind(entry)

    try {
      await wrap(entry.flushPendingPersistence())
      const value = await wrap(read())

      this.assertEntryStillActive(entry)

      const nextResource = this.toResolvedSecretResource(value)
      try {
        this.logger.debug('[PassManager][EntrySession] secret load result', {
          entryId: entry.id,
          kind,
          status: nextResource.status,
        })
      } catch {}

      return nextResource
    } catch (error) {
      if (this.isAbortError(error)) {
        throw error
      }

      const message = this.toErrorMessage(error)
      try {
        this.logger.warn('[PassManager][EntrySession] secret read failed', {
          entryId: entry.id,
          kind,
          message,
        })
      } catch {}

      return {
        status: 'error',
        value: '',
        error: message,
      }
    }
  }

  private async loadSshPublicKeys(entry: Entry, signature: string): Promise<void> {
    try {
      await wrap(entry.flushPendingPersistence())
      const next: Record<string, string> = {}
      const keyIds = entry.sshKeys.map((key) => key.id)

      if (keyIds.length === 0) {
        this.assertEntryStillActive(entry, signature)
        this.setSshPublicKeysState(next)
        return
      }

      const values = await wrap(
        Promise.all(
          keyIds.map(async (keyId) => {
            try {
              const publicKey = (await wrap(entry.sshPublicKey(keyId))) ?? ''
              try {
                this.logger.debug('[PassManager][EntrySession] ssh read result', {
                  entryId: entry.id,
                  keyId,
                  signature,
                  hasValue: publicKey.length > 0,
                })
              } catch {}

              return [keyId, publicKey] as const
            } catch (error) {
              try {
                this.logger.warn('[PassManager][EntrySession] ssh read failed', {
                  entryId: entry.id,
                  keyId,
                  signature,
                  message: this.toErrorMessage(error),
                })
              } catch {}
              return [keyId, ''] as const
            }
          }),
        ),
      )

      this.assertEntryStillActive(entry, signature)

      for (const [keyId, publicKey] of values) {
        next[keyId] = publicKey
      }

      if (Object.values(next).every((value) => value.length === 0)) {
        await wrap(entry.flushPendingPersistence())

        const retriedValues = await wrap(
          Promise.all(
            keyIds.map(async (keyId) => {
              try {
                return [keyId, (await wrap(entry.sshPublicKey(keyId))) ?? ''] as const
              } catch {
                return [keyId, ''] as const
              }
            }),
          ),
        )

        this.assertEntryStillActive(entry, signature)

        for (const [keyId, publicKey] of retriedValues) {
          next[keyId] = publicKey
        }
      }

      this.setSshPublicKeysState(next)
      return
    } catch (error) {
      if (this.isAbortError(error)) {
        throw error
      }

      try {
        this.logger.warn('[PassManager][EntrySession] ssh read failed', {
          entryId: entry.id,
          signature,
          message: this.toErrorMessage(error),
        })
      } catch {}

      this.sshPublicKeysState.set({})
      return
    }
  }

  private getSshSignature(entry: Entry): string {
    return `${entry.id}:${entry.sshKeys.map((key) => key.id).join(',')}`
  }

  private assertEntryStillActive(entry: Entry, signature?: string): void {
    const activeEntry = this.activeEntryState()
    if (activeEntry !== entry || this.activeEntryId() !== entry.id) {
      throw this.createAbortError('stale entry')
    }

    if (signature !== undefined && this.activeSshSignature() !== signature) {
      throw this.createAbortError('stale ssh signature')
    }
  }

  private createAbortError(message: string): Error {
    const error = new Error(message)
    error.name = 'AbortError'
    return error
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name
    }

    return String(error)
  }
}
