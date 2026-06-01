import {atom, computed, peek, type Atom} from '@reatom/core'

import {v4} from 'uuid'

import {i18n} from '../i18n'
import {normalizeGroupDescription} from './group-description'
import {normalizeTimestampMs} from '../utils'
import {confirmPassManagerAction} from './dialog'
import {Entry} from './entry'
import {notify} from './notify'
import type {IGroup, ManagerRoot} from './root'
import {
  createEntryFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
} from './select'
import type {IEntry, IGroupExternal, OTPOptions, TGroupActions} from './types'

export class Group implements TGroupActions {
  static root: ManagerRoot

  isRoot = false
  entries = atom<Entry[]>([])
  private rawData: Atom<Exclude<IGroup, 'entries'>>

  static create({
    name,
    description,
    icon,
    iconRef,
    entries,
  }: Pick<IGroup, 'name' | 'description' | 'icon' | 'iconRef'> & {entries: (Entry | IEntry)[]}) {
    const now = Date.now()

    return new Group({
      name,
      description: normalizeGroupDescription(description),
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
      description: normalizeGroupDescription(data.description),
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
      description: normalizeGroupDescription(data.description),
      createdTs: normalizeTimestampMs(data.createdTs),
      updatedTs: normalizeTimestampMs(data.updatedTs),
    }
    this.rawData = atom(normalized)
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
  removeEntry(_entry: Entry): void {
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
    return peek(this.rawData).id
  }

  get name() {
    return this.rawData().name
  }

  get icon() {
    return this.rawData().icon
  }

  get description() {
    return this.rawData().description
  }

  get iconRef() {
    return this.rawData().iconRef
  }

  searched = computed(
    () => {
      const fv = filterValue()
      const activeFilters = quickFilters()
      const selectedTags = getEffectiveSelectedCredentialTagFilters(this.root?.allEntries)
      const matches = createEntryFilterMatcher(fv, activeFilters, Date.now(), selectedTags)
      return this.entries().filter(matches)
    },
    'searched',
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

  rename(nextPath: string): boolean {
    const normalizedNextPath = String(nextPath ?? '').trim()
    if (!normalizedNextPath || normalizedNextPath === this.name) {
      return false
    }

    const sourcePath = this.name
    const movedGroups = Group.root
      .entriesList()
      .filter((item): item is Group => item instanceof Group)
      .filter((group) => group.name === sourcePath || group.name.startsWith(`${sourcePath}/`))

    if (movedGroups.length === 0) {
      return false
    }

    const movedGroupIds = new Set(movedGroups.map((group) => group.id))
    const nextPathByGroupId = new Map<string, string>()
    const occupiedPaths = new Set<string>()

    for (const item of Group.root.entriesList()) {
      if (!(item instanceof Group)) continue
      if (movedGroupIds.has(item.id)) continue
      occupiedPaths.add(item.name)
    }

    for (const group of movedGroups) {
      const suffix = group.name.slice(sourcePath.length)
      const movedPath = `${normalizedNextPath}${suffix}`
      if (occupiedPaths.has(movedPath)) {
        return false
      }
      nextPathByGroupId.set(group.id, movedPath)
    }

    for (const group of movedGroups) {
      const movedPath = nextPathByGroupId.get(group.id)
      if (!movedPath || movedPath === group.name) continue
      group.updateData({name: movedPath})
    }

    return true
  }

  updateData(data: Partial<IGroup> = {}) {
    this.rawData.set({
      ...this.rawData(),
      ...data,
      description:
        'description' in data ? normalizeGroupDescription(data.description) : this.rawData().description,
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
    entry.parent = this
    this.entries.set([entry, ...this.entriesList()])
  }

  async remove(silent = false) {
    // Collect subgroups whose path starts with this.name + '/'
    const rootEntries = Group.root.entriesList()
    const subgroups = rootEntries.filter(
      (item) => item instanceof Group && item.name.startsWith(this.name + '/'),
    ) as Group[]

    if (!silent) {
      const confirmed = await confirmPassManagerAction({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      })
      if (!confirmed) return
    }

    // Collect all entries from this group + subgroups
    const allEntries = [...this.entries(), ...subgroups.flatMap((g) => g.entries())]

    // Clean OTP secrets (stored separately, not deleted with directories)
    await Promise.all(allEntries.flatMap((entry) => peek(entry.otps).map((otp) => otp.clean())))

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
    const data = peek(this.rawData)

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      iconRef: this.iconRef,
      createdTs: data.createdTs,
      updatedTs: data.updatedTs,
      exportedTs: Date.now(),
      entries: await Promise.all(this.entries().map((item) => item.export())),
    }
  }

  toJSON() {
    return {
      ...peek(this.rawData),
      entries: peek(this.entries),
    }
  }
}
