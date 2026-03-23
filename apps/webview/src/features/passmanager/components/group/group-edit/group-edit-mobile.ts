import {hostContentContainStyles} from 'root/shared/ui/shared-styles'
import {pmSharedStyles} from '../../../styles/shared'
import {PMGroupEditBase} from './group-edit-base'
import {pmGroupEditSharedStyles} from './styles'

export class PMGroupEditMobile extends PMGroupEditBase {
  static define() {
    if (!customElements.get('pm-group-edit-mobile')) {
      customElements.define('pm-group-edit-mobile', this)
    }
  }

  static styles = [pmSharedStyles, hostContentContainStyles, pmGroupEditSharedStyles]
}
