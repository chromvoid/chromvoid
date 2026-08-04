export type MobileToolbarLeadingMode = 'menu' | 'back' | 'none'

export type MobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
  active?: boolean
  tone?: 'accent'
  overflowOnly?: boolean
  preserveFocusOnPress?: boolean
}

export type MobileToolbarTitleAction = {
  id: string
  label: string
  disabled?: boolean
  expanded?: boolean
  popup?: 'dialog' | 'menu'
}

export type MobileToolbarStatusTone = 'saved' | 'dirty' | 'saving' | 'error' | 'readonly' | 'neutral'

export type MobileToolbarStatus = {
  tone: MobileToolbarStatusTone
  icon: string
  label: string
  spinner?: boolean
}

export type MobileToolbarMetaItem = {
  id: string
  icon: string
  label: string
  value: string
}
