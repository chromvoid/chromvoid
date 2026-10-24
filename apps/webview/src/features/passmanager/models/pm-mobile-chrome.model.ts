import {atom, wrap} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {
  type QuickFilter,
  filterValue,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager/select'
import {sortStorage} from '@project/passmanager/sort-storage'
import {dialogService} from 'root/shared/services/dialog-service'
import {toast, type ToastHandle} from 'root/shared/services/toast-manager'
import {PMEntryModel} from '../components/card/entry/entry.model'
import {PMGroupModel} from '../components/group/group/group.model'
import {pmGroupEditModel} from '../components/group/group/group-edit.model'
import {pmSshKeysViewModel} from '../components/ssh-keys-view/ssh-keys-view.model'
import {
  groupBy,
  sortDirection,
  sortField,
  viewMode,
  type GroupBy,
  type SortDirection,
  type SortField,
} from '../components/list/sort-controls.model'
import {pmEntryEditorModel} from './pm-entry-editor.model'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerReadOnly,
  type PMRootShowElement,
} from './pm-root.adapter'
import {pmModel} from '../password-manager.model'
import {pmDeleteMotionModel} from './pm-delete-motion.model'
import {pmMobileSelectionModel} from './pm-mobile-selection.model'

const ALLOWED_QUICK_FILTERS: QuickFilter[] = ['recent', 'otp', 'favorites', 'ssh', 'card']

export type PMShowElement = PMRootShowElement

export type PMMobileToolbarContext = {
  title: string
  subtitle?: string
  meta?: PMMobileToolbarMetaItem[]
  metaLabel?: string
  canGoBack: boolean
  backDisabled: boolean
  hideTabBar: boolean
  maxVisible: number
  overflowFromIndex?: number
}

export type PMMobileToolbarMetaItem = {
  id: string
  icon: string
  label: string
  value: string
}

export type PMMobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
  active?: boolean
  tone?: 'accent'
  overflowOnly?: boolean
  preserveFocusOnPress?: boolean
}

export type PMMobileCommandKind = 'passwords-list' | 'passwords-entry' | 'passwords-selection' | 'none'

export type PMMobileCommandContext = {
  kind: PMMobileCommandKind
  readOnly: boolean
  hasActiveFilters: boolean
  selectedCount: number
  singleSelectionKind: 'entry' | 'group' | null
  query: string
  quickFilters: string[]
  sortField: ReturnType<typeof sortField>
  sortDirection: ReturnType<typeof sortDirection>
  groupBy: ReturnType<typeof groupBy>
}

class PMMobileChromeModel {
  private bulkDeletePending = false
  readonly sortGroupSheetOpen = atom(false, 'pm_mobile_sort_group_sheet_open')

  private readonly entryActionsModel = new PMEntryModel()
  private readonly groupActionsModel = new PMGroupModel()

  getToolbarContext(): PMMobileToolbarContext {
    if (pmMobileSelectionModel.active()) {
      const meta = this.getSelectionMeta()
      return {
        title: i18n('details:selected' as any),
        meta,
        metaLabel: this.getSelectionMetaLabel(meta),
        canGoBack: true,
        backDisabled: false,
        hideTabBar: false,
        maxVisible: 4,
      }
    }

    const showElement = this.getCurrentShowElement()
    if (!showElement) {
      return {
        title: i18n('root:title'),
        subtitle: this.getRootSubtitle(),
        canGoBack: false,
        backDisabled: false,
        hideTabBar: false,
        maxVisible: 3,
      }
    }

    const isEntryEdit = this.isEditingEntry()
    const isGroupEditActive = this.isGroupEditActive()
    const isEntryView = showElement instanceof Entry
    const hasActiveFilters = this.hasActiveFilters()
    const subtitle = this.getContextSubtitle(showElement)

    const entryReadView = isEntryView && !isEntryEdit
    const canGoBack =
      showElement === 'otpView' || showElement === 'sshView'
        ? false
        : !(showElement instanceof ManagerRoot) || isEntryEdit || isGroupEditActive

    return {
      title: this.getContextTitle(showElement),
      ...(subtitle ? {subtitle} : {}),
      canGoBack,
      backDisabled: isGroupEditActive && Boolean(pmGroupEditModel.submit.pending()),
      hideTabBar: isGroupEditActive,
      maxVisible: entryReadView ? 3 : isEntryView ? 4 : hasActiveFilters ? 4 : 3,
      ...(entryReadView ? {overflowFromIndex: 2} : {}),
    }
  }

