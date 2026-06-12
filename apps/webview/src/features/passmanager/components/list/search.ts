import {html} from '@chromvoid/uikit/reatom-lit'

import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'

import {PMSearchBase, searchBaseStyles} from './search-base'

export class PMSearch extends PMSearchBase {
  static define() {
    if (!customElements.get('pm-search')) {
      customElements.define('pm-search', this)
    }
  }
  static styles = [searchBaseStyles]

  render() {
    const {className, isInvalid, isSearched} = this.getSearchState()

    return html`
      <div class="search-header">
        ${this.renderSearchInput(className, isInvalid, isSearched)}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-icon': CVIcon
  }
}
