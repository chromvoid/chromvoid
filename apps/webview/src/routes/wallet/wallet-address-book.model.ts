import {atom, computed, wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import type {WalletKnownNetwork} from './wallet-network'
import type {WalletAddressBookEntry, WalletRpcPort} from './wallet-page.types'

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class WalletAddressBookModel {
  readonly entries = atom<WalletAddressBookEntry[]>([], 'wallet.addressBook.entries')
  readonly loaded = atom(false, 'wallet.addressBook.loaded')
  readonly loading = atom(false, 'wallet.addressBook.loading')
  readonly saving = atom(false, 'wallet.addressBook.saving')
  readonly error = atom<string | null>(null, 'wallet.addressBook.error')
  readonly editorEntryId = atom<string | null>(null, 'wallet.addressBook.editorEntryId')
  readonly editorLabel = atom('', 'wallet.addressBook.editorLabel')
  readonly editorAddress = atom('', 'wallet.addressBook.editorAddress')
  readonly editorLabelError = atom<string | null>(null, 'wallet.addressBook.editorLabelError')
  readonly editorAddressError = atom<string | null>(null, 'wallet.addressBook.editorAddressError')

  readonly networkEntries = computed(() => {
    const network = this.getNetwork()
    return network ? this.entries().filter((entry) => entry.network === network) : []
  }, 'wallet.addressBook.networkEntries')

  constructor(
    private readonly rpcPort: WalletRpcPort,
    private readonly getNetwork: () => WalletKnownNetwork | null,
  ) {}

  async load(): Promise<void> {
    if (this.loading() || this.loaded()) return
    this.loading.set(true)
    this.error.set(null)
    try {
      const response = await wrap(this.rpcPort.rpc('wallet:addressBook:list', {}))
      this.entries.set(response.entries)
      this.loaded.set(true)
    } catch (error) {
      this.error.set(errorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  beginCreate(address = ''): void {
    this.editorEntryId.set(null)
    this.editorLabel.set('')
    this.editorAddress.set(address)
    this.clearEditorErrors()
  }

  beginEdit(entry: WalletAddressBookEntry): void {
    this.editorEntryId.set(entry.entry_id)
    this.editorLabel.set(entry.label)
    this.editorAddress.set(entry.address)
    this.clearEditorErrors()
  }

  setEditorLabel(value: string): void {
    this.editorLabel.set(value)
    this.editorLabelError.set(null)
  }

  setEditorAddress(value: string): void {
    this.editorAddress.set(value)
    this.editorAddressError.set(null)
  }

  async save(): Promise<boolean> {
    const network = this.getNetwork()
    const label = this.editorLabel().trim()
    const address = this.editorAddress().trim()
    this.clearEditorErrors()
    if (!network) return false
    if (label.length < 1 || label.length > 80) {
      this.editorLabelError.set(i18n('wallet:send:error:contact-label'))
    }
    if (!address) this.editorAddressError.set(i18n('wallet:send:error:address-required'))
    if (this.editorLabelError() || this.editorAddressError()) return false

    this.saving.set(true)
    this.error.set(null)
    try {
      const entryId = this.editorEntryId()
      const response = entryId
        ? await wrap(
            this.rpcPort.rpc('wallet:addressBook:update', {
              entry_id: entryId,
              label,
              network,
              address,
            }),
          )
        : await wrap(this.rpcPort.rpc('wallet:addressBook:create', {label, network, address}))
      const next = this.entries().filter((entry) => entry.entry_id !== response.entry.entry_id)
      this.entries.set([...next, response.entry].sort((left, right) => left.label.localeCompare(right.label)))
      return true
    } catch (error) {
      this.error.set(errorMessage(error))
      return false
    } finally {
      this.saving.set(false)
    }
  }

  async delete(entryId: string): Promise<void> {
    if (this.saving()) return
    this.saving.set(true)
    this.error.set(null)
    try {
      await wrap(this.rpcPort.rpc('wallet:addressBook:delete', {entry_id: entryId}))
      this.entries.set(this.entries().filter((entry) => entry.entry_id !== entryId))
    } catch (error) {
      this.error.set(errorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  private clearEditorErrors(): void {
    this.editorLabelError.set(null)
    this.editorAddressError.set(null)
    this.error.set(null)
  }
}
