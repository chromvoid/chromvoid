import {PMCardHeaderBase} from './pm-card-header-base'
import {pmCardHeaderDesktopStyles} from './styles'

/**Unified header for pm-entry and pm-group
Provides the same sizes and indentations for visual consistency
*
* @slot avatar - Avatar (icon/letter) left
* @slot - Main Content (title, badges)
* @slot actions - Actions on the right (back button, etc.)
*/
export class PMCardHeader extends PMCardHeaderBase {
  static define() {
    if (!customElements.get('pm-card-header')) {
      customElements.define('pm-card-header', this)
    }
  }

  static styles = pmCardHeaderDesktopStyles
}
