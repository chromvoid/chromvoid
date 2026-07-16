import {VirtualFileListBase} from './virtual-file-list.base'
import {virtualFileListDesktopStyles} from './virtual-file-list/virtual-file-list.desktop.styles'

export class VirtualFileList extends VirtualFileListBase {
  static override styles = [...VirtualFileListBase.styles, virtualFileListDesktopStyles]

  static define() {
    if (!customElements.get('virtual-file-list')) {
      customElements.define('virtual-file-list', this)
    }
  }
}
