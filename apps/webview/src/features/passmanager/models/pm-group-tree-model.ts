import {atom, computed, wrap} from '@reatom/core'

import {Entry, Group} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import {dialogService} from '../../../shared/services/dialog-service'
import type {GroupTree} from './group-tree'
import {buildGroupTreeNodes} from './group-tree-builder'
import {pmRootSearchProjectionModel} from './pm-root-search-projection'
import {pmModel} from '../password-manager.model'

type SelectedPath = string | null

class PMGroupTreeModel {
  readonly expandedPaths = atom<Set<string>>(new Set<string>(), 'pm_group_tree_expanded')

  readonly allEntries = computed(
    () => {
      const root = pmModel.root()
      return root ? root.allEntries : []
    },
    'pm_group_tree_all_entries',
  )

  readonly selectedPath = computed<SelectedPath>(
    () => {
      const root = pmModel.root()
      if (!root) return null

      const current = root.showElement()
      if (current === root) return null
      if (current instanceof Group) return current.name
      if (current instanceof Entry) {
        const parent = current.parent
        return parent instanceof Group ? parent.name : null
      }
      return null
    },
    'pm_group_tree_selected_path',
  )

  readonly tree = computed<GroupTree<Entry>>(
    () => {
      const root = pmModel.root()
      if (!root) return {rootEntries: [], groups: [], allEntries: []}
      const rootProjection = pmRootSearchProjectionModel.getSnapshot()

      const groups = root
        .entriesList()
        .filter((x): x is Group => x instanceof Group)
        .map((g) => {
          const nodeId = Number.isFinite(Number(g.id)) ? Number(g.id) : undefined
          return {
            path: g.name,
            entryCount: rootProjection.groupMatchCounts.get(g.id) ?? 0,
            nodeId,
            iconRef: g.iconRef,
          }
        })

      const expanded = this.expandedPaths()

      return {
        rootEntries: rootProjection.rootEntries,
        groups: buildGroupTreeNodes(groups, expanded),
        allEntries: this.allEntries(),
      }
    },
    'pm_group_tree',
  )

  toggleExpanded(path: string): void {
    const current = this.expandedPaths()
    const next = new Set(current)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    this.expandedPaths.set(next)
  }

  select(path: string | null): void {
    const root = pmModel.root()
    if (!root) return

    if (!path) {
      root.showElement.set(root)
      return
    }

    const group = root.entriesList().find((x): x is Group => x instanceof Group && x.name === path)

    if (group) {
      pmModel.openItem(group)
    }
  }

  async createGroupUnder(parentPath: string | null): Promise<void> {
    const initialRoot = pmModel.root()
    if (!initialRoot) return
    if (initialRoot.isReadOnly()) return

    const parentLabel = parentPath ?? '/'
    const isSubgroup = Boolean(parentPath)
    const title = isSubgroup ? i18n('group:create:subgroup') : i18n('group:create:title')

    const name = await wrap(
      dialogService.showInputDialog({
        title,
        label: i18n('group:name'),
        placeholder: i18n('group:name:placeholder'),
        helpText: i18n('group:parent', {parent: parentLabel}),
        confirmText: i18n('group:create:button'),
        cancelText: i18n('button:cancel'),
        required: true,
        maxLength: 100,
        validator: (value) => {
          const trimmed = String(value ?? '').trim()
          if (!trimmed) return {valid: false, message: i18n('error:group_name_required')}
          if (trimmed.includes('/') || trimmed.includes('\\')) {
            return {valid: false, message: i18n('error:group_name_invalid_chars')}
          }
          return {valid: true}
        },
      }),
    )

    const trimmed = String(name ?? '').trim()
    if (!trimmed) return

    const currentRoot = pmModel.root()
    if (!currentRoot || currentRoot !== initialRoot || currentRoot.isReadOnly()) return

    const fullPath = parentPath ? `${parentPath}/${trimmed}` : trimmed
    currentRoot.createGroup({name: fullPath, icon: undefined, entries: []})

    // Expand parent so the new group is visible.
    if (parentPath) {
      const current = this.expandedPaths()
      if (!current.has(parentPath)) {
        const next = new Set(current)
        next.add(parentPath)
        this.expandedPaths.set(next)
      }
    }
  }
}

export const pmGroupTreeModel = new PMGroupTreeModel()
