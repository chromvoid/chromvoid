import {atom} from '@reatom/core'

import type {KeyboardShortcutId} from 'root/shared/keyboard'

export type ContextMenuItem = {
  id: string
  label: string
  icon: string
  action: () => void
  disabled?: boolean
  separator?: boolean
  shortcutId?: KeyboardShortcutId
}

export type ContextMenuPosition = {
  x: number
  y: number
}

export class ContextMenuModel {
  readonly visible = atom(false, 'file.contextMenu.visible')
  readonly position = atom<ContextMenuPosition>({x: 0, y: 0}, 'file.contextMenu.position')
  readonly items = atom<ContextMenuItem[]>([], 'file.contextMenu.items')
  readonly activeIndex = atom(-1, 'file.contextMenu.activeIndex')

  show(x: number, y: number, items: ContextMenuItem[]): void {
    this.items.set(items)
    this.position.set({x: Math.max(8, Math.floor(x)), y: Math.max(8, Math.floor(y))})
    this.activeIndex.set(this.selectableItems(items).length > 0 ? 0 : -1)
    this.visible.set(true)
  }

  hide(): void {
    this.visible.set(false)
    this.activeIndex.set(-1)
  }

  setPosition(x: number, y: number): void {
    this.position.set({x: Math.max(8, Math.floor(x)), y: Math.max(8, Math.floor(y))})
  }

  moveSelection(direction: number): void {
    const selectableItems = this.selectableItems()
    if (selectableItems.length === 0) return

    let newIndex = this.activeIndex() + direction
    if (newIndex < 0) newIndex = selectableItems.length - 1
    if (newIndex >= selectableItems.length) newIndex = 0

    this.activeIndex.set(newIndex)
  }

  setActiveSelectableIndex(index: number): void {
    if (index < 0) return
    this.activeIndex.set(index)
  }

  getCurrentItem(): ContextMenuItem | undefined {
    return this.selectableItems()[this.activeIndex()]
  }

  getActivatableItemById(id: string): ContextMenuItem | undefined {
    return this.items().find(
      (candidate) => candidate.id === id && !candidate.disabled && !candidate.separator,
    )
  }

  getSelectableIndexById(id: string): number {
    return this.selectableItems().findIndex((candidate) => candidate.id === id)
  }

  getSelectableIndexAtItemIndex(index: number): number {
    const item = this.items()[index]
    if (!item || item.disabled) return -1
    return this.items()
      .slice(0, index)
      .filter((candidate) => !candidate.disabled && !candidate.separator).length
  }

  private selectableItems(items = this.items()): ContextMenuItem[] {
    return items.filter((item) => !item.disabled && !item.separator)
  }
}
