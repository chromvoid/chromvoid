import {css, type PropertyValues} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {hostContainStyles} from 'root/shared/ui/shared-styles'
import {ScrollEdgeAffordanceModel} from 'root/shared/ui/scroll-edge-affordance.model'
import {scrollEdgeAffordanceStyles} from 'root/shared/ui/scroll-edge-affordance.styles'
import {pmSharedStyles} from '../../styles/shared'
import {PMMobileTagFilterSheet} from '../list/mobile-tag-filter-sheet'
import {PMOtpQuickView} from '../otp-quick-view'
import {PMSshKeysView} from '../ssh-keys-view'
import {PMLayoutBase, type SearchElement} from './password-manager-layout-base'
import {passwordManagerDesktopLayoutModel} from './password-manager-layout.model'
import {passwordManagerLayoutStyles} from './password-manager-layout.styles'

type PMKeyboardNavigableGroup = HTMLElement & {
  moveKeyboardFocus(step: number): boolean
  openActiveItem(): boolean
}

export class PasswordManagerDesktopLayout extends PMLayoutBase {
  static elementName = 'password-manager-desktop-layout'

  private unregisterBackHandler?: () => void
  private readonly treeScrollEdge = new ScrollEdgeAffordanceModel()

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    PMOtpQuickView.define()
    PMSshKeysView.define()
    PMMobileTagFilterSheet.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    scrollEdgeAffordanceStyles,
    passwordManagerLayoutStyles,
    css`
      :host {
        padding: var(--app-surface-gutter-desktop);
        background: transparent;
        --_pm-layout-sidebar-inline-size: clamp(248px, 28cqw, 312px);
        --pm-credentials-content-inset-start: 8px;
        --pm-credentials-content-inset-end: 10px;
      }

      .page {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        gap: 8px;
        block-size: 100%;
        min-block-size: 0;
      }

      .wrapper {
        display: grid;
        grid-template-columns: var(--_pm-layout-sidebar-inline-size) 14px minmax(0, 1fr);
        block-size: 100%;
        min-block-size: 0;
        min-inline-size: 0;
        position: relative;
        align-items: stretch;
      }

      .sidebar {
        padding: 6px 6px 8px 2px;
        display: grid;
        grid-template-rows: 1fr;
        gap: 10px;
        overflow: hidden;
        min-block-size: 0;
        min-inline-size: 0;
        contain: layout style;
        position: relative;
      }

      .sidebar-tree-scroll-frame {
        block-size: 100%;
        min-block-size: 0;
        --app-scroll-edge-block-size: var(--app-scroll-edge-default-block-size);
        --app-scroll-edge-inline-start: var(--pm-credentials-content-inset-start);
        --app-scroll-edge-inline-end: var(--pm-credentials-content-inset-end);
        --app-scroll-edge-surface: var(--app-scroll-edge-default-surface);
      }

      .sidebar-tree-scroll-frame > group-tree-view.scrollable {
        display: block;
        block-size: 100%;
      }

      .resizer {
        inline-size: 14px;
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
          block-size: 72px;
          background: var(--cv-color-border-strong);
          opacity: 0.45;
          border-radius: 2px;
          transition:
            opacity var(--cv-duration-fast) var(--cv-easing-standard),
            background-color var(--cv-duration-fast) var(--cv-easing-standard),
            block-size var(--cv-duration-fast) var(--cv-easing-standard);
        }

        &:hover::before {
          opacity: 0.8;
          block-size: 108px;
          background: var(--cv-color-primary);
        }
      }

      .resizer.dragging::before {
        opacity: 1;
        block-size: 136px;
        background: var(--cv-color-primary);
        box-shadow: 0 0 12px var(--cv-color-primary-ring);
      }

      .resizer:hover {
        background: var(--cv-gradient-divider-subtle);
      }

      .resizer.dragging {
        background: var(--cv-gradient-surface-primary);
      }

      .content {
        block-size: 100%;
        min-block-size: 0;
        min-inline-size: 0;
        padding: 4px 2px 0 0;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      .content .card {
        padding: 0;
        block-size: 100%;
        min-block-size: 0;
      }

      .content pm-otp-quick-view.card {
        padding: var(--app-surface-gutter-desktop);
      }

      .content pm-group.card {
        overflow: hidden;
        min-block-size: 0;
      }

      @container (width < 1180px) {
        :host {
          --_pm-layout-sidebar-inline-size: clamp(232px, 30cqw, 288px);
        }

        .wrapper {
          grid-template-columns: var(--_pm-layout-sidebar-inline-size) 12px minmax(0, 1fr);
        }

        .sidebar {
          padding-inline-end: 4px;
        }

        .content {
          padding: 8px;
          border-radius: 24px;
        }
      }
    `,
  ]

  constructor() {
    super(passwordManagerDesktopLayoutModel)
  }

  protected getSearchElement(): SearchElement | null {
    return this.model.getDesktopToolbarSearchElement()
  }

  private renderEntry(entry: Entry, editing: boolean) {
    return html`<pm-entry
      class="card"
      .entry=${entry}
      .editing=${editing}
      .showHeaderActions=${true}
    ></pm-entry>`
  }

  private renderGroup() {
    return keyed(
      this.model.getGroupViewKey(),
      html`<pm-group class="card" .showToolbarActions=${true}></pm-group>`,
    )
  }

  private renderCreateEntry() {
    return html`<pm-entry-create-desktop class="card" hide-back></pm-entry-create-desktop>`
  }

  private renderCreateGroup() {
    return html`<pm-group-create-desktop class="card" hide-back></pm-group-create-desktop>`
  }

  private renderLoading() {
    return html`<div class="spinner-wrapper">
      <cv-spinner class="spinner" label=${i18n('loading')}></cv-spinner>
    </div>`
  }

  private renderOtpQuickView() {
    return html`<pm-otp-quick-view class="card"></pm-otp-quick-view>`
  }

  private renderSshKeysView() {
    return html`<pm-ssh-keys-view class="card"></pm-ssh-keys-view>`
  }

  private renderEnvRuntimeView() {
    return html`<pm-env-runtime-page class="card"></pm-env-runtime-page>`
  }

  private renderMotionContent() {
    return html`<div class="pm-content">${this.renderMain()}</div>`
  }

  private renderDedicatedViewPage() {
    return html`
      <div class="page">
        <div class="content scrollable">${this.renderMotionContent()}</div>
        <pm-mobile-tag-filter-sheet></pm-mobile-tag-filter-sheet>
      </div>
    `
  }

  private renderMain() {
    const showElement = this.model.getCurrentShowElement()
    const sessionStatus = this.model.getSessionStatus()

    if (sessionStatus === 'loading') return this.renderSessionUnavailable(true)
    if (sessionStatus === 'inactive' || sessionStatus === 'error') return this.renderSessionUnavailable()

    if (this.model.requiresExtendedComponents(this.extendedComponentLayout)) {
      return this.model.getExtendedComponentsLoadError()
        ? this.renderExtendedComponentsUnavailable()
        : this.renderLoading()
    }

    if (showElement === 'createEntry') {
      return this.renderCreateEntry()
    }

    if (showElement === 'createGroup') {
      return this.renderCreateGroup()
    }

    if (showElement instanceof Entry) {
      return this.renderEntry(showElement, this.model.isEditingEntry())
    }

    if (showElement === 'importDialog') {
      return this.renderImportDialog()
    }

    if (showElement === 'otpView') {
      return this.renderOtpQuickView()
    }

    if (showElement === 'sshView') {
      return this.renderSshKeysView()
    }

    if (showElement === 'envRuntimeView') {
      return this.renderEnvRuntimeView()
    }

    return this.renderGroup()
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
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('passwords', () =>
      this.model.handleTransientEntryBack())
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    this.stopResizerTracking()
    this.treeScrollEdge.dispose()
    super.disconnectedCallback()
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.applySidebarWidth()
    const treeScroller = this.shadowRoot?.querySelector('group-tree-view.scrollable') as HTMLElement | null
    this.treeScrollEdge.bindScroller(treeScroller)
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
    this.style.setProperty('--_pm-layout-sidebar-inline-size', this.model.sidebarWidthCss())
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
    if (
      this.model.getCurrentShowElement() === 'otpView' ||
      this.model.getCurrentShowElement() === 'sshView' ||
      this.model.getCurrentShowElement() === 'envRuntimeView'
    ) {
      return this.renderDedicatedViewPage()
    }

    const sidebarWidth = this.model.sidebarWidth()
    const isDragging = this.model.isSidebarDragging()
    const treeHasScrollBlockEnd = this.treeScrollEdge.hasBlockEndOverflow()

    return html`
      <div class="page">
        <div class="wrapper" data-sidebar-width=${String(sidebarWidth)}>
          <div class="sidebar">
            <div
              class="scroll-edge-frame sidebar-tree-scroll-frame"
              data-scroll-block-end=${String(treeHasScrollBlockEnd)}
            >
              <group-tree-view class="scrollable"></group-tree-view>
            </div>
          </div>
          <div class="resizer ${isDragging ? 'dragging' : ''}" @pointerdown=${this.onResizerPointerDown}></div>
          <div class="content scrollable">
            ${this.renderMotionContent()}
          </div>
        </div>
        <pm-mobile-tag-filter-sheet></pm-mobile-tag-filter-sheet>
      </div>
    `
  }
}
