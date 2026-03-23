import {state} from '@statx/core'

import {Entry, Group, filterValue, groupEntries, i18n, quickFilters} from '@project/passmanager'
import type {ManagerRoot} from '@project/passmanager'
import {pmModel} from '../../../password-manager.model'
import {groupBy, sortDirection, sortField} from '../../list/sort-controls'

export type PMToolbarAction = 'create-entry' | 'create-group' | 'edit-group' | 'remove-group'

type PMGroupItem = Entry | Group
type PMGroupActionableRow = PMGroupEntryRow | PMGroupFolderRow

export type PMGroupHeaderRow = {
  kind: 'header'
  id: string
  label: string
  count: number
  icon?: string
}

export type PMGroupEntryRow = {
  kind: 'entry'
  id: string
  item: Entry
}

export type PMGroupFolderRow = {
  kind: 'group'
  id: string
  item: Group
}

export type PMGroupRow = PMGroupHeaderRow | PMGroupEntryRow | PMGroupFolderRow

type PMSyncKeyboardResult = {
  restoredIndex: number | null
}

const toolbarActions = new Set<PMToolbarAction>(['create-entry', 'create-group', 'edit-group', 'remove-group'])

export class PMGroupModel {
  readonly isEditMode = state(false)
  private readonly activeItemIndex = state(-1)
  private keyboardContextKey = ''
  private keyboardItems: PMGroupRow[] = []

  getCurrentGroup(): Group | ManagerRoot | null {
    const element = window.passmanager?.showElement()
    if (!element) return null

    if (element instanceof Group) return element
    if (typeof element === 'object' && element !== null && 'isRoot' in element) {
      return element as ManagerRoot
    }

    return null
  }

  isManagerRoot(item: unknown): item is ManagerRoot {
    return (
      typeof item === 'object' &&
      item !== null &&
      'isRoot' in item &&
      (item as {isRoot: boolean}).isRoot === true
    )
  }

  isGroup(item: unknown): item is Group {
    return item instanceof Group
  }

  getGroupMetadata(group: Group) {
    const displayName = this.getGroupDisplayName(group)
    const title = displayName || i18n('no_title')
    return {
      title,
      avatar: (title.trim().charAt(0) || '?').toUpperCase(),
    }
  }

  getGroupDisplayName(group: Group): string {
    const name = group.name
    const separator = name.lastIndexOf('/')
    return separator >= 0 ? name.slice(separator + 1) : name
  }

  getVisibleRows(group: Group | ManagerRoot): PMGroupRow[] {
    const root = window.passmanager
    if (!root) return []

    if (this.isManagerRoot(group)) {
      const items = group.searched() as PMGroupItem[]
      const childGroups = items.filter((item): item is Group => item instanceof Group && !item.name.includes('/'))
      const entries = items.filter((item): item is Entry => item instanceof Entry)
      return this.composeRows(childGroups, entries)
    }

    const currentGroup = group as Group
    const entries = currentGroup.searched() as Entry[]
    const prefix = currentGroup.name + '/'
    const query = filterValue()
    const filters = quickFilters()

    const childGroups = root.entriesList().filter((item): item is Group => {
      if (!(item instanceof Group)) return false
      if (!item.name.startsWith(prefix)) return false

      const restPath = item.name.slice(prefix.length)
      if (restPath.includes('/')) return false
      if (query || filters.length) return item.searched().length > 0
      return true
    })

    return this.composeRows(childGroups, entries)
  }

  getUniqueRows(items: PMGroupRow[]): PMGroupRow[] {
    const seen = new Set<string>()
    const unique: PMGroupRow[] = []

    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      unique.push(item)
    }

