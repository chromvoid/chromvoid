import {FileItemBase} from './file-item.base'
import {fileItemDesktopStyles} from './file-item/file-item-desktop.styles'
import {renderDesktopFileItem, type FileItemRenderData} from './file-item/render'

export class FileItem extends FileItemBase {
  static elementName = 'file-item-desktop'
  static override styles = [...FileItemBase.styles, fileItemDesktopStyles]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected override renderItem(data: FileItemRenderData) {
    return renderDesktopFileItem(data)
  }
}
