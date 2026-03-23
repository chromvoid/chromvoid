import {css, html} from 'lit'
import {unsafeHTML} from 'lit/directives/unsafe-html.js'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let iconBasePath = '/assets/icons/lucide'
const iconCollections = new Map<string, string>()

function normalizeBasePath(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path
}

function normalizeCollectionName(name: string): string {
  return name.trim().toLowerCase()
}

export function setIconBasePath(path: string): void {
  iconBasePath = normalizeBasePath(path)
}

export function getIconBasePath(): string {
  return iconBasePath
}

export function registerIconCollection(name: string, path: string): void {
  iconCollections.set(normalizeCollectionName(name), normalizeBasePath(path))
}

export function unregisterIconCollection(name: string): void {
  iconCollections.delete(normalizeCollectionName(name))
}

const BOOTSTRAP_TO_LUCIDE: Record<string, string> = {
  folder: 'folder',
  'folder-fill': 'folder',
  'folder-plus': 'folder-plus',
  'folder2-open': 'folder-open',
  'folder-open': 'folder-open',
  'folder-x': 'folder-x',
  'file-earmark-text': 'file-text',
  'file-earmark': 'file',
  'file-earmark-image': 'file-image',
  'file-earmark-pdf': 'file-text',
  'file-earmark-word': 'file-text',
  'file-earmark-excel': 'file-spreadsheet',
  'file-earmark-ppt': 'file-text',
  'file-earmark-zip': 'file-archive',
  'file-earmark-music': 'file-music',
  'file-earmark-play': 'file-play',
  'file-earmark-code': 'file-code',
  file: 'file',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',
  'arrow-up': 'arrow-up',
  'arrow-down': 'arrow-down',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'arrow-clockwise': 'refresh-cw',
  'arrow-repeat': 'refresh-cw',
  'arrows-move': 'move',
  upload: 'upload',
  download: 'download',
  'cloud-upload': 'cloud-upload',
  'cloud-download': 'cloud-download',
  trash: 'trash-2',
  pencil: 'pencil',
  'pencil-square': 'square-pen',
  copy: 'copy',
  clipboard: 'clipboard',
  clipboard2: 'clipboard',
  eye: 'eye',
  search: 'search',
  x: 'x',
  'x-lg': 'x',
  'plus-lg': 'plus',
  check: 'check',
  justify: 'align-justify',
  bars: 'menu',
  menu: 'menu',
  list: 'list',
  'list-check': 'list-checks',
  grid: 'grid-2x2',
  table: 'table',
  funnel: 'funnel',
  'three-dots': 'ellipsis',
  'three-dots-vertical': 'ellipsis-vertical',
  'dots-vertical': 'ellipsis-vertical',
  'ellipsis-vertical': 'ellipsis-vertical',
  'more-vertical': 'ellipsis-vertical',
  kebab: 'ellipsis-vertical',
  ellipsis: 'ellipsis',
  more: 'ellipsis',
  'info-circle': 'info',
  'info-circle-fill': 'info',
  info: 'info',
  'check-circle-fill': 'check-circle',
  'x-circle-fill': 'x-circle',
  'exclamation-triangle': 'triangle-alert',
  'exclamation-triangle-fill': 'triangle-alert',
  'pause-circle-fill': 'pause-circle',
  house: 'home',
  'house-fill': 'home',
  home: 'home',
  key: 'key',
  lock: 'lock',
  database: 'database',
  activity: 'activity',
  settings: 'settings',
  gear: 'settings',
  tags: 'tags',
  tag: 'tag',
  star: 'star',
  clock: 'clock',
  'wifi-off': 'wifi-off',
  wifi: 'wifi',
  globe: 'globe',
  'person-circle': 'user-circle',
  user: 'user',
  'shield-lock': 'shield',
  'shield-check': 'shield-check',
  sun: 'sun',
  moon: 'moon',
  eyeglasses: 'glasses',
  'calendar-plus': 'calendar-plus',
  paperclip: 'paperclip',
  'box-arrow-up-right': 'external-link',
  'layout-three-columns': 'columns-3',
  columns: 'columns-2',
  'sort-alpha-down': 'arrow-down-a-z',
  'sort-alpha-up': 'arrow-up-a-z',
  hdd: 'hard-drive',
  'disc-fill': 'disc',
  sticky: 'sticky-note',
  'sticky-note': 'sticky-note',
  'clock-history': 'history',
  history: 'history',
}

export type CVIconSize = 'xs' | 's' | 'm' | 'md' | 'l' | 'lg'
export type CVIconColor = 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'danger'

export class CVIcon extends ReatomLitElement {
  static elementName = 'cv-icon'

  private static svgCache = new Map<string, string>()
  private static inFlight = new Map<string, Promise<string>>()

  static get properties() {
    return {
      name: {type: String},
      src: {type: String},
      size: {type: String, reflect: true},
      color: {type: String, reflect: true},
      label: {type: String},
    }
  }

  declare name: string
  declare src: string | undefined
  declare size: CVIconSize
  declare color: CVIconColor
  declare label?: string

  private svgMarkup = ''
  private hasSlottedContent = false

  constructor() {
    super()
    this.name = ''
    this.size = 'm'
    this.color = 'default'
  }

