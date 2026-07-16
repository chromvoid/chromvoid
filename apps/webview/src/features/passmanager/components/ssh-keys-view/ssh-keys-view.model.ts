import {action, atom, computed, withAsync, wrap} from '@reatom/core'

import type {Entry, PassManagerSshKey} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import type {SshKeyType} from '@project/passmanager/types'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {dialogService} from 'root/shared/services/dialog-service'
import {toast} from 'root/shared/services/toast-manager'
import {pmModel} from '../../password-manager.model'
import {PMEntrySshCreateModel} from '../card/entry-ssh/entry-ssh-create.model'

export type PMSshKeysTypeFilter = 'all' | SshKeyType

export type PMSshKeyRow = PassManagerSshKey & {
  sourceEntryTitle?: string
  sourceEntryPath?: string
  sourceGroupPath?: string
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function getEntryDisplayPath(entry: Entry): string {
  return [...(entry.groupPath?.split('/') ?? []), entry.title].map((part) => part.trim()).filter(Boolean).join('/')
}

export class PMSshKeysViewModel {
  readonly query = atom('', 'passmanager.sshKeysView.query')
  readonly typeFilter = atom<PMSshKeysTypeFilter>('all', 'passmanager.sshKeysView.typeFilter')
  readonly createOpen = atom(false, 'passmanager.sshKeysView.createOpen')
  readonly createForm = new PMEntrySshCreateModel()

  readonly hasRoot = computed(() => Boolean(pmModel.root()), 'passmanager.sshKeysView.hasRoot')
  readonly isLoading = computed(
    () => pmModel.root()?.isLoading?.() ?? false,
    'passmanager.sshKeysView.isLoading',
  )
  readonly isReadOnly = computed(
    () => pmModel.root()?.isReadOnly?.() ?? true,
    'passmanager.sshKeysView.isReadOnly',
  )

  readonly rows = computed(() => {
    const root = pmModel.root()
    if (!root) return [] satisfies PMSshKeyRow[]

    const entriesById = new Map(root.allEntries.map((entry) => [entry.id, entry]))
    return [...root.sshKeys()]
      .sort((a, b) => (b.updatedTs ?? b.createdTs ?? 0) - (a.updatedTs ?? a.createdTs ?? 0))
      .map((key) => {
        const sourceEntry = key.sourceEntryId ? entriesById.get(key.sourceEntryId) : undefined
        return {
          ...key,
          sourceEntryTitle: sourceEntry?.title,
          sourceEntryPath: sourceEntry ? getEntryDisplayPath(sourceEntry) : undefined,
          sourceGroupPath: sourceEntry?.groupPath,
        }
      })
  }, 'passmanager.sshKeysView.rows')

  readonly visibleRows = computed(() => {
    const query = normalizeSearchValue(this.query())
    const typeFilter = this.typeFilter()

    return this.rows().filter((row) => {
      if (typeFilter !== 'all' && row.type !== typeFilter) return false
      if (!query) return true

      return [
        row.name ?? '',
        row.comment ?? '',
        row.fingerprint,
        row.type,
        row.sourceEntryTitle ?? '',
        row.sourceEntryPath ?? '',
      ].some((value) => normalizeSearchValue(value).includes(query))
    })
  }, 'passmanager.sshKeysView.visibleRows')

  readonly summary = computed(() => {
    const rows = this.rows()
    return {
      total: rows.length,
      visible: this.visibleRows().length,
      ed25519: rows.filter((row) => row.type === 'ed25519').length,
      other: rows.filter((row) => row.type !== 'ed25519').length,
    }
  }, 'passmanager.sshKeysView.summary')

  readonly hasActiveFilters = computed(
    () => this.query().trim().length > 0 || this.typeFilter() !== 'all',
    'passmanager.sshKeysView.hasActiveFilters',
  )

  readonly setQuery = action((value: string) => {
    this.query.set(value)
  }, 'passmanager.sshKeysView.setQuery')

  readonly setTypeFilter = action((value: PMSshKeysTypeFilter) => {
    this.typeFilter.set(value)
  }, 'passmanager.sshKeysView.setTypeFilter')

  readonly clearFilters = action(() => {
    this.query.set('')
    this.typeFilter.set('all')
  }, 'passmanager.sshKeysView.clearFilters')

  readonly openCreate = action(() => {
    if (this.isReadOnly()) return
    this.createForm.reset()
    this.createOpen.set(true)
  }, 'passmanager.sshKeysView.openCreate')

  readonly closeCreate = action(() => {
    this.createOpen.set(false)
    this.createForm.reset()
  }, 'passmanager.sshKeysView.closeCreate')

  readonly generate = action(async () => {
    const root = pmModel.root()
    if (!root || this.isReadOnly() || !this.createForm.validate()) return false

    const form = this.createForm.getFormData()
    this.createForm.setPending()
    try {
      const result = await wrap(root.generateSshKey(form))
      this.createForm.setResult({
        keyId: result.keyId,
        keyType: result.keyType,
        fingerprint: result.fingerprint,
        publicKey: result.publicKeyOpenssh,
        name: form.name,
        comment: form.comment,
      })
      return true
    } catch (error) {
      this.createForm.setError(error instanceof Error ? error.message : i18n('error:save'))
      return false
    }
  }, 'passmanager.sshKeysView.generate').extend(withAsync())

  readonly remove = action(async (keyId: string) => {
    const root = pmModel.root()
    if (!root || this.isReadOnly()) return false

    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('ssh:remove:confirm:title'),
        message: i18n('ssh:remove:confirm:text'),
        variant: 'warning',
        confirmVariant: 'danger',
      }),
    ).catch(() => false)
    if (!confirmed) return false

    try {
      await wrap(root.removeSshKey(keyId))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : i18n('notify:remove:error'))
      return false
    }
  }, 'passmanager.sshKeysView.remove').extend(withAsync())

  readonly readPublicKey = action(async (keyId: string) => {
    const root = pmModel.root()
    if (!root) return ''
    const value = await wrap(root.readSshPublicKey(keyId))
    return value ?? ''
  }, 'passmanager.sshKeysView.readPublicKey').extend(withAsync())

  readonly openSourceEntry = action((keyId: string) => {
    const row = this.rows().find((item) => item.id === keyId)
    if (!row?.sourceEntryId || !row.sourceEntryTitle) return
    navigationModel.openPassmanagerRoute({
      kind: 'entry',
      entryId: row.sourceEntryId,
      groupPath: row.sourceGroupPath,
    })
  }, 'passmanager.sshKeysView.openSourceEntry')
}

export const pmSshKeysViewModel = new PMSshKeysViewModel()
