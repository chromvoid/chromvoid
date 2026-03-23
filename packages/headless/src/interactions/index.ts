export type InteractionIntent =
  | 'NAV_NEXT'
  | 'NAV_PREV'
  | 'NAV_FIRST'
  | 'NAV_LAST'
  | 'ACTIVATE'
  | 'TOGGLE_SELECTION'
  | 'DISMISS'

export type InteractionSource = 'keyboard' | 'pointer' | 'programmatic'

export interface InteractionEvent {
  intent: InteractionIntent
  source: InteractionSource
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export type InteractionHandler = (event: InteractionEvent) => void

export * from './keyboard-intents'
export * from './typeahead'
export * from './composite-navigation'
export * from './overlay-focus'