  static styles = [
    css`
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        line-height: 0;
        color: inherit;
        inline-size: var(--cv-icon-size, 1em);
        block-size: var(--cv-icon-size, 1em);
      }

      :host([size='xs']) {
        --cv-icon-size: 12px;
      }

      :host([size='s']) {
        --cv-icon-size: 16px;
      }

      :host([size='m']),
      :host([size='md']) {
        --cv-icon-size: 20px;
      }

      :host([size='l']),
      :host([size='lg']) {
        --cv-icon-size: 24px;
      }

      :host([color='muted']) {
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      :host([color='primary']) {
        color: var(--cv-color-primary, #65d7ff);
      }

      :host([color='success']) {
        color: var(--cv-color-success, #6ef7c8);
      }

      :host([color='warning']) {
        color: var(--cv-color-warning, #ffd36e);
      }

      :host([color='danger']) {
        color: var(--cv-color-danger, #ff7d86);
      }

      .icon {
        display: contents;
      }

      .icon svg,
      ::slotted(svg) {
        inline-size: 100%;
        block-size: 100%;
        display: block;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      :host([fill]) .icon svg,
      :host([fill]) ::slotted(svg) {
        fill: currentColor;
        stroke: none;
      }

      :host(:not([data-slotted])) slot {
        display: none;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  /**
   * Eagerly fetch and cache SVG for the given icon name(s) so that
   * later renders are instant (no network wait).
   */
  static prefetch(names: string | string[]): void {
    const list = Array.isArray(names) ? names : [names]
    for (const name of list) {
      const urls = CVIcon.getIconUrls(name)
      void CVIcon.fetchSvg(urls)
    }
  }

  override willUpdate(changedProperties: Map<string, unknown>): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('src') && this.src) {
      void this.loadSvg(this.src)
      return
    }

    if (changedProperties.has('name') && this.name && !this.src) {
      void this.loadSvg(CVIcon.getIconUrls(this.name))
    }
  }

  private static resolveIconName(name: string): string {
    return BOOTSTRAP_TO_LUCIDE[name] ?? name
  }

  private static getCollectionBasePath(name: string): string | null {
    const normalizedName = normalizeCollectionName(name)
    if (normalizedName === 'lucide') {
      return iconBasePath
    }

    return iconCollections.get(normalizedName) ?? null
  }

  private static getIconUrls(name: string): string[] {
    const separatorIndex = name.indexOf(':')
    if (separatorIndex <= 0 || separatorIndex === name.length - 1) {
      return [`${iconBasePath}/${CVIcon.resolveIconName(name)}.svg`]
    }

    const collectionName = name.slice(0, separatorIndex)
    const iconName = name.slice(separatorIndex + 1)
    const collectionBasePath = CVIcon.getCollectionBasePath(collectionName)
    const urls: string[] = []

    if (collectionBasePath) {
      urls.push(`${collectionBasePath}/${iconName}.svg`)
    }

    const fallbackUrl = `${iconBasePath}/${CVIcon.resolveIconName(iconName)}.svg`
    if (!urls.includes(fallbackUrl)) {
      urls.push(fallbackUrl)
    }

    return urls
  }

  private async loadSvg(urls: string | string[]): Promise<void> {
    this.svgMarkup = await CVIcon.fetchSvg(urls)
    this.requestUpdate()
  }

  private static async fetchSvg(urls: string | string[]): Promise<string> {
    const candidates = Array.isArray(urls) ? urls : [urls]
    for (const url of candidates) {
      const svg = await CVIcon.fetchSingleSvg(url)
      if (svg) {
        return svg
      }
    }

    return ''
  }

  private static async fetchSingleSvg(url: string): Promise<string> {
    const cached = CVIcon.svgCache.get(url)
    if (cached) return cached

    const inFlight = CVIcon.inFlight.get(url)
    if (inFlight) return inFlight

    const promise = (async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          CVIcon.inFlight.delete(url)
          return ''
        }
        const svg = await response.text()
        CVIcon.svgCache.set(url, svg)
        CVIcon.inFlight.delete(url)
        return svg
      } catch {
        CVIcon.inFlight.delete(url)
        return ''
      }
    })()

    CVIcon.inFlight.set(url, promise)
    return promise
  }

  private handleSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    const nodes = slot.assignedNodes({flatten: true})
    this.hasSlottedContent = nodes.some(
      (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'SVG',
    )

    if (this.hasSlottedContent) {
      this.setAttribute('data-slotted', '')
      return
    }

    this.removeAttribute('data-slotted')
  }

  protected override render() {
    const ariaHidden = this.label ? 'false' : 'true'
    const ariaLabel = this.label ?? ''

    if (this.svgMarkup && !this.hasSlottedContent) {
      return html`
        <span class="icon" role="img" aria-hidden=${ariaHidden} aria-label=${ariaLabel}>
          ${unsafeHTML(this.svgMarkup)}
        </span>
      `
    }

    return html`
      <span class="icon" role="img" aria-hidden=${ariaHidden} aria-label=${ariaLabel}>
        <slot @slotchange=${this.handleSlotChange}></slot>
        ${this.svgMarkup ? unsafeHTML(this.svgMarkup) : ''}
      </span>
    `
  }
}

export type LucideIconName = string
export type IconName = LucideIconName
