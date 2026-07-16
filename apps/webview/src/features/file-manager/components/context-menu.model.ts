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
  readonly label = atom('', 'file.contextMenu.label')

  show(x: number, y: number, items: ContextMenuItem[], label = ''): void {
    this.items.set(items)
    this.label.set(label)
    this.position.set({x: Math.max(8, Math.floor(x)), y: Math.max(8, Math.floor(y))})
    this.visible.set(true)
  }

  hide(): void {
    this.visible.set(false)
    this.items.set([])
    this.label.set('')
  }

  getActivatableItemById(id: string): ContextMenuItem | undefined {
    return this.items().find(
      (candidate) => candidate.id === id && !candidate.disabled && !candidate.separator,
    )
  }
}
