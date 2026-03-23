import {LitElement, css, html} from 'lit'

export interface CVTreeItemToggleDetail {
  id: string
}

export type CVTreeItemToggleEvent = CustomEvent<CVTreeItemToggleDetail>

export interface CVTreeItemEventMap {
  'cv-treeitem-toggle': CVTreeItemToggleEvent
}

export class CVTreeItem extends LitElement {
  static elementName = 'cv-treeitem'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      label: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
      expanded: {type: Boolean, reflect: true},
      branch: {type: Boolean, reflect: true},
      level: {type: Number, reflect: true},
    }
  }

  declare value: string
  declare label: string
  declare disabled: boolean
  declare active: boolean
  declare selected: boolean
  declare expanded: boolean
  declare branch: boolean
  declare level: number

  constructor() {
    super()
    this.value = ''
    this.label = ''
    this.disabled = false
    this.active = false
    this.selected = false
    this.expanded = false
    this.branch = false
    this.level = 1
  }

  static styles = [
    css`
      :host {
        display: block;
        outline: none;
        --cv-treeview-indent-size: 1.5rem;
        --cv-treeview-indent-guide-width: 0px;
        --cv-treeview-indent-guide-color: var(--cv-color-border, #2a3245);
        --cv-treeview-indent-guide-style: solid;
      }

      :host([hidden]) {
        display: none;
      }

      [part='row'] {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        min-block-size: 32px;
        padding-inline-start: calc(var(--cv-treeview-indent-size) * max(var(--cv-tree-level, 1) - 1, 0));
        padding-inline-end: var(--cv-space-2, 8px);
        border-radius: var(--cv-radius-sm, 6px);
      }

      :host([active]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent);
      }

      :host([selected]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 30%, transparent);
      }

      :host([disabled]) [part='row'] {
        opacity: 0.55;
      }

      :host(:focus-visible) [part='row'] {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='toggle'] {
        inline-size: 22px;
        block-size: 22px;
        border-radius: var(--cv-radius-xs, 4px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        font-size: 11px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='toggle'][hidden] {
        visibility: hidden;
      }

      [part='children'] {
        display: block;
        position: relative;
        padding-inline-start: var(--cv-treeview-indent-size);
      }

      [part='children']::before {
        content: '';
        position: absolute;
        inset-block: 0;
        inset-inline-start: calc(var(--cv-treeview-indent-size) / 2);
        inline-size: var(--cv-treeview-indent-guide-width);
        border-inline-start: var(--cv-treeview-indent-guide-width) var(--cv-treeview-indent-guide-style) var(--cv-treeview-indent-guide-color);
      }

      [part='children'][hidden] {
        display: none;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private handleToggleClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    this.dispatchEvent(
      new CustomEvent<CVTreeItemToggleEvent['detail']>('cv-treeitem-toggle', {
        detail: {id: this.value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    this.style.setProperty('--cv-tree-level', String(this.level))

    return html`
      <div part="row">
        <button
          type="button"
          aria-hidden=${this.branch ? 'false' : 'true'}
          ?hidden=${!this.branch}
          part="toggle"
          @click=${this.handleToggleClick}
        >
          ${this.expanded ? '▾' : '▸'}
        </button>
        <span part="label"><slot name="label">${this.label}</slot></span>
      </div>

      <div role="group" ?hidden=${!this.expanded} part="children">
        <slot name="children"></slot>
      </div>
    `
  }
}
