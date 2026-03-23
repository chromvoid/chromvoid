import {hostContentContainStyles} from 'root/shared/ui/shared-styles'
import {pmSharedStyles} from '../../../styles/shared'
import {PMGroupEditBase} from './group-edit-base'
import {pmGroupEditSharedStyles} from './styles'

export class PMGroupEdit extends PMGroupEditBase {
  static define() {
    customElements.define('pm-group-edit', this)
  }

  static styles = [pmSharedStyles, hostContentContainStyles, pmGroupEditSharedStyles]
}
