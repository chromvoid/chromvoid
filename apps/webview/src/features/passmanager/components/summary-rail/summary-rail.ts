import {css, nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

export type PMSummaryRailTone = 'neutral' | 'primary' | 'warning' | 'danger'

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
    display: inline-flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0;
    inline-size: var(--pm-summary-rail-inline-size, 100%);
    max-inline-size: 100%;
    min-inline-size: 0;
    box-sizing: border-box;
    margin: 0;
    padding: var(--pm-summary-rail-padding, 2px);
    overflow-x: auto;
    border: var(--pm-summary-rail-border, 1px solid var(--cv-color-border));
    border-radius: var(--cv-radius-2);
    background: var(--pm-summary-rail-background, var(--cv-color-surface-2));
    box-shadow: var(--pm-summary-rail-box-shadow, none);
    scrollbar-width: none;
  }

  .summary-rail::-webkit-scrollbar {
    display: none;
  }

  .summary-rail__chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-block-size: 22px;
    padding: 0 8px;
    color: var(--cv-color-text-muted);
    font-family: var(--cv-font-family-code);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .summary-rail__chip + .summary-rail__chip::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    inset-block: 5px;
    inline-size: 1px;
    background: var(--cv-color-border);
  }

  .summary-rail__chip dt,
  .summary-rail__value {
    margin: 0;
  }

  .summary-rail__value {
    color: var(--cv-color-text);
    font-size: 12px;
    font-weight: 680;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .summary-rail__chip[data-tone='primary'] .summary-rail__value {
    color: var(--cv-color-primary);
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
