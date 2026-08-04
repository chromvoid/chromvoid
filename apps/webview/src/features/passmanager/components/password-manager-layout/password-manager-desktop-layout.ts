import {css, type PropertyValues} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVWindowSplitter} from '@chromvoid/uikit/components/cv-window-splitter'

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
import {
  PM_SIDEBAR_MAX_WIDTH,
  PM_SIDEBAR_MIN_WIDTH,
  PM_SIDEBAR_WIDTH_STEP,
  passwordManagerDesktopLayoutModel,
} from './password-manager-layout.model'
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
    CVButton.define()
    CVIcon.define()
    CVWindowSplitter.define()
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

      .workspace-splitter {
        display: block;
        block-size: 100%;
        min-block-size: 0;
        min-inline-size: 0;
        --cv-window-splitter-divider-size: 12px;
      }

      .workspace-splitter::part(base) {
        block-size: 100%;
        min-block-size: 0;
      }

      .workspace-splitter::part(pane) {
        overflow: hidden;
      }

      .workspace-splitter::part(separator) {
        border: 0;
        background: transparent;
        color: var(--cv-color-border-strong);
      }

      .workspace-splitter::part(separator):hover,
      .workspace-splitter::part(separator):active {
        color: var(--cv-color-primary);
        background: var(--cv-color-primary-surface);
      }

      .splitter-handle {
        display: block;
        inline-size: 2px;
        block-size: 40px;
        border-radius: var(--cv-radius-pill);
        background: currentColor;
        opacity: 0.72;
      }

      .sidebar {
        block-size: 100%;
        padding: 4px 6px 8px 2px;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: var(--cv-space-2);
        overflow: hidden;
        min-block-size: 0;
        min-inline-size: 0;
        contain: layout style;
        position: relative;
      }

      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--cv-space-2);
        min-block-size: 36px;
        padding-inline: var(--pm-credentials-content-inset-start) var(--pm-credentials-content-inset-end);
      }

      .sidebar-title {
        min-inline-size: 0;
        overflow: hidden;
        color: var(--cv-color-text-secondary);
        font-family: var(--cv-font-family-code);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-bold);
        letter-spacing: 0.12em;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .sidebar-create-group {
        flex: 0 0 auto;
        --cv-button-min-height: 32px;
        --cv-button-padding-inline: var(--cv-space-2);
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

      .pm-content[data-pm-motion-live='true'] > * {
        animation-name: pm-desktop-surface-enter;
      }

      .pm-content::view-transition-old(root),
      .pm-content::view-transition-new(root) {
        animation-duration: var(--cv-duration-normal);
      }

      .pm-content::view-transition-old(root) {
        animation-name: pm-desktop-surface-exit;
        animation-timing-function: var(--cv-easing-accelerate);
      }

      .pm-content::view-transition-new(root) {
        animation-name: pm-desktop-surface-enter;
        animation-timing-function: var(--cv-easing-decelerate);
      }

      @keyframes pm-desktop-surface-enter {
        from {
          opacity: 0;
          transform: translateY(var(--cv-space-2)) scale(0.99);
        }
      }

      @keyframes pm-desktop-surface-exit {
        to {
          opacity: 0;
          transform: translateY(calc(-1 * var(--cv-space-1))) scale(0.995);
        }
      }

      .session-unavailable {
        align-content: start;
        block-size: 100%;
        max-inline-size: none;
        margin: 0;
        padding: clamp(var(--cv-space-8), 12vb, 112px) var(--app-surface-gutter-desktop) 0;
      }

      .session-unavailable::part(base) {
        inline-size: min(520px, 100%);
        justify-self: center;
        --cv-empty-state-border: 1px solid transparent;
        --cv-empty-state-background: transparent;
      }

      @container (width < 1180px) {
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
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('passwords', () =>
      this.model.handleTransientEntryBack(),
    )
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    this.treeScrollEdge.dispose()
    super.disconnectedCallback()
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    const treeScroller = this.shadowRoot?.querySelector('group-tree-view.scrollable') as HTMLElement | null
    this.treeScrollEdge.bindScroller(treeScroller)
  }

  private getKeyboardNavigableGroup(): PMKeyboardNavigableGroup | null {
    return this.shadowRoot?.querySelector('pm-group') as PMKeyboardNavigableGroup | null
  }

  private handleSidebarResizeInput(event: CustomEvent<{position: number}>) {
    this.model.previewSidebarWidth(event.detail.position)
  }

  private handleSidebarResizeChange(event: CustomEvent<{position: number}>) {
    this.model.commitSidebarWidth(event.detail.position)
  }

  private handleCreateGroup() {
    this.model.createTopLevelGroup()
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
    const canCreateGroup = this.model.canCreateGroup()
    const treeHasScrollBlockEnd = this.treeScrollEdge.hasBlockEndOverflow()

    return html`
      <div class="page">
        <cv-window-splitter
          class="workspace-splitter"
          orientation="vertical"
          position-unit="px"
          .position=${sidebarWidth}
          .min=${PM_SIDEBAR_MIN_WIDTH}
          .max=${PM_SIDEBAR_MAX_WIDTH}
          .step=${PM_SIDEBAR_WIDTH_STEP}
          aria-label=${i18n('credentials:sidebar:resize' as never)}
          data-sidebar-width=${String(sidebarWidth)}
          @cv-input=${this.handleSidebarResizeInput}
          @cv-change=${this.handleSidebarResizeChange}
        >
          <aside slot="primary" class="sidebar">
            <div class="sidebar-header">
              <span class="sidebar-title">${i18n('group:groups')}</span>
              <cv-button
                class="sidebar-create-group"
                type="button"
                size="small"
                variant="default"
                title=${i18n('group:create:title')}
                aria-label=${i18n('group:create:title')}
                ?disabled=${!canCreateGroup}
                @click=${this.handleCreateGroup}
              >
                <cv-icon name="folder-plus" aria-hidden="true"></cv-icon>
              </cv-button>
            </div>
            <div
              class="scroll-edge-frame sidebar-tree-scroll-frame"
              data-scroll-block-end=${String(treeHasScrollBlockEnd)}
            >
              <group-tree-view class="scrollable"></group-tree-view>
            </div>
          </aside>
          <span slot="separator" class="splitter-handle" aria-hidden="true"></span>
          <div slot="secondary" class="content scrollable">${this.renderMotionContent()}</div>
        </cv-window-splitter>
        <pm-mobile-tag-filter-sheet></pm-mobile-tag-filter-sheet>
      </div>
    `
  }
}