  getRootSubtitle(): string {
    return i18n('root:subtitle')
  }

  getToolbarActions(): PMMobileToolbarAction[] {
    if (this.getCurrentShowElement() === 'importDialog') {
      return []
    }

    const ctx = this.getCommandContext()
    const isReadOnly = ctx.readOnly

    if (this.getCurrentShowElement() === 'sshView') {
      return [{id: 'pm-create-ssh-key', icon: 'key', label: i18n('ssh:add'), disabled: isReadOnly}]
    }

    if (ctx.kind === 'passwords-selection') {
      return [
        {id: 'pm-selection-done', icon: 'check-lg', label: i18n('button:done' as any)},
        {id: 'pm-selection-delete', icon: 'trash', label: i18n('button:remove'), disabled: isReadOnly || ctx.selectedCount < 1},
      ]
    }

    if (ctx.kind === 'passwords-list') {
      const actions: PMMobileToolbarAction[] = [
        {id: 'pm-create-group', icon: 'folder-plus', label: i18n('group:create:title'), disabled: isReadOnly},
        {id: 'pm-create-entry', icon: 'plus-lg', label: i18n('button:create_entry'), disabled: isReadOnly},
        ...(ctx.hasActiveFilters
          ? [{id: 'pm-search-clear-query', icon: 'x', label: i18n('button:reset'), tone: 'accent' as const}]
          : []),
      ]
      if (this.isInNonRootGroup()) {
        actions.push(
          {id: 'pm-edit-group', icon: 'pencil-square', label: i18n('button:edit'), disabled: isReadOnly},
          {id: 'pm-delete-group', icon: 'trash', label: i18n('button:remove'), disabled: isReadOnly},
        )
      }
      return actions
    }

    if (ctx.kind === 'passwords-entry') {
      return [
        {id: 'pm-entry-copy-all', icon: 'cloud-download', label: i18n('button:copy_all_data')},
        {id: 'pm-entry-delete', icon: 'trash', label: i18n('button:delete_entry'), disabled: isReadOnly},
        {id: 'pm-entry-move', icon: 'folder-symlink', label: i18n('button:move_entry'), disabled: isReadOnly},
      ]
    }

    return []
  }

  getCommandContext(): PMMobileCommandContext {
    return {
      kind: this.getCommandKind(),
      readOnly: this.isReadOnly(),
      hasActiveFilters: this.hasActiveFilters(),
      selectedCount: pmMobileSelectionModel.selectedCount(),
      singleSelectionKind: pmMobileSelectionModel.singleSelectionKind(),
      query: filterValue().trim(),
      quickFilters: [...quickFilters()],
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
    }
  }

  handleBack(): boolean {
    if (this.sortGroupSheetOpen()) {
      this.closeSortGroupSheet()
      return true
    }

    if (pmMobileSelectionModel.active()) {
      pmMobileSelectionModel.exit()
      return true
    }

    const showElement = this.getCurrentShowElement()
    if (showElement instanceof Entry && pmEntryEditorModel.closeSurface(showElement.id)) {
      return true
    }

    if (this.isGroupEditActive()) {
      void pmGroupEditModel.requestClose()
      return true
    }

    return false
  }

