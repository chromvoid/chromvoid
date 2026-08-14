import {css, nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

export type PMSummaryRailTone = 'neutral' | 'muted' | 'primary' | 'warning' | 'danger'

export type PMSummaryRailItem = {
  id: string
  label: string
  value: string | number | null
  tone?: PMSummaryRailTone
  loadingLabel?: string
}

export const pmSummaryRailStyles = css`
  :host {
    display: block;
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  .summary-rail {
    display: grid;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    grid-template-columns: none;
    inline-size: 100%;
    max-inline-size: 100%;
    min-block-size: 58px;
    min-inline-size: 0;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-4);
    background: var(--cv-color-surface-secondary-glass);
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-4);
    scrollbar-width: none;
  }

  .summary-rail::-webkit-scrollbar {
    display: none;
  }

  .summary-rail__chip {
    position: relative;
    display: grid;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-block-size: 58px;
    min-inline-size: 0;
    box-sizing: border-box;
    padding: 9px 6px 8px;
    color: var(--cv-color-text-muted);
    font-family: var(--cv-font-family-code);
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.12em;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .summary-rail__chip + .summary-rail__chip::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    inset-block: 0;
    inline-size: 1px;
    background: var(--cv-color-border-muted);
  }

  .summary-rail__chip dt,
  .summary-rail__value {
    margin: 0;
  }

  .summary-rail__chip dt {
    color: var(--cv-color-text-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-rail__value {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--cv-color-text-strongest);
    font-family: var(--cv-font-family-code);
    font-size: 1.35rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 0.9;
    font-variant-numeric: tabular-nums;
  }

  .summary-rail__chip[data-tone='muted'] .summary-rail__value {
    color: var(--cv-color-text-subtle);
  }

  .summary-rail__chip[data-tone='primary'] .summary-rail__value {
    color: var(--cv-color-accent);
  }

  .summary-rail__chip[data-tone='warning'] .summary-rail__value {
    color: var(--cv-color-warning);
  }

  .summary-rail__chip[data-tone='danger'] .summary-rail__value {
    color: var(--cv-color-danger);
  }

  .summary-rail__value[data-loading='true'] {
    color: var(--cv-color-text-muted);
  }
`

export class PMSummaryRail extends ReatomLitElement {
  static properties = {
    items: {attribute: false},
    label: {type: String},
    busy: {type: Boolean},
  }

  static styles = pmSummaryRailStyles

  declare items: readonly PMSummaryRailItem[]
  declare label: string
  declare busy: boolean

  constructor() {
    super()
    this.items = []
    this.label = ''
    this.busy = false
  }

  static define() {
    if (!customElements.get('pm-summary-rail')) {
      customElements.define('pm-summary-rail', this)
    }
  }

  protected render() {
    return html`
      <dl
        class="summary-rail"
        aria-label=${this.label || nothing}
        aria-busy=${this.busy ? 'true' : 'false'}
      >
        ${this.items.map((item) => this.renderItem(item))}
      </dl>
    `
  }

  private renderItem(item: PMSummaryRailItem) {
    const loading = item.value === null
    const visibleValue = loading ? '...' : String(item.value)
    const ariaValue = loading ? item.loadingLabel ?? visibleValue : visibleValue
    const tone = item.tone ?? 'neutral'

    return html`
      <div
        class="summary-rail__chip"
        data-summary-id=${item.id}
        data-tone=${tone}
        aria-label=${`${item.label}: ${ariaValue}`}
      >
        <dt>${item.label}</dt>
        <dd class="summary-rail__value" data-loading=${loading ? 'true' : 'false'}>${visibleValue}</dd>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-summary-rail': PMSummaryRail
  }
}
