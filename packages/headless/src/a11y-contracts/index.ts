import type {HeadlessId} from '../core'

export type FocusStrategy = 'roving-tabindex' | 'aria-activedescendant'

export interface RootA11yProps {
  role: string
  tabindex: '0' | '-1'
  'aria-label'?: string
  'aria-orientation'?: 'vertical' | 'horizontal'
  'aria-multiselectable'?: 'true' | 'false'
  'aria-activedescendant'?: string
}

export interface ItemA11yProps {
  id: string
  role: string
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'aria-selected'?: 'true' | 'false'
  'data-active'?: 'true' | 'false'
}

export interface A11yContract {
  strategy: FocusStrategy
  getRootProps(): RootA11yProps
  getItemProps(itemId: HeadlessId): ItemA11yProps
}