    return unique
  }

  getListContextKey(group: Group | ManagerRoot, itemCount: number): string {
    const groupKey = this.isManagerRoot(group) ? 'root' : group.id
    const query = filterValue()
    const filters = quickFilters().join(',')
    return `${groupKey}|${query}|${filters}|${sortField()}|${sortDirection()}|${groupBy()}|${itemCount}`
  }

  resetKeyboardState(): void {
    this.keyboardItems = []
    this.keyboardContextKey = ''
    this.activeItemIndex.set(0)
  }

  syncKeyboardState(items: PMGroupRow[], contextKey: string, group: Group | ManagerRoot): PMSyncKeyboardResult {
    const previousActiveId = this.getActiveItemId()
    this.keyboardItems = items

    if (!items.some((item) => this.isActionableRow(item))) {
      this.activeItemIndex.set(-1)
      this.keyboardContextKey = contextKey
      return {restoredIndex: null}
    }

    if (contextKey !== this.keyboardContextKey) {
      this.keyboardContextKey = contextKey
      const restoredItemId = pmModel.consumeRestoreSelection(group.id)
      if (restoredItemId) {
        const restoredIndex = items.findIndex(
          (item) => this.isActionableRow(item) && item.id === restoredItemId,
        )
        if (restoredIndex >= 0) {
          this.activeItemIndex.set(restoredIndex)
          return {restoredIndex}
        }
      }

      const firstInteractive = this.findFirstActionableIndex(items)
      this.activeItemIndex.set(firstInteractive)
      return {restoredIndex: null}
    }

    if (previousActiveId) {
      const preservedIndex = items.findIndex(
        (item) => this.isActionableRow(item) && item.id === previousActiveId,
      )
      if (preservedIndex >= 0) {
        this.activeItemIndex.set(preservedIndex)
        return {restoredIndex: null}
      }
    }

    const nextIndex = this.normalizeActiveIndex(this.activeItemIndex(), items)
    this.activeItemIndex.set(nextIndex)
    return {restoredIndex: null}
  }

  moveKeyboardFocus(step: number): number | null {
    const items = this.keyboardItems
    if (!items.length || !items.some((item) => this.isActionableRow(item))) return null

    const length = items.length
    const current = this.activeItemIndex()
    if (current < 0) {
      const next = step < 0 ? this.findLastActionableIndex(items) : this.findFirstActionableIndex(items)
      this.activeItemIndex.set(next)
      return next
    }

    let next = current
    for (let offset = 0; offset < length; offset += 1) {
      next = (next + step + length) % length
      if (this.isActionableRow(items[next])) {
        this.activeItemIndex.set(next)
        return next
      }
    }

    this.activeItemIndex.set(next)
    return next
  }

  openActiveItem(): boolean {
    const item = this.keyboardItems[this.activeItemIndex()]
    if (!this.isActionableRow(item)) return false

    pmModel.openItem(item.item)
    return true
  }

  setActiveItemById(id: string): void {
    const index = this.keyboardItems.findIndex((item) => this.isActionableRow(item) && item.id === id)
    if (index >= 0) {
      this.activeItemIndex.set(index)
    }
  }

  getActiveItemId(): string | undefined {
    const item = this.keyboardItems[this.activeItemIndex()]
    return this.isActionableRow(item) ? item.id : undefined
  }

  getKeyboardItemIdByIndex(index: number): string | undefined {
    return this.keyboardItems[index]?.id
  }

  selectByID(id: string): void {
    const card = window.passmanager.getCardByID(id)
    if (card instanceof Entry || card instanceof Group) {
      pmModel.openItem(card)
    }
  }

  enterEditMode(): void {
    this.isEditMode.set(true)
  }

  exitEditMode(): void {
    this.isEditMode.set(false)
  }

  deleteGroup(group: Group): void {
    group.remove()
  }

  isReadOnly(): boolean {
    return window.passmanager?.isReadOnly?.() ?? true
  }

  isToolbarAction(value: string | undefined): value is PMToolbarAction {
    if (!value) return false
    return toolbarActions.has(value as PMToolbarAction)
  }

  executeToolbarAction(action: PMToolbarAction): void {
    const passmanager = window.passmanager
    if (!passmanager || passmanager.isReadOnly()) return

    const group = this.getCurrentGroup()
    if (!group) return

    switch (action) {
      case 'create-entry':
        passmanager.setShowElement('createEntry', this.isManagerRoot(group) ? undefined : group)
        return
      case 'create-group':
        passmanager.showElement.set('createGroup')
        return
      case 'edit-group':
        if (this.isManagerRoot(group)) return
        this.enterEditMode()
        return
      case 'remove-group':
        if (this.isManagerRoot(group)) return
        this.deleteGroup(group)
        return
      default:
        return
    }
  }

  private composeRows(childGroups: Group[], entries: Entry[]): PMGroupRow[] {
    const folderRows = [...childGroups]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({kind: 'group', id: item.id, item}) satisfies PMGroupFolderRow)

    const groupedRows = groupEntries(entries, groupBy(), sortField(), sortDirection()).flatMap((group, index) => {
      const rows: PMGroupRow[] = []

      if (groupBy() !== 'none' && group.entries.length > 0) {
        rows.push({
          kind: 'header',
          id: `group-header:${groupBy()}:${index}:${group.groupName}`,
          label: group.groupName,
          count: group.count,
          icon: group.icon,
        })
      }

      rows.push(
        ...group.entries.map(
          (item) =>
            ({
              kind: 'entry',
              id: item.id,
              item,
            }) satisfies PMGroupEntryRow,
        ),
      )

      return rows
    })

    return [...folderRows, ...groupedRows]
  }

  private isActionableRow(item: PMGroupRow | undefined): item is PMGroupActionableRow {
    return item?.kind === 'entry' || item?.kind === 'group'
  }

  private findFirstActionableIndex(items: PMGroupRow[]): number {
    return items.findIndex((item) => this.isActionableRow(item))
  }

  private findLastActionableIndex(items: PMGroupRow[]): number {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (this.isActionableRow(items[index])) {
        return index
      }
    }

    return -1
  }

  private normalizeActiveIndex(index: number, items: PMGroupRow[]): number {
    if (this.isActionableRow(items[index])) {
      return index
    }

    return this.findFirstActionableIndex(items)
  }
}
