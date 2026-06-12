import {atom, wrap} from '@reatom/core'

import {
  CATALOG_FOLDER_PAGE_MAX_ITEMS,
  type CatalogFolderPageRequest,
  type CatalogFolderState,
} from 'root/core/catalog/local-catalog/types'
import {normalizePath, splitPath} from 'root/core/catalog/local-catalog/path'
import {getAppContext} from 'root/shared/services/app-context'
import {i18n} from 'root/i18n'

import {getFileManagerModel} from '../../file-manager.model'
import type {FileMoveTarget} from '../../models/file-move.model'

export type FileMoveOption = {
  key: string
  id: string
  path: string
  label: string
  subtitle?: string
  disabled: boolean
  depth: number
  hasChildren: boolean
  expanded: boolean
  isRoot: boolean
}

export type FileMoveViewState = {
  activeKey: string
  disabledPaths: string[]
  hasSearch: boolean
  options: FileMoveOption[]
}

export type FileMoveListKeyResult = {
  handled: boolean
  activeKey?: string
  selectedPath?: string
}

export class FileMovePickerModel {
  readonly expandedPaths = atom<Set<string>>(new Set<string>(), 'file_move_picker_expanded')
  readonly searchValue = atom('', 'file_move_picker_search')
  readonly liveMessage = atom('', 'file_move_picker_live')
  readonly selectedPath = atom('/', 'file_move_picker_selected')
  readonly itemId = atom<number | null>(null, 'file_move_picker_item_id')
  readonly disabledPaths = atom<string[]>([], 'file_move_picker_disabled_paths')
  readonly activeOptionKey = atom('', 'file_move_picker_active')

  setItemId(value: number | null | undefined): void {
    const id = Number(value)
    this.itemId.set(Number.isFinite(id) ? id : null)
  }

  getItemId(): number | null {
    return this.itemId()
  }

  setDisabledPaths(value: string[]): void {
    this.disabledPaths.set(
      Array.isArray(value)
        ? value.map((path) => normalizePath(String(path ?? '') || '/'))
        : [],
    )
  }

  getDisabledPaths(): string[] {
    return this.disabledPaths()
  }

  hydrateSelectedPath(value: string): void {
    this.selectedPath.set(normalizePath(String(value ?? '') || '/'))
  }

