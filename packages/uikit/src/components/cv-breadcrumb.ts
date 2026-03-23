import {createBreadcrumb, type BreadcrumbModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVBreadcrumbItem} from './cv-breadcrumb-item'

interface BreadcrumbItemRecord {
  id: string
  label: string
  href: string
  current: boolean
  element: CVBreadcrumbItem
}

let cvBreadcrumbNonce = 0

export class CVBreadcrumb extends ReatomLitElement {
  static elementName = 'cv-breadcrumb'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
    }
  }

  declare value: string
  declare ariaLabel: string
  declare ariaLabelledBy: string

  private readonly idBase = `cv-breadcrumb-${++cvBreadcrumbNonce}`
  private itemRecords: BreadcrumbItemRecord[] = []
  private model: BreadcrumbModel

  constructor() {
    super()
    this.value = ''
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.model = createBreadcrumb({
      idBase: this.idBase,
      items: [],
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: block;
      }

      [part='list'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        margin: 0;
        padding: 0;
        list-style: none;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.rebuildModelFromSlot(false, false, this.value.trim() || null)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('ariaLabel') || changedProperties.has('ariaLabelledBy')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value')) {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      this.rebuildModelFromSlot(true, false, normalized || null)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('value')) {
      this.syncItemElements()
    }
  }

  get items(): string[] {
    return this.itemRecords.map((item) => item.id)
  }

  private getItemElements(): CVBreadcrumbItem[] {
    return Array.from(this.children).filter(
      (element): element is CVBreadcrumbItem => element.tagName.toLowerCase() === CVBreadcrumbItem.elementName,
    )
  }

  private ensureItemValue(item: CVBreadcrumbItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `item-${index + 1}`
    item.value = fallback
    return fallback
  }

  private ensureItemHref(item: CVBreadcrumbItem): string {
    const normalized = item.href?.trim()
    if (normalized) return normalized

    item.href = '#'
    return '#'
  }

  private rebuildModelFromSlot(
    preserveCurrent: boolean,
    requestRender = true,
    forcedCurrentId: string | null = null,
  ): void {
    const itemElements = this.getItemElements()
    const previousCurrentId = preserveCurrent ? this.model.state.currentId() : null

    this.itemRecords = itemElements.map((element, index) => ({
      id: this.ensureItemValue(element, index),
      label: element.textContent?.trim() || element.value || `item-${index + 1}`,
      href: this.ensureItemHref(element),
      current: element.current,
      element,
    }))

    const preferredCurrentId = forcedCurrentId ?? previousCurrentId

    this.model = createBreadcrumb({
      idBase: this.idBase,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      items: this.itemRecords.map((record) => ({
        id: record.id,
        label: record.label,
        href: record.href,
        isCurrent: preferredCurrentId ? record.id === preferredCurrentId : record.current,
      })),
    })

    this.syncItemElements()
    this.value = this.model.state.currentId() ?? ''

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private syncItemElements(): void {
    for (const [index, record] of this.itemRecords.entries()) {
      const itemProps = this.model.contracts.getItemProps(record.id)
      const linkProps = this.model.contracts.getLinkProps(record.id)
      const separatorProps = this.model.contracts.getSeparatorProps(record.id)

      record.element.id = itemProps.id
      record.element.linkId = linkProps.id
      record.element.href = linkProps.href
      record.element.current = linkProps['aria-current'] === 'page'
      record.element.showSeparator = index < this.itemRecords.length - 1 && separatorProps['aria-hidden'] === 'true'
      record.element.setAttribute('data-current', itemProps['data-current'])
    }
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()
    const listProps = this.model.contracts.getListProps()

    return html`
      <nav
        role=${rootProps.role}
        aria-label=${rootProps['aria-label'] ?? nothing}
        aria-labelledby=${rootProps['aria-labelledby'] ?? nothing}
        part="base"
      >
        <ol role=${listProps.role ?? nothing} part="list">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </ol>
      </nav>
    `
  }
}