  executeCommand(actionId: string, payload?: {query?: string}): boolean {
    const commandContext = this.getCommandContext()
    const isListContext = commandContext.kind === 'passwords-list'
    const isEntryContext = commandContext.kind === 'passwords-entry'
    const isSelectionContext = commandContext.kind === 'passwords-selection'
    const isReadOnly = commandContext.readOnly

    switch (actionId) {
      case 'pm-create-ssh-key':
        if (this.getCurrentShowElement() !== 'sshView' || isReadOnly) return false
        pmSshKeysViewModel.openCreate()
        return true
      case 'pm-create-entry':
        if (!isListContext || isReadOnly) return false
        pmModel.onCreateEntry()
        return true
      case 'pm-create-group':
        if (!isListContext || isReadOnly) return false
        pmModel.onCreateGroup()
        return true
      case 'pm-filters':
      case 'pm-settings':
      case 'pm-sort-group':
        if (!isListContext) return false
        this.openSortGroupSheet()
        return true
      case 'pm-search-set-query':
        if (!isListContext) return false
        filterValue.set((payload?.query ?? '').trim())
        return true
      case 'pm-search-clear-query':
        if (!isListContext) return false
        this.resetListFilters()
        return true
      case 'pm-toggle-quick-filter': {
        if (!isListContext) return false
        const filter = payload?.query as QuickFilter | undefined
        if (!filter || !ALLOWED_QUICK_FILTERS.includes(filter)) {
          return false
        }

        this.toggleQuickFilter(filter)
        return true
      }
      case 'pm-sort-direction-toggle':
        if (!isListContext) return false
        this.toggleSortDirection()
        return true
      case 'pm-sort-field-name':
      case 'pm-sort-field-username':
      case 'pm-sort-field-modified':
      case 'pm-sort-field-created':
      case 'pm-sort-field-website': {
        if (!isListContext) return false
        const next = actionId.replace('pm-sort-field-', '') as ReturnType<typeof sortField>
        this.setSortField(next)
        return true
      }
      case 'pm-group-by-none':
      case 'pm-group-by-website':
      case 'pm-group-by-modified':
      case 'pm-group-by-security': {
        if (!isListContext) return false
        const next = actionId.replace('pm-group-by-', '') as ReturnType<typeof groupBy>
        this.setGroupBy(next)
        return true
      }
      case 'pm-entry-edit':
        if (!isEntryContext || isReadOnly) return false
        return this.editCurrentEntry()
      case 'pm-entry-copy-all':
        if (!isEntryContext) return false
        return this.copyAllCurrentEntry()
      case 'pm-entry-move':
        if (!isEntryContext || isReadOnly) return false
        return this.moveCurrentEntry()
      case 'pm-entry-delete':
        if (!isEntryContext || isReadOnly) return false
        return this.deleteCurrentEntry()
      case 'pm-selection-done':
        if (!isSelectionContext) return false
        pmMobileSelectionModel.exit()
        return true
      case 'pm-selection-delete':
        if (!isSelectionContext || isReadOnly || commandContext.selectedCount < 1) return false
        void this.deleteSelection()
        return true
      case 'pm-edit-group':
        if (!isListContext || isReadOnly || !this.isInNonRootGroup()) return false
        this.groupActionsModel.enterEditMode()
        return true
      case 'pm-delete-group':
        if (!isListContext || isReadOnly || !this.isInNonRootGroup()) return false
        return this.deleteCurrentGroup()
      default:
        return false
    }
  }

  openSortGroupSheet(): void {
    this.sortGroupSheetOpen.set(true)
  }

  closeSortGroupSheet(): void {
    this.sortGroupSheetOpen.set(false)
  }

  setSortField(field: SortField): void {
    sortField.set(field)
    this.saveSortSettings()
  }

  toggleSortDirection(): void {
    this.setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc')
  }

  setSortDirection(direction: SortDirection): void {
    sortDirection.set(direction)
    this.saveSortSettings()
  }

  setGroupBy(value: GroupBy): void {
    groupBy.set(value)
    this.saveSortSettings()
  }

  resetSortGrouping(): void {
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    this.saveSortSettings()
  }

  hasActiveSortGrouping(): boolean {
    return sortField() !== 'name' || sortDirection() !== 'asc' || groupBy() !== 'none'
  }

  private hasActiveFilters(): boolean {
    return (
      filterValue().trim().length > 0 ||
      quickFilters().length > 0 ||
      selectedCredentialTagFilters().length > 0
    )
  }

  private getSelectionMeta(): PMMobileToolbarMetaItem[] {
    const entryCount = pmMobileSelectionModel.selectedEntryIds().length
    const groupCount = pmMobileSelectionModel.selectedGroupIds().length
    const meta: PMMobileToolbarMetaItem[] = []

    if (entryCount > 0) {
      meta.push({
        id: 'entries',
        icon: 'key',
        label: i18n('group:entries' as any),
        value: String(entryCount),
      })
    }

    if (groupCount > 0) {
      meta.push({
        id: 'groups',
        icon: 'folder',
        label: i18n('group:groups' as any),
        value: String(groupCount),
      })
    }

    return meta
  }

  private getSelectionMetaLabel(meta: PMMobileToolbarMetaItem[]): string {
    const selectedLabel = i18n('details:selected' as any)
    if (meta.length === 0) return selectedLabel
    return `${selectedLabel}: ${meta.map((item) => `${item.label}: ${item.value}`).join(', ')}`
  }