  getSelectedPath(): string {
    return normalizePath(this.selectedPath() || '/')
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

  selectTarget(path: string): string {
    const nextPath = normalizePath(String(path ?? '') || '/')
    if (!nextPath) return ''

    this.selectedPath.set(nextPath)
    this.setActiveOptionKey(`target:${nextPath}`)

    const targetLabel = this.moveModel.getTargetLabel(nextPath)
    this.liveMessage.set(`${i18n('file-manager:move:selected-announce-prefix')}: ${targetLabel}`)

    return nextPath
  }

  async toggleExpanded(path: string): Promise<void> {
    const normalizedPath = normalizePath(path || '/')
    if (normalizedPath === '/') return
    const expanded = !this.expandedPaths().has(normalizedPath)
    this.setExpanded(normalizedPath, expanded)
    if (!expanded) return

    await wrap(this.ensureChildrenLoaded(normalizedPath))
    if (this.expandedPaths().has(normalizedPath)) {
      if (!this.hasChildTarget(normalizedPath)) {
        this.setExpanded(normalizedPath, false)
        return
      }
      this.expandedPaths.set(new Set(this.expandedPaths()))
    }
  }

  setExpanded(path: string, expanded: boolean): void {
    const normalizedPath = normalizePath(path || '/')
    if (normalizedPath === '/') return

    const nextPaths = new Set(this.expandedPaths())
    if (expanded) {
      nextPaths.add(normalizedPath)
    } else {
      nextPaths.delete(normalizedPath)
    }
    this.expandedPaths.set(nextPaths)
  }

  getRecentTargets(disabledPaths: string[]): FileMoveTarget[] {
    const disabled = new Set(disabledPaths.map((path) => normalizePath(path || '/')))
    return this.moveModel.listRecentTargets().filter((target) => !disabled.has(target.path))
  }

  getViewState(): FileMoveViewState {
    const disabledPaths = Array.from(
      new Set([this.getCurrentItemParentPath(), ...this.disabledPaths()].filter(Boolean)),
    )
    const disabled = new Set(disabledPaths)
    const hasSearch = this.searchValue().trim().length > 0
    const options = hasSearch
      ? this.buildSearchOptions(this.moveModel.listTargets(), disabled)
      : this.buildTreeOptions(this.moveModel.listTargets(), disabled)

    return {
      activeKey: this.resolveActiveOptionKey(options),
      disabledPaths,
      hasSearch,
      options,
    }
  }

  handleSearchKey(key: 'ArrowDown' | 'ArrowUp', options: FileMoveOption[], activeKey: string): string {
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
    options: FileMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): FileMoveListKeyResult {
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
        const selectedPath = this.selectActiveOption(options, activeKey)
        return {handled: true, selectedPath}
      }
      case 'ArrowRight':
        return this.handleArrowRight(options, activeKey, hasSearch)
      case 'ArrowLeft':
        return this.handleArrowLeft(options, activeKey, hasSearch)
      default:
        return {handled: false}
    }
  }

  private get moveModel() {
    return getFileManagerModel(getAppContext()).fileMove
  }

  private async ensureChildrenLoaded(path: string): Promise<void> {
    const ctx = getAppContext()
    const loader = ctx.catalog as unknown as {
      ensureFolderRangeLoaded?: (request: CatalogFolderPageRequest, queryKey?: string) => Promise<void>
    }
    if (typeof loader.ensureFolderRangeLoaded !== 'function') return

    const catalog = ctx.catalog?.catalog as
      | {
          getChildren?: (path: string) => unknown[]
          getFolderState?: (path: string, queryKey?: string) => CatalogFolderState | undefined
        }
      | undefined
    const children = catalog?.getChildren?.(path) ?? []
    if (children.length > 0) return

    const state = catalog?.getFolderState?.(path)
    await wrap(
      loader.ensureFolderRangeLoaded(
        {
          path,
          offset: 0,
          limit: CATALOG_FOLDER_PAGE_MAX_ITEMS,
          expected_version: state?.version ?? null,
          sort: {by: 'name', direction: 'asc'},
          filter: {include_hidden: true},
        },
        'default',
      ),
    )
  }

  private hasChildTarget(path: string): boolean {
    return this.moveModel.listTargets().some((target) => {
      if (target.isRoot) return false
      return this.getParentPath(target.path) === path
    })
  }

  private getCurrentItemParentPath(): string {
    const itemId = this.itemId()
    if (itemId === null) return ''

    const item = getFileManagerModel(getAppContext()).getFileItemById(itemId)
    if (!item) return ''

    return this.moveModel.getItemParentPath(item)
  }

  private buildTreeOptions(targets: FileMoveTarget[], disabledPaths: Set<string>): FileMoveOption[] {
    const options: FileMoveOption[] = []
    const expandedPaths = this.expandedPaths()

    for (const target of targets) {
      if (!target.isRoot && !this.isVisibleInTree(target.path, expandedPaths)) {
        continue
      }

      options.push({
        key: `target:${target.path}`,
        id: target.path,
        path: target.path,
        label: target.label,
        subtitle: target.subtitle,
        disabled: disabledPaths.has(target.path),
        depth: target.isRoot ? 0 : Math.max(0, target.depth - 1),
        hasChildren: target.hasChildren,
        expanded: expandedPaths.has(target.path),
        isRoot: target.isRoot,
      })
    }

    return options
  }

  private buildSearchOptions(targets: FileMoveTarget[], disabledPaths: Set<string>): FileMoveOption[] {
    const query = this.searchValue().trim().toLowerCase()
    return targets
      .filter((target) => {
        if (target.isRoot) return true
        return target.label.toLowerCase().includes(query) || target.path.toLowerCase().includes(query)
      })
      .map((target) => ({
        key: `target:${target.path}`,
        id: target.path,
        path: target.path,
        label: target.isRoot ? target.label : this.getLeafName(target.path),
        subtitle: target.isRoot ? target.subtitle : target.path,
        disabled: disabledPaths.has(target.path),
        depth: 0,
        hasChildren: false,
        expanded: false,
        isRoot: target.isRoot,
      }))
  }

  private isVisibleInTree(path: string, expandedPaths: Set<string>): boolean {
    const parts = splitPath(path)
    if (parts.length <= 1) return true

    for (let index = 1; index < parts.length; index++) {
      const ancestor = normalizePath('/' + parts.slice(0, index).join('/'))
      if (!expandedPaths.has(ancestor)) return false
    }

    return true
  }

  private resolveActiveOptionKey(options: FileMoveOption[]): string {
    if (options.length === 0) return ''

    const optionsByKey = new Map(options.map((option) => [option.key, option]))
    const current = optionsByKey.get(this.activeOptionKey())
    if (current && !current.disabled) {
      return current.key
    }

    const selected = options.find((option) => option.path === this.getSelectedPath() && !option.disabled)
    if (selected) {
      return selected.key
    }

    return options.find((option) => !option.disabled)?.key ?? ''
  }

  private moveActiveBy(step: number, options: FileMoveOption[], activeKey: string): string {
    const enabled = options.filter((option) => !option.disabled)
    if (enabled.length === 0) return ''

    const currentIndex = enabled.findIndex((option) => option.key === activeKey)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = Math.max(0, Math.min(enabled.length - 1, startIndex + step))
    const nextOption = enabled[nextIndex]
    if (!nextOption) return ''

    return this.setActiveOptionKey(nextOption.key)
  }

  private activateBoundary(options: FileMoveOption[], boundary: 'first' | 'last'): string {
    const nextOption =
      boundary === 'first' ? options.find((option) => !option.disabled) : this.findLastEnabledOption(options)
    if (!nextOption) return ''
    return this.setActiveOptionKey(nextOption.key)
  }

  private selectActiveOption(options: FileMoveOption[], activeKey: string): string {
    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || activeOption.disabled) return ''
    return this.selectTarget(activeOption.path)
  }

  private handleArrowRight(
    options: FileMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): FileMoveListKeyResult {
    if (hasSearch) {
      return {handled: false}
    }

    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || activeOption.isRoot || !activeOption.hasChildren) {
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
    options: FileMoveOption[],
    activeKey: string,
    hasSearch: boolean,
  ): FileMoveListKeyResult {
    if (hasSearch) {
      return {handled: false}
    }

    const activeOption = options.find((option) => option.key === activeKey)
    if (!activeOption || activeOption.isRoot) {
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

  private findLastEnabledOption(options: FileMoveOption[]): FileMoveOption | undefined {
    for (let index = options.length - 1; index >= 0; index--) {
      const option = options[index]
      if (!option || option.disabled) continue
      return option
    }
    return undefined
  }

  private getParentPath(path: string): string | null {
    const parts = splitPath(path)
    if (parts.length <= 1) return null
    return normalizePath('/' + parts.slice(0, -1).join('/'))
  }

  private getLeafName(path: string): string {
    const parts = splitPath(path)
    return parts[parts.length - 1] ?? path
  }
}
