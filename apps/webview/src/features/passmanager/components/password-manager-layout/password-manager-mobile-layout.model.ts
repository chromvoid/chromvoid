import {Entry, Group} from '@project/passmanager/core'

import {pmMobileDebug} from '../../models/pm-mobile-debug'
import {pmMobileLongPressModel} from '../../models/pm-mobile-long-press.model'
import {pmMobileSelectionModel, type PMSelectionKind} from '../../models/pm-mobile-selection.model'
import {getPassmanagerRoot} from '../../models/pm-root.adapter'

type PMRowSelectionState = {
  selectionActive: boolean
  selected: boolean
}

type PMTapDecision = 'toggle' | 'open' | 'noop'

type PMPoint = {
  x: number
  y: number
}

class PasswordManagerMobileLayoutModel {
  readonly selection = pmMobileSelectionModel
  readonly longPress = pmMobileLongPressModel

  beginEntryLongPress(entryId: string, point: PMPoint, beforeCommit?: () => void): number {
    pmMobileDebug('layoutModel', 'beginEntryLongPress', {entryId, point})
    return this.longPress.arm({kind: 'entry', id: entryId}, point, (token) => {
      pmMobileDebug('layoutModel', 'commitEntryLongPress', {entryId, token})
      beforeCommit?.()
      this.selection.enterWithEntry(entryId, token)
    })
  }

  beginGroupLongPress(groupId: string, point: PMPoint, beforeCommit?: () => void): number {
    pmMobileDebug('layoutModel', 'beginGroupLongPress', {groupId, point})
    return this.longPress.arm({kind: 'group', id: groupId}, point, (token) => {
      pmMobileDebug('layoutModel', 'commitGroupLongPress', {groupId, token})
      beforeCommit?.()
      this.selection.enterWithGroup(groupId, token)
    })
  }

  moveLongPress(point: PMPoint): void {
    this.longPress.move(point)
  }

  endLongPress(): number | null {
    const token = this.longPress.release()
    pmMobileDebug('layoutModel', 'endLongPress', {token})
    return token
  }

  cancelLongPress(): void {
    pmMobileDebug('layoutModel', 'cancelLongPress')
    this.longPress.cancel()
  }

  triggerEntryContextSelection(entryId: string): number {
    pmMobileDebug('layoutModel', 'triggerEntryContextSelection', {entryId})
    return this.longPress.forceCommitFromContextMenu({kind: 'entry', id: entryId}, (token) => {
      this.selection.enterWithEntry(entryId, token)
    })
  }

  triggerGroupContextSelection(groupId: string): number {
    pmMobileDebug('layoutModel', 'triggerGroupContextSelection', {groupId})
    return this.longPress.forceCommitFromContextMenu({kind: 'group', id: groupId}, (token) => {
      this.selection.enterWithGroup(groupId, token)
    })
  }

  handleEntryTap(entryId: string, token?: number | null): PMTapDecision {
    if (this.selection.consumeSuppressedTap('entry', entryId, token)) {
      pmMobileDebug('layoutModel', 'handleEntryTap.noop', {entryId, token})
      return 'noop'
    }

    if (this.selection.active()) {
      this.selection.toggleEntry(entryId)
      pmMobileDebug('layoutModel', 'handleEntryTap.toggle', {entryId, token})
      return 'toggle'
    }

    pmMobileDebug('layoutModel', 'handleEntryTap.open', {entryId, token})
    return 'open'
  }

  handleGroupTap(groupId: string, token?: number | null): PMTapDecision {
    if (this.selection.consumeSuppressedTap('group', groupId, token)) {
      pmMobileDebug('layoutModel', 'handleGroupTap.noop', {groupId, token})
      return 'noop'
    }

    if (this.selection.active()) {
      this.selection.toggleGroup(groupId)
      pmMobileDebug('layoutModel', 'handleGroupTap.toggle', {groupId, token})
      return 'toggle'
    }

    pmMobileDebug('layoutModel', 'handleGroupTap.open', {groupId, token})
    return 'open'
  }

  getRowSelectionState(kind: PMSelectionKind, id: string): PMRowSelectionState {
    const selectionActive = this.selection.active()
    if (!selectionActive) {
      return {selectionActive, selected: false}
    }

    return {
      selectionActive,
      selected: kind === 'entry' ? this.selection.isEntrySelected(id) : this.selection.isGroupSelected(id),
    }
  }

  getSelectionSnapshot() {
    return {
      active: this.selection.active(),
      selectedCount: this.selection.selectedCount(),
      singleSelectionKind: this.selection.singleSelectionKind(),
      singleSelectionId: this.selection.singleSelectionId(),
      selectedEntryIds: this.selection.selectedEntryIds(),
      selectedGroupIds: this.selection.selectedGroupIds(),
    }
  }

  resolveCardById(id: string): Entry | Group | null {
    const item = getPassmanagerRoot()?.getCardByID?.(id)
    return item instanceof Entry || item instanceof Group ? item : null
  }
}

export const passwordManagerMobileLayoutModel = new PasswordManagerMobileLayoutModel()
