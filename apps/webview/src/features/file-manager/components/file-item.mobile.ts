import {FileItemBase} from './file-item.base'

export class FileItemMobile extends FileItemBase {
  static define() {
    if (!customElements.get('file-item')) {
      customElements.define('file-item', this)
    }
  }

  protected override get dragEnabled(): boolean {
    return false
  }

  protected override get showSwipeActions(): boolean {
    return this.viewMode === 'list'
  }

  private mobileTouchMoveBound = false

  override connectedCallback() {
    super.connectedCallback()
    if (!this.mobileTouchMoveBound) {
      this.updateComplete.then(() => {
        const fileItemEl = this.shadowRoot?.querySelector('.file-item')
        fileItemEl?.addEventListener('touchmove', this.onTouchMove as EventListener, {passive: false})
        this.mobileTouchMoveBound = true
      })
    }
  }

  override disconnectedCallback() {
    this.mobileTouchMoveBound = false
    const fileItemEl = this.shadowRoot?.querySelector('.file-item')
    fileItemEl?.removeEventListener('touchmove', this.onTouchMove as EventListener)
    super.disconnectedCallback()
  }
}
