import {css, html, type PropertyValues} from 'lit'

import {i18n} from '@project/passmanager'
import {hostContainStyles, pageFadeInStyles, pageTransitionStyles} from 'root/shared/ui/shared-styles'
import {pmSharedStyles} from '../../styles/shared'
import {PMLayoutBase, type SearchElement} from './password-manager-layout-base'
import {passwordManagerLayoutStyles} from './password-manager-layout.styles'
import type {PMSearch} from '../list/search'

type PMKeyboardNavigableGroup = HTMLElement & {
  moveKeyboardFocus(step: number): boolean
  openActiveItem(): boolean
}

type BackButtonElement = HTMLElement & {
  handleClick?: () => void
}

export class PasswordManagerDesktopLayout extends PMLayoutBase {
  static elementName = 'password-manager-desktop-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    ...pmSharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostContainStyles,
    passwordManagerLayoutStyles,
    css`
      :host {
        padding: var(--cv-space-4);
        border: 1px solid var(--cv-color-border);
      }

      .wrapper {
        display: grid;
        grid-template-columns: var(--sidebar-width, max(33cqw, 250px)) 12px 1fr;
        block-size: 100%;
        min-block-size: 0;
        position: relative;
      }

      .head-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--cv-space-2);
        align-items: start;
      }

      .new-entry-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        inline-size: 28px;
        block-size: 28px;
        border-radius: var(--cv-radius-2);
        border: 1px solid color-mix(in oklch, var(--cv-color-primary) 40%, var(--cv-color-border));
        background: color-mix(in oklch, var(--cv-color-primary) 15%, var(--cv-color-surface-2));
        color: var(--cv-color-primary);
        cursor: pointer;
        flex-shrink: 0;
        margin-block-start: 1px;

        cv-icon {
          inline-size: 14px;
          block-size: 14px;
        }

        &:hover {
          background: var(--cv-color-primary);
          color: white;
          border-color: var(--cv-color-primary);
          transform: scale(1.05);
          box-shadow: 0 2px 8px color-mix(in oklch, var(--cv-color-primary) 30%, transparent);
        }

        &:active {
          transform: scale(0.95);
        }

        &:disabled {
          opacity: 0.4;
          pointer-events: none;
        }
      }

      .sidebar {
        padding: var(--cv-space-2) var(--cv-space-4);
        border-right: 1px solid var(--cv-color-border);
        background: transparent;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: var(--cv-space-2);
        overflow: hidden;
        min-block-size: 0;
        contain: layout style;
        position: relative;
      }

      .head {
        z-index: 1;
        flex-shrink: 0;
        padding-block-end: var(--cv-space-2);
        border-bottom: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
        margin-block-end: 0;
        position: relative;
      }

      .resizer {
        inline-size: 12px;
        background: transparent;
        cursor: col-resize;
        position: relative;
        user-select: none;
        touch-action: none;
        contain: layout style;
        display: flex;
        align-items: center;
        justify-content: center;

        &::before {
          content: '';
          position: absolute;
          inset-block-start: 50%;
          inset-inline-start: 50%;
          transform: translate(-50%, -50%);
          inline-size: 4px;
          block-size: 40px;
          background: var(--cv-color-border);
          opacity: 0.25;
          border-radius: 2px;
          transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
        }

        &:hover::before {
          opacity: 0.6;
          block-size: 60px;
          background: var(--cv-color-primary);
        }
      }

      .resizer.dragging::before {
        opacity: 1;
        block-size: 80px;
        background: var(--cv-color-primary);
        box-shadow: 0 0 12px color-mix(in oklch, var(--cv-color-primary) 40%, transparent);
      }

      .resizer:hover {
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in oklch, var(--cv-color-primary) 6%, transparent) 50%,
          transparent 100%
        );
      }

      .resizer.dragging {
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in oklch, var(--cv-color-primary) 12%, transparent) 50%,
          transparent 100%
        );
      }

      .content {
        block-size: 100%;
      }

      .content .card {
        padding: var(--cv-space-6);
      }

      .content pm-group.card {
        overflow: hidden;
      }

      .content back-button {
        position: absolute;
        inset-block-start: var(--cv-space-4);
        inset-inline-end: 0;
        z-index: 1;
      }

      .actions {
        display: flex;
        gap: var(--cv-space-2);
        align-items: center;
      }

      .more-menu::part(label),
      .more-menu::part(dropdown-icon) {
        display: none;
      }

      .more-menu-item-danger::part(base) {
        color: var(--cv-color-danger);
      }

      .more-menu-item-danger cv-icon {
        color: var(--cv-color-danger);
      }
    `,
  ]

  protected getSearchElement(): SearchElement | null {
    return this.shadowRoot?.querySelector('pm-search') as PMSearch | null
  }

  protected handleExtraKeys(event: KeyboardEvent, shortcutBlocked: boolean): boolean {
    if (shortcutBlocked) {
      return false
    }

    const group = this.getKeyboardNavigableGroup()
    if (!group) {
      return false
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      group.moveKeyboardFocus(event.key === 'ArrowDown' ? 1 : -1)
      return true
    }

    if (event.key === 'Enter') {
      const handled = group.openActiveItem()
      if (!handled) {
        return false
      }

      event.preventDefault()
      return true
    }

    return false
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.model.initializeSidebarWidth()
    this.applySidebarWidth()
  }

  override disconnectedCallback(): void {
    this.stopResizerTracking()
    super.disconnectedCallback()
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.applySidebarWidth()
  }

  override handleEvent(event: Event): void {
    switch (event.type) {
      case 'pointermove':
        this.onPointerMove(event as PointerEvent)
        return
      case 'pointerup':
        this.onPointerUp()
        return
      default:
        super.handleEvent(event)
        return
    }
  }

  private getKeyboardNavigableGroup(): PMKeyboardNavigableGroup | null {
    return this.shadowRoot?.querySelector('pm-group') as PMKeyboardNavigableGroup | null
  }

  private applySidebarWidth() {
    this.style.setProperty('--sidebar-width', this.model.sidebarWidthCss())
  }

  private stopResizerTracking() {
    document.removeEventListener('pointermove', this)
    document.removeEventListener('pointerup', this)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  private onResizerPointerDown(event: PointerEvent) {
    event.preventDefault()
    this.model.beginSidebarResize(event.clientX)
    document.addEventListener('pointermove', this)
    document.addEventListener('pointerup', this)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  private onPointerMove(event: PointerEvent) {
    this.model.updateSidebarResize(event.clientX)
  }

  private onPointerUp() {
    this.model.endSidebarResize()
    this.stopResizerTracking()
  }

  override render() {
    const sidebarWidth = this.model.sidebarWidth()
    const isDragging = this.model.isSidebarDragging()

    return html`
      <div class="wrapper" data-sidebar-width=${String(sidebarWidth)}>
        <div class="sidebar">
          <div class="head">
            <div class="head-row">
              <pm-search></pm-search>
              <cv-tooltip arrow show-delay="150" hide-delay="0">
                <button
                  slot="trigger"
                  class="new-entry-btn"
                  @click=${this.onCreateEntry}
                  ?disabled=${this.model.isReadOnly()}
                  aria-label=${i18n('enrty:create')}
                >
                  <cv-icon name="plus-lg"></cv-icon>
                </button>
                <span slot="content">${i18n('enrty:create')} (Ctrl+N)</span>
              </cv-tooltip>
            </div>
          </div>
          <group-tree-view class="scrollable"></group-tree-view>
          <div class="actions">
            <cv-menu-button class="more-menu" size="small" aria-label=${i18n('button:more_actions')}>
              <cv-icon name="ellipsis" slot="prefix"></cv-icon>
              <cv-menu-item slot="menu" value="pm-export" @click=${this.onExportClick}>
                <cv-icon name="cloud-download" slot="prefix"></cv-icon>
                ${i18n('export')}
              </cv-menu-item>
              <cv-menu-item slot="menu" value="pm-import" @click=${this.onImportClick}>
                <cv-icon name="cloud-upload" slot="prefix"></cv-icon>
                ${i18n('import')}
              </cv-menu-item>
              <cv-menu-item
                class="more-menu-item-danger"
                slot="menu"
                value="pm-clean"
                @click=${this.onFullCleanClick}
              >
                <cv-icon name="trash" slot="prefix"></cv-icon>
                ${i18n('clean')}
              </cv-menu-item>
            </cv-menu-button>

            <slot name="buttons"></slot>
          </div>
        </div>
        <div class="resizer ${isDragging ? 'dragging' : ''}" @pointerdown=${this.onResizerPointerDown}></div>
        <div class="content scrollable animate-fade-in">${this.renderMain()}</div>
      </div>
    `
  }
}
