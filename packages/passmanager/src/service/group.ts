import {atom, computed, peek, wrap, type Atom} from '@reatom/core'

import {v4} from 'uuid'

import {i18n} from '../i18n'
import {normalizeGroupDescription} from './group-description'
import {normalizeTimestampMs} from '../utils'
import {confirmPassManagerAction} from './dialog'
import {Entry} from './entry'
import type {MutationPresentation} from './mutation-presentation'
import type {IGroup, ManagerRoot} from './root'
import {
  createEntryFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
} from './select'
import type {IEntry, IGroupExternal, OTPOptions, PaymentCardCreationSecrets, TGroupActions} from './types'

export type GroupSaveChangesInput = {
  name: string
  description: string
  iconRef: string | undefined
}

export type GroupSaveChangesResult =
  | {status: 'saved'}
  | {status: 'unchanged'}
  | {status: 'name-conflict'}
  | {status: 'invalid-name'}
  | {status: 'save-failed'}

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

  searched = computed(() => {
    const fv = filterValue()
    const activeFilters = quickFilters()
    const selectedTags = getEffectiveSelectedCredentialTagFilters(
      this.root?.allEntries,
      this.root?.credentialTags() ?? [],
    )
    const matches = createEntryFilterMatcher(fv, activeFilters, Date.now(), selectedTags)
    return this.entries().filter(matches)
  }, 'searched')

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

  async saveChanges({
    name,
    description,
    iconRef,
  }: GroupSaveChangesInput): Promise<GroupSaveChangesResult> {
    const nextPath = String(name ?? '').trim()
    if (
      !nextPath ||
      nextPath.includes('\\') ||
      nextPath.split('/').some((segment) => segment.trim().length === 0)
    ) {
      return {status: 'invalid-name'}
    }

    const currentData = peek(this.rawData)
    const nextDescription = normalizeGroupDescription(description)
    const pathChanged = nextPath !== currentData.name
    const metadataChanged =
      nextDescription !== currentData.description || iconRef !== currentData.iconRef
    if (!pathChanged && !metadataChanged) {
      return {status: 'unchanged'}
    }

    const root = this.root
    const sourcePath = currentData.name
    const movedGroups = root
      .entriesList()
      .filter((item): item is Group => item instanceof Group)
      .filter((group) => group.name === sourcePath || group.name.startsWith(`${sourcePath}/`))
    if (!movedGroups.includes(this)) {
      return {status: 'invalid-name'}
    }

    const movedGroupIds = new Set(movedGroups.map((group) => group.id))
    const nextPathByGroupId = new Map<string, string>()
    if (pathChanged) {
      const occupiedPaths = new Set(
        root
          .entriesList()
          .filter((item): item is Group => item instanceof Group && !movedGroupIds.has(item.id))
          .map((group) => group.name.trim().toLowerCase()),
      )
      const movedPaths = new Set<string>()
      for (const group of movedGroups) {
        const movedPath = `${nextPath}${group.name.slice(sourcePath.length)}`
        const comparisonPath = movedPath.trim().toLowerCase()
        if (occupiedPaths.has(comparisonPath) || movedPaths.has(comparisonPath)) {
          return {status: 'name-conflict'}
        }
        movedPaths.add(comparisonPath)
        nextPathByGroupId.set(group.id, movedPath)
      }
    }

    const snapshots = new Map(movedGroups.map((group) => [group, peek(group.rawData)]))
    const rootUpdatedTs = root.updatedTs()
    const updatedTs = Date.now()

    if (pathChanged) {
      for (const group of movedGroups) {
        const movedPath = nextPathByGroupId.get(group.id)
        if (!movedPath) continue
        group.rawData.set({...peek(group.rawData), name: movedPath, updatedTs})
      }
    }
    this.rawData.set({
      ...peek(this.rawData),
      description: nextDescription,
      iconRef,
      updatedTs,
    })
    root.updatedTs.set(updatedTs)

    let saved = false
    try {
      saved = (await wrap(root.save())) === true
    } catch {
      saved = false
    }
    if (saved) {
      return {status: 'saved'}
    }

    for (const [group, snapshot] of snapshots) {
      group.rawData.set(snapshot)
    }
    root.updatedTs.set(rootUpdatedTs)
    return {status: 'save-failed'}
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

  createEntry(
    data: Partial<IEntry>,
    password: string,
    note: string,
    otp: OTPOptions | undefined,
    paymentCardSecrets?: PaymentCardCreationSecrets,
  ) {
    return Entry.create(this, data, password, note, otp, paymentCardSecrets)
  }

  excludeEntry(entry: Entry) {
    const entries = this.entriesList()
    this.entries.set(entries.filter((c) => c.id !== entry.id))
  }

  addEntry(entry: Entry) {
    entry.parent = this
    this.entries.set([entry, ...this.entriesList()])
  }

  confirmRemoval(): Promise<boolean> {
    return confirmPassManagerAction({
      title: i18n('remove:dialog:title'),
      message: i18n('remove:dialog:text'),
      variant: 'danger',
      confirmVariant: 'danger',
    })
  }

  async remove({
    silent = false,
    presentation = 'auto',
  }: {
    silent?: boolean
    presentation?: MutationPresentation
  } = {}) {
    if (!silent) {
      const confirmed = await wrap(this.confirmRemoval())
      if (!confirmed) return false
    }

    const groupPath = this.name
    const parentSeparator = groupPath.lastIndexOf('/')
    const parentPath = parentSeparator >= 0 ? groupPath.slice(0, parentSeparator) : ''
    const wasCurrentGroup = Group.root.showElement() === this

    await wrap(Group.root.managerSaver.removeGroup(groupPath))

    const currentEntries = Group.root.entriesList()
    Group.root.entries.set(
      currentEntries.filter(
        (item) =>
          !(item instanceof Group && (item.name === groupPath || item.name.startsWith(`${groupPath}/`))),
      ),
    )
    Group.root.updatedTs.set(Date.now())
    if (presentation === 'auto' && wasCurrentGroup && Group.root.showElement() === this) {
      const parent = parentPath
        ? (Group.root
            .entriesList()
            .find((item): item is Group => item instanceof Group && item.name === parentPath) ??
          Group.root)
        : Group.root
      Group.root.showElement.set(parent)
    }
    return true
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
