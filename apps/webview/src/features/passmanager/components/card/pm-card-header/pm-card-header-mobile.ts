import {PMCardHeaderBase} from './pm-card-header-base'
import {pmCardHeaderMobileStyles} from './styles'

/**
 * Mobile-optimized card header.
 * No avatar slot, no top accent bar, tight padding.
 * Content flows as: [content] [actions]
 *
 * @slot - Main content (title, badges)
 * @slot actions - Action buttons (edit, move, delete, back)
 */
export class PMCardHeaderMobile extends PMCardHeaderBase {
  static define() {
    if (!customElements.get('pm-card-header-mobile')) {
      customElements.define('pm-card-header-mobile', this)
    }
  }

  static styles = pmCardHeaderMobileStyles

  protected override hasAvatarSlot(): boolean {
    return false
  }
}
