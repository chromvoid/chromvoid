export type ListOrientation = 'vertical' | 'horizontal'
export type KeyboardSelectionMode = 'single' | 'multiple'

export interface KeyboardEventLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

export interface ListKeyboardIntentContext {
  orientation: ListOrientation
  selectionMode: KeyboardSelectionMode
  rangeSelectionEnabled: boolean
}

export type ListKeyboardIntent =
  | 'NAV_NEXT'
  | 'NAV_PREV'
  | 'NAV_FIRST'
  | 'NAV_LAST'
  | 'TOGGLE_SELECTION'
  | 'RANGE_NEXT'
  | 'RANGE_PREV'
  | 'RANGE_SELECT_ACTIVE'
  | 'ACTIVATE'
  | 'DISMISS'
  | 'SELECT_ALL'

const isSelectAllShortcut = (event: KeyboardEventLike) =>
  (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'a'

export function mapListboxKeyboardIntent(
  event: KeyboardEventLike,
  context: ListKeyboardIntentContext,
): ListKeyboardIntent | null {
  const nextKey = context.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const prevKey = context.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'

  const rangeEnabled = context.selectionMode === 'multiple' && context.rangeSelectionEnabled

  if (event.key === nextKey) {
    if (rangeEnabled && event.shiftKey) return 'RANGE_NEXT'
    return 'NAV_NEXT'
  }

  if (event.key === prevKey) {
    if (rangeEnabled && event.shiftKey) return 'RANGE_PREV'
    return 'NAV_PREV'
  }

  if (event.key === 'Home') return 'NAV_FIRST'
  if (event.key === 'End') return 'NAV_LAST'
  if (event.key === 'Escape') return 'DISMISS'

  if (event.key === ' ' || event.key === 'Spacebar') {
    if (rangeEnabled && event.shiftKey) return 'RANGE_SELECT_ACTIVE'
    return 'TOGGLE_SELECTION'
  }

  if (event.key === 'Enter') return 'ACTIVATE'

  if (context.selectionMode === 'multiple' && isSelectAllShortcut(event)) {
    return 'SELECT_ALL'
  }

  return null
}
