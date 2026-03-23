import {PMCardHeaderBase} from './pm-card-header-base'
import {pmCardHeaderDesktopStyles} from './styles'

/**
 * Унифицированный заголовок карточки для pm-entry и pm-group
 * Обеспечивает одинаковые размеры и отступы для визуальной консистентности
 *
 * @slot avatar - Аватар (иконка/буква) слева
 * @slot - Основной контент (название, бейджи)
 * @slot actions - Действия справа (кнопка назад и т.д.)
 */
export class PMCardHeader extends PMCardHeaderBase {
  static define() {
    customElements.define('pm-card-header', this)
  }

  static styles = pmCardHeaderDesktopStyles
}
