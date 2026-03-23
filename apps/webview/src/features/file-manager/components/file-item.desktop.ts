import {FileItemBase} from './file-item.base'

export class FileItem extends FileItemBase {
  static define() {
    if (!customElements.get('file-item')) {
      customElements.define('file-item', this)
    }
  }
}