  private isReadOnly(): boolean {
    return isPassmanagerReadOnly()
  }

  private isEditingEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    return showElement instanceof Entry ? pmEntryEditorModel.isActiveForEntry(showElement.id) : false
  }

  private isGroupEditActive(): boolean {
    return pmGroupEditModel.active()
  }

  private getCurrentShowElement(): PMShowElement {
    return getPassmanagerShowElement()
  }

  private getContextTitle(showElement: Exclude<PMShowElement, undefined>): string {
    if (showElement === 'createEntry') return i18n('entry:create:title')
    if (showElement === 'createGroup') return i18n('group:create:mobile-title')
    if (showElement === 'importDialog') return i18n('import:dialog:title')
    if (showElement === 'otpView') return i18n('otp:quick_view:title' as never)
    if (showElement === 'sshView') return i18n('ssh:keys_view:title' as never)
    if (this.isGroupEditActive()) return i18n('group:edit:title')
    if (showElement instanceof Entry) return showElement.title || i18n('no_title')
    if (showElement instanceof Group) return showElement.name || i18n('no_title')
    if (showElement instanceof ManagerRoot) return i18n('root:title')
    return i18n('root:title')
  }

  private getContextSubtitle(showElement: Exclude<PMShowElement, undefined>): string | undefined {
    if (showElement instanceof ManagerRoot) return this.getRootSubtitle()
    if (showElement === 'createGroup') return i18n('group:create:mobile-subtitle')
    if (showElement === 'otpView') return i18n('otp:quick_view:subtitle' as never)
    if (showElement === 'sshView') return i18n('ssh:keys_view:subtitle' as never)
    return undefined
  }

  private isInNonRootGroup(): boolean {
    return this.getCurrentShowElement() instanceof Group
  }

  private getCommandKind(): PMMobileCommandKind {
    if (pmMobileSelectionModel.active()) {
      return 'passwords-selection'
    }

    const showElement = this.getCurrentShowElement()
    if (!showElement || this.isEditingEntry() || this.isGroupEditActive()) {
      return 'none'
    }

    if (showElement instanceof Entry) {
      return 'passwords-entry'
    }

    if (showElement instanceof ManagerRoot || showElement instanceof Group) {
      return 'passwords-list'
    }

    return 'none'
  }

  private editCurrentEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    if (!(showElement instanceof Entry) || this.isEditingEntry()) {
      return false
    }

    pmEntryEditorModel.openSurface(showElement.id, showElement.entryType === 'payment_card' ? 'payment-card' : 'entry')
    return true
  }

  private copyAllCurrentEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    if (!(showElement instanceof Entry) || this.isEditingEntry()) {
      return false
    }

    void this.entryActionsModel.actions.copyAll(showElement)
    return true
  }

  private moveCurrentEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    if (!(showElement instanceof Entry) || this.isEditingEntry()) {
      return false
    }

    void this.entryActionsModel.moveEntryCard(showElement)
    return true
  }

  private deleteCurrentEntry(): boolean {
    const showElement = this.getCurrentShowElement()
    if (!(showElement instanceof Entry) || this.isEditingEntry()) {
      return false
    }

    this.entryActionsModel.deleteEntryCard(showElement)
    return true
  }

  private deleteCurrentGroup(): boolean {
    const showElement = this.getCurrentShowElement()
    if (!(showElement instanceof Group)) {
      return false
    }

    this.groupActionsModel.deleteGroup(showElement)
    return true
  }

  private saveSortSettings(): void {
    sortStorage.saveSettings({
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
      viewMode: viewMode(),
    })
  }

  private resetListFilters(): void {
    filterValue.set('')
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
    this.resetSortGrouping()
  }

  private toggleQuickFilter(filter: QuickFilter): void {
    const activeFilters = quickFilters()
    if (activeFilters.includes(filter)) {
      quickFilters.set(activeFilters.filter((item) => item !== filter))
      return
    }

    quickFilters.set([...activeFilters, filter])
  }

  private async deleteSelection(): Promise<void> {
    const {entries, groups} = this.resolveSelectedItems()
    if (!entries.length && !groups.length) return

    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        cancelText: i18n('button:cancel'),
        confirmText: i18n('button:remove'),
        confirmVariant: 'danger',
        variant: 'danger',
      }),
    )
    if (!confirmed) return

    await this.runDeleteBatch([...entries, ...groups], 0, entries.length + groups.length)
  }

  private resolveSelectedItems(): {entries: Entry[]; groups: Group[]} {
    const root = getPassmanagerRoot()
    if (!root) {
      return {entries: [], groups: []}
    }

    const selectedGroups = pmMobileSelectionModel.selectedGroupIds()
      .map((groupId) => root.getCardByID(groupId))
      .filter((item): item is Group => item instanceof Group)
      .sort((left, right) => left.name.localeCompare(right.name))

    const selectedGroupNames = new Set(selectedGroups.map((group) => group.name))

    const groups = selectedGroups.filter((group) => !this.hasSelectedGroupAncestor(group, selectedGroupNames))
    const protectedGroupNames = new Set(groups.map((group) => group.name))

    const entries = pmMobileSelectionModel.selectedEntryIds()
      .map((entryId) => root.getCardByID(entryId))
      .filter((item): item is Entry => item instanceof Entry)
      .filter((entry) => !this.isEntryCoveredBySelectedGroup(entry, protectedGroupNames))
      .sort((left, right) => left.id.localeCompare(right.id))

    return {entries, groups}
  }

  private hasSelectedGroupAncestor(group: Group, selectedGroupNames: Set<string>): boolean {
    const parts = group.name.split('/').filter(Boolean)
    let currentPath = ''

    for (let index = 0; index < parts.length - 1; index += 1) {
      currentPath = currentPath ? `${currentPath}/${parts[index]}` : parts[index]!
      if (selectedGroupNames.has(currentPath)) {
        return true
      }
    }

    return false
  }

  private isEntryCoveredBySelectedGroup(entry: Entry, selectedGroupNames: Set<string>): boolean {
    const parent = entry.parent
    return parent instanceof Group ? selectedGroupNames.has(parent.name) || this.hasSelectedGroupAncestor(parent, selectedGroupNames) : false
  }

  private async runDeleteBatch(
    items: Array<Entry | Group>,
    alreadyDeleted: number,
    total: number,
    feedback?: ToastHandle,
  ): Promise<void> {
    if (this.bulkDeletePending || items.length === 0) return
    this.bulkDeletePending = true
    pmDeleteMotionModel.markPending(items)
    const pendingMessage = `${i18n('button:remove')}… (${alreadyDeleted}/${total})`
    const operationToast =
      feedback ??
      toast.loading(pendingMessage, undefined, {
        key: 'passmanager.selection.delete',
      })
    if (feedback) {
      operationToast.update({
        key: 'passmanager.selection.delete',
        message: pendingMessage,
        variant: 'loading',
      })
    }

    const failures: Array<Entry | Group> = []
    try {
      for (const item of items) {
        try {
          if (item instanceof Entry) {
            await wrap(item.remove({silent: true, notifyResult: false}))
          } else {
            await wrap(item.remove({silent: true}))
          }
        } catch {
          failures.push(item)
        }
      }
    } finally {
      this.bulkDeletePending = false
    }

    const deleted = alreadyDeleted + items.length - failures.length
    if (failures.length === 0) {
      const message = `${i18n('notify:remove:success')} (${deleted}/${total})`
      operationToast.update({
        key: 'passmanager.selection.delete',
        message,
        variant: 'success',
      })
      pmMobileSelectionModel.exit()
      return
    }

    pmDeleteMotionModel.clearPending(failures.map((item) => item.id))
    pmMobileSelectionModel.selectedEntryIds.set(
      failures.filter((item): item is Entry => item instanceof Entry).map((item) => item.id),
    )
    pmMobileSelectionModel.selectedGroupIds.set(
      failures.filter((item): item is Group => item instanceof Group).map((item) => item.id),
    )

    const retry = () => {
      void this.runDeleteBatch(failures, deleted, total, operationToast)
    }
    const options = {
      key: 'passmanager.selection.delete',
      message: `${i18n('notify:remove:error')} (${deleted}/${total})`,
      variant: 'error' as const,
      persistent: true,
      closable: true,
      actions: [
        {
          label: i18n('button:retry'),
          dismissOnClick: false,
          onClick: retry,
        },
      ],
    }
    operationToast.update(options)
  }
}

export const pmMobileChromeModel = new PMMobileChromeModel()
