import {FileItemBase} from './file-item.base'
import {renderDesktopFileItem, type FileItemRenderData} from './file-item/render'

export class FileItem extends FileItemBase {
  static elementName = 'file-item-desktop'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected override renderItem(data: FileItemRenderData) {
    return renderDesktopFileItem(data)
  }
}
