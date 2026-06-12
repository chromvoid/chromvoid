import {atom, computed, wrap} from '@reatom/core'

import {v4} from 'uuid'

import {i18n} from '../i18n'
import {confirmPassManagerAction} from './dialog'
import type {Entry} from './entry'

export type FileSnapshot = {
  name?: string
  type?: string
  b64: string
  id: string
}

type ID = string

type EntryFileStatus = 'ready' | 'saving' | 'loading' | 'fetched' | 'deleted'

export class EntryFile {
  id: string
  status = atom<EntryFileStatus>('ready')
  file: File | undefined

  get name() {
    return this.file?.name ?? '-'
  }

  get size() {
    return this.file?.size ?? '-'
  }

  constructor(
    public entry: Entry,
    value: ID | File,
  ) {
    if (typeof value === 'string') {
      this.id = value
      this.load()
    } else {
      this.id = v4().replace(/-/g, '')
      this.file = value
      this.save()
    }
  }

  urlObject = computed(() => {
    if (!this.file) {
      return undefined
    }
    return URL.createObjectURL(this.file)
  })

  private async save() {
    this.status.set('saving')
    const snapshot = await wrap(this.getSnapshot())
    this.entry.root.apiSave(this.id, snapshot)
    this.status.set('ready')
  }

  private async load() {
    this.status.set('loading')
    const value = (await wrap(this.entry.root.apiRead(this.id))) as FileSnapshot
    this.status.set('ready')
    if (value && value.b64) {
      //this.file = new File([await base64ToArrayBuffer(value.b64)], value.name ?? value.id, {type: value.type})
    }
  }

  async remove(silent = false) {
    if (this.status() === 'deleted') {
      return
    }
    if (!silent) {
      const confirmed = await wrap(confirmPassManagerAction({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      }))
      if (!confirmed) {
        return
      }
    }
    // TODO: Entry.excludeFile not implemented yet
    // this.entry.excludeFile(this)
    this.status.set('deleted')
    await wrap(this.entry.root.apiRemove(this.id))
    await wrap(this.entry.root.save())
  }

  private async jsonData() {
    const json: FileSnapshot = {
      name: this.file?.name,
      type: this.file?.type,
      b64: '',
      id: this.id,
    }
    return json
  }

  export() {
    return this.jsonData()
  }

  copy(entry: Entry) {
    if (this.file) {
      return new EntryFile(entry, this.file)
    }
    return undefined
  }

  async getSnapshot() {
    const data: FileSnapshot = await this.jsonData()
    return new File([JSON.stringify(data)], this.id, {type: 'text/plain'})
  }
}
