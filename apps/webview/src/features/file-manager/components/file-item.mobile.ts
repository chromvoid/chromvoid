import {FileItemBase} from './file-item.base'
import {fileItemMobileStyles} from './file-item/file-item-mobile.styles'
import {fileItemStyles} from './file-item/file-item.styles'
import {renderMobileFileItem, type FileItemRenderData} from './file-item/render'
import {isMobileTouch} from './file-item/utils'

export class FileItemMobile extends FileItemBase {
  static elementName = 'file-item-mobile'
  static styles = [...fileItemStyles, fileItemMobileStyles]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected override get dragEnabled(): boolean {
    return false
  }

  protected override get showSwipeActions(): boolean {
    return this.viewMode === 'list' && isMobileTouch()
  }

  protected override readonly onTouchStart = (event: TouchEvent) => {
    this.model.startTouch(event)
  }

  protected override renderItem(data: FileItemRenderData) {
    return renderMobileFileItem(data)
  }
}
