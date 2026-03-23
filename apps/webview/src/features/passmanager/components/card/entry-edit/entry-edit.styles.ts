import {css} from 'lit'

import {pmEntryCardStyles, pmEntryGenerateStyles} from '../entry-create/styles'
import {pmSharedStyles} from '../../../styles/shared'

const pmEntryEditScrollbarStyles = css`
  :host {
    scrollbar-gutter: stable;
  }
`

export const pmEntryEditSharedStyles = [
  pmSharedStyles,
  pmEntryCardStyles,
  pmEntryGenerateStyles,
  pmEntryEditScrollbarStyles,
]
