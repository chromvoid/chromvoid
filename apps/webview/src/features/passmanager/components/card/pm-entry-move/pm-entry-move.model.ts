import {state} from '@statx/core'

import {Group, i18n} from '@project/passmanager'

import type {GroupTreeNode} from '../../../models/group-tree'
import {buildGroupTreeNodes} from '../../../models/group-tree-builder'
import {pmEntryMoveModel, type MoveTarget} from '../../../models/pm-entry-move-model'

export type PMEntryMoveOption = {
  key: string
  id: string
  label: string
  disabled: boolean
  depth: number
  hasChildren: boolean
  expanded: boolean
  path: string | null
  isRoot: boolean
}

export type PMEntryMoveViewState = {
  activeKey: string
  disabledId: string
  hasSearch: boolean
  options: PMEntryMoveOption[]
}

export type PMEntryMoveListKeyResult = {
  handled: boolean
  activeKey?: string
  selectedId?: string
}

export class PMEntryMovePickerModel {
  readonly expandedPaths = state<Set<string>>(new Set(), {name: 'pm_entry_move_picker_expanded'})
  readonly searchValue = state('', {name: 'pm_entry_move_picker_search'})
  readonly liveMessage = state('', {name: 'pm_entry_move_picker_live'})
  readonly selectedId = state('', {name: 'pm_entry_move_picker_selected'})
  readonly entryId = state('', {name: 'pm_entry_move_picker_entry'})
  readonly activeOptionKey = state('', {name: 'pm_entry_move_picker_active'})

  setEntryId(value: string): void {
    this.entryId.set(String(value ?? ''))
  }

  getEntryId(): string {
    return this.entryId()
  }

  hydrateSelectedId(value: string): void {
    this.selectedId.set(String(value ?? ''))
  }

  getSelectedId(): string {
    const selectedId = this.selectedId()
    if (selectedId.length > 0) return selectedId
    return window.passmanager?.id ?? ''
  }

  setSearchValue(value: string): void {
    this.searchValue.set(String(value ?? ''))
  }

  setActiveOptionKey(key: string): string {
    const nextKey = String(key ?? '')
    if (this.activeOptionKey() !== nextKey) {
      this.activeOptionKey.set(nextKey)
    }
    return nextKey
  }

  selectTarget(id: string): string {
    const nextId = String(id ?? '')
    if (!nextId) return ''

    this.selectedId.set(nextId)
    this.setActiveOptionKey(`target:${nextId}`)

    const targetLabel = pmEntryMoveModel.getTargetLabelById(nextId)
    this.liveMessage.set(`${i18n('dialog:move:selected_announce_prefix')}: ${targetLabel}`)

    return nextId
  }

  toggleExpanded(path: string): void {
    if (!path) return
    this.setExpanded(path, !this.expandedPaths().has(path))
  }

  setExpanded(path: string, expanded: boolean): void {
    if (!path) return

    const nextPaths = new Set(this.expandedPaths())
    if (expanded) {
      nextPaths.add(path)
    } else {
      nextPaths.delete(path)
    }
    this.expandedPaths.set(nextPaths)
  }

  getRecentTargets(disabledId: string): MoveTarget[] {
    return pmEntryMoveModel.listRecentTargets().filter((target) => target.id !== disabledId)
  }

  getViewState(): PMEntryMoveViewState | null {
    if (!window.passmanager) {
      return null
    }

    const disabledId = this.getCurrentEntryParentId()
    const groups = window.passmanager.entriesList().filter((item): item is Group => item instanceof Group)
    const groupIdByPath = new Map<string, string>()
    for (const group of groups) {
      groupIdByPath.set(group.name, group.id)
    }

    const nodes = buildGroupTreeNodes(
      groups.map((group) => ({path: group.name, entryCount: group.entriesList().length})),
      this.expandedPaths(),
    )

    const hasSearch = this.searchValue().trim().length > 0
    const options = this.buildVisibleOptions(groups, nodes, groupIdByPath, disabledId, hasSearch)

    return {
      activeKey: this.resolveActiveOptionKey(options),
      disabledId,
      hasSearch,
      options,
    }
  }

  handleSearchKey(key: 'ArrowDown' | 'ArrowUp', options: PMEntryMoveOption[], activeKey: string): string {
    const targetKey =
      key === 'ArrowDown'
        ? options.find((option) => !option.disabled)?.key
        : this.findLastEnabledOption(options)?.key
    const nextKey = activeKey || targetKey || ''
    if (!nextKey) return ''
    return this.setActiveOptionKey(nextKey)
  }

  handleListKey(
    key: string,
    options: PMEntryMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): PMEntryMoveListKeyResult {
    if (options.length === 0) {
      return {handled: false}
    }

    switch (key) {
      case 'ArrowDown':
        return {handled: true, activeKey: this.moveActiveBy(1, options, activeKey)}
      case 'ArrowUp':
        return {handled: true, activeKey: this.moveActiveBy(-1, options, activeKey)}
      case 'Home':
        return {handled: true, activeKey: this.activateBoundary(options, 'first')}
      case 'End':
        return {handled: true, activeKey: this.activateBoundary(options, 'last')}
      case 'Enter':
      case ' ': {
        const selectedId = this.selectActiveOption(options, activeKey)
        return {handled: true, selectedId}
      }
      case 'ArrowRight':
        return this.handleArrowRight(options, activeKey, hasSearch)
      case 'ArrowLeft':
        return this.handleArrowLeft(options, activeKey, hasSearch)
      default:
        return {handled: false}
    }
  }

