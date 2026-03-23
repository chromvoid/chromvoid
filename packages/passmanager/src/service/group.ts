import {type State, computed, state} from '@statx/core'

import Swal from 'sweetalert2'
import {v4} from 'uuid'

import {i18n} from '../i18n'
import {normalizeTimestampMs} from '../utils'
import {Entry} from './entry'
import {notify} from './notify'
import type {IGroup, ManagerRoot} from './root'
import {filterRule, filterValue} from './select'
import type {IEntry, IGroupExternal, OTPOptions, TGroupActions} from './types'

export class Group implements TGroupActions {
  static root: ManagerRoot

  isRoot = false
  entries = state<Entry[]>([])
  private rawData: State<Exclude<IGroup, 'entries'>>

  static create({
    name,
    icon,
    iconRef,
    entries,
  }: Pick<IGroup, 'name' | 'icon' | 'iconRef'> & {entries: (Entry | IEntry)[]}) {
    const now = Date.now()

    return new Group({
      name,
      icon,
      iconRef,
      entries: entries as IEntry[],
      id: v4(),
      createdTs: now,
      updatedTs: now,
    })
  }

  static import(data: IGroupExternal) {
    const now = Date.now()
    const group = new Group({
      name: data.name,
      iconRef: data.iconRef,
      id: data.id,
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const entries = data.entries.map((item) => {
      const entry = Entry.import(group, item)
      entry.parent = group
      return entry
    })

    group.entries.set(entries)
    return group
  }

  constructor(data: IGroup) {
    const normalized: IGroup = {
      ...data,
      createdTs: normalizeTimestampMs(data.createdTs),
      updatedTs: normalizeTimestampMs(data.updatedTs),
    }
    this.rawData = state(normalized)
    this.entries.set(
      data.entries.map((item) => {
        if (item instanceof Entry) {
          item.parent = this
          return item
        }
        return new Entry(this, item)
      }),
    )
  }
  removeEntry(entry: Entry): void {
    throw new Error('Method not implemented.')
  }

  entriesList() {
    return this.entries()
  }

  sorted() {
    return this.entries()
  }

  get root() {
    return Group.root
  }

  get id() {
    return this.rawData.peek().id
  }

  get name() {
    return this.rawData().name
  }

  get icon() {
    return this.rawData().icon
  }

  get iconRef() {
    return this.rawData().iconRef
  }

  searched = computed(
    () => {
      const fv = filterValue()
      return this.entries().filter((item) => filterRule(item, fv))
    },
    {name: 'searched'},
  )

  get updatedFormatted() {
    return new Date(this.rawData().updatedTs).toLocaleString()
  }

  get createdFormatted() {
    return new Date(this.rawData().createdTs).toLocaleString()
  }

  getEntry(id: string): Entry | undefined {
    return this.entries().find((item) => {
      return item.id === id
    })
  }

  updateData(data: Partial<IGroup> = {}) {
    this.rawData.set({
      ...this.rawData(),
      ...data,
      updatedTs: Date.now(),
    })
  }

  createEntry(data: Partial<IEntry>, password: string, note: string, otp: OTPOptions) {
    return Entry.create(this, data, password, note, otp)
  }

  excludeEntry(entry: Entry) {
    const entries = this.entriesList()
    this.entries.set(entries.filter((c) => c.id !== entry.id))
  }

  addEntry(entry: Entry) {
    this.entries.set([entry, ...this.entriesList()])
  }

  async remove(silent = false) {
    // Collect subgroups whose path starts with this.name + '/'
    const rootEntries = Group.root.entriesList()
    const subgroups = rootEntries.filter(
      (item) => item instanceof Group && item.name.startsWith(this.name + '/'),
    ) as Group[]

    if (!silent) {
      const res = await Swal.fire({
        title: i18n('remove:dialog:title'),
        html: i18n('remove:dialog:text'),
        showCancelButton: true,
        showConfirmButton: true,
      })
      if (!res.isConfirmed) return
    }

    // Collect all entries from this group + subgroups
    const allEntries = [...this.entries(), ...subgroups.flatMap((g) => g.entries())]

    // Clean OTP secrets (stored separately, not deleted with directories)
    await Promise.all(allEntries.flatMap((entry) => entry.otps.peek().map((otp) => otp.clean())))

    // Remove this group + all subgroups from root.entries
    const toRemove = new Set<Group>([this, ...subgroups])
    Group.root.entries.set(rootEntries.filter((i) => !toRemove.has(i as Group)))
    Group.root.updatedTs.set(Date.now())

    // save() → saveRoot() → removeObsoleteEntries() deletes orphaned directories
    await Group.root.save()
    Group.root.showElement.set(Group.root)

    try {
      notify.success(i18n('notify:remove:success'))
    } catch {}
  }

  async export(): Promise<IGroupExternal> {
    const data = this.rawData.peek()

    return {
      id: this.id,
      name: this.name,
      iconRef: this.iconRef,
      createdTs: data.createdTs,
      updatedTs: data.updatedTs,
      exportedTs: Date.now(),
      entries: await Promise.all(this.entries().map((item) => item.export())),
    }
  }

  toJSON() {
    return {
      ...this.rawData.peek(),
      entries: this.entries.peek(),
    }
  }
}
