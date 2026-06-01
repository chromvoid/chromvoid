import {PMSummaryRail} from '../../passmanager/components/summary-rail'
import {VirtualFileListBase} from './virtual-file-list.base'

export class VirtualFileListMobile extends VirtualFileListBase {
  static define() {
    PMSummaryRail.define()
    if (!customElements.get('virtual-file-list')) {
      customElements.define('virtual-file-list', this)
    }
  }
}