  private getCurrentEntryParentId(): string {
    if (!window.passmanager) return ''
    const currentEntryId = this.entryId()
    if (!currentEntryId) return ''

    const entry = window.passmanager.getEntry(currentEntryId)
    if (!entry) return ''

    return pmEntryMoveModel.getEntryParentTargetId(entry)
  }

  private resolveActiveOptionKey(options: PMEntryMoveOption[]): string {
    if (options.length === 0) return ''

    const optionsByKey = new Map(options.map((option) => [option.key, option]))
    const current = optionsByKey.get(this.activeOptionKey())
    if (current && !current.disabled) {
      return current.key
    }

    const selected = options.find((option) => option.id === this.getSelectedId() && !option.disabled)
    if (selected) {
      return selected.key
    }

    return options.find((option) => !option.disabled)?.key ?? ''
  }

  private moveActiveBy(step: number, options: PMEntryMoveOption[], activeKey: string): string {
    const enabled = options.filter((option) => !option.disabled)
    if (enabled.length === 0) return ''

    const currentIndex = enabled.findIndex((option) => option.key === activeKey)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = Math.max(0, Math.min(enabled.length - 1, startIndex + step))
    const nextOption = enabled[nextIndex]
    if (!nextOption) return ''

    return this.setActiveOptionKey(nextOption.key)
  }

  private activateBoundary(options: PMEntryMoveOption[], boundary: 'first' | 'last'): string {
    const nextOption =
      boundary === 'first' ? options.find((option) => !option.disabled) : this.findLastEnabledOption(options)
    if (!nextOption) return ''
    return this.setActiveOptionKey(nextOption.key)
  }

  private selectActiveOption(options: PMEntryMoveOption[], activeKey: string): string {
    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || activeOption.disabled) return ''
    return this.selectTarget(activeOption.id)
  }

  private handleArrowRight(
    options: PMEntryMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): PMEntryMoveListKeyResult {
    if (hasSearch) {
      return {handled: false}
    }

    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || !activeOption.path || !activeOption.hasChildren) {
      return {handled: false}
    }

    if (!activeOption.expanded) {
      this.setExpanded(activeOption.path, true)
      return {handled: true}
    }

    const index = options.findIndex((option) => option.key === activeOption.key)
    const nextOption = index >= 0 ? options[index + 1] : undefined
    if (!nextOption || nextOption.depth !== activeOption.depth + 1 || nextOption.disabled) {
      return {handled: true}
    }

    return {handled: true, activeKey: this.setActiveOptionKey(nextOption.key)}
  }

  private handleArrowLeft(
    options: PMEntryMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): PMEntryMoveListKeyResult {
    if (hasSearch) {
      return {handled: false}
    }

    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || !activeOption.path) {
      return {handled: false}
    }

    if (activeOption.hasChildren && activeOption.expanded) {
      this.setExpanded(activeOption.path, false)
      return {handled: true}
    }

    const parentPath = this.getParentPath(activeOption.path)
    if (!parentPath) {
      return {handled: true}
    }

    const parentOption = options.find((option) => option.path === parentPath && !option.disabled)
    if (!parentOption) {
      return {handled: true}
    }

    return {handled: true, activeKey: this.setActiveOptionKey(parentOption.key)}
  }

  private findLastEnabledOption(options: PMEntryMoveOption[]): PMEntryMoveOption | undefined {
    for (let index = options.length - 1; index >= 0; index--) {
      const option = options[index]
      if (!option || option.disabled) continue
      return option
    }
    return undefined
  }

  private getParentPath(path: string): string | null {
    const index = path.lastIndexOf('/')
    if (index < 0) return null
    return path.slice(0, index)
  }

  private appendTreeNodeOptions(
    node: GroupTreeNode,
    depth: number,
    groupIdByPath: Map<string, string>,
    disabledId: string,
    options: PMEntryMoveOption[],
  ): void {
    const id = groupIdByPath.get(node.path)
    if (!id) return

    const hasChildren = node.children.length > 0
    options.push({
      key: `target:${id}`,
      id,
      label: node.name,
      disabled: id === disabledId,
      depth,
      hasChildren,
      expanded: node.expanded,
      path: node.path,
      isRoot: false,
    })

    if (!hasChildren || !node.expanded) {
      return
    }

    for (const child of node.children) {
      this.appendTreeNodeOptions(child, depth + 1, groupIdByPath, disabledId, options)
    }
  }

  private buildVisibleOptions(
    groups: Group[],
    nodes: GroupTreeNode[],
    groupIdByPath: Map<string, string>,
    disabledId: string,
    hasSearch: boolean,
  ): PMEntryMoveOption[] {
    const rootId = window.passmanager.id
    const options: PMEntryMoveOption[] = [
      {
        key: `target:${rootId}`,
        id: rootId,
        label: '/',
        disabled: disabledId === rootId,
        depth: 0,
        hasChildren: false,
        expanded: false,
        path: null,
        isRoot: true,
      },
    ]

    if (hasSearch) {
      const query = this.searchValue().trim().toLowerCase()
      const filteredGroups = groups.filter((group) => group.name.toLowerCase().includes(query))
      for (const group of filteredGroups) {
        options.push({
          key: `target:${group.id}`,
          id: group.id,
          label: group.name,
          disabled: disabledId === group.id,
          depth: 0,
          hasChildren: false,
          expanded: false,
          path: group.name,
          isRoot: false,
        })
      }
      return options
    }

    for (const node of nodes) {
      this.appendTreeNodeOptions(node, 0, groupIdByPath, disabledId, options)
    }

    return options
  }
}
