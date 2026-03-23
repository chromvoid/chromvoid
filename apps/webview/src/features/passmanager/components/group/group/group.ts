import {hostContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

import {
  emptyStateCSS,
  folderItemCSS,
  listItemsCSS,
  metadataSectionCSS,
  pmSharedStyles,
} from '../../../styles/shared'
import {listGroupStyles} from '../../list/list-item-styles'
import {pmEntryCardStyles} from '../../card/entry-create/styles'
import {PMGroupEdit} from '../group-edit'
import {PMGroupBase} from './group-base'
import {pmGroupCommonStyles, pmGroupDesktopStyles} from './styles'

export class PMGroup extends PMGroupBase {
  static define() {
    customElements.define('pm-group', this)
    PMGroupEdit.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    motionPrimitiveStyles,
    pmEntryCardStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    metadataSectionCSS,
    emptyStateCSS,
    pmGroupCommonStyles,
    pmGroupDesktopStyles,
  ]
}
