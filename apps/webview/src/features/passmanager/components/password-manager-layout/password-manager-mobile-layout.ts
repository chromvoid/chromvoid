import {css, html, nothing} from 'lit'

import {Entry, i18n} from '@project/passmanager'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {hostContainStyles, pageFadeInStyles, pageTransitionStyles} from 'root/shared/ui/shared-styles'
import {pmSharedStyles} from '../../styles/shared'
import {PMLayoutBase} from './password-manager-layout-base'
import {type PMMobileCommandContext, type PMMobileToolbarContext} from './password-manager-layout.model'
import {passwordManagerLayoutStyles} from './password-manager-layout.styles'

export type PMMobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
}

type PMEntryActionsElement = HTMLElement & {
  triggerEditAction?: () => void
  triggerMoveAction?: () => void
  triggerDeleteAction?: () => void
}

type PMGroupEditElement = HTMLElement & {
  editEnd?: () => void
}

type PMGroupActionsElement = HTMLElement & {
  triggerEditAction?: () => void
  triggerDeleteAction?: () => void
}

export class PasswordManagerMobileLayout extends PMLayoutBase {
  static elementName = 'password-manager-mobile-layout'

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
      .wrapper {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
      }

      .content {
        flex: 1;
        min-block-size: 0;
        overflow: auto;
      }

      .content .card {
        padding: var(--cv-space-3);
      }

      .content pm-group-mobile.card {
        overflow: hidden;
      }

      slot[name='buttons'] {
        display: none;
      }

      @container (width < 420px) {
        .content .card {
          padding: var(--cv-space-2);
        }
      }
    `,
  ]

  private unregisterBackHandler?: () => void

  protected getSearchElement(): null {
    return null
  }

  protected override renderEntry(entry: Entry, editing: boolean) {
    return html`<pm-entry-mobile class="card" .entry=${entry} .editing=${editing}></pm-entry-mobile>`
  }

  protected override renderGroup() {
    return html`<pm-group-mobile class="card"></pm-group-mobile>`
  }

  protected override renderCreateEntry() {
    return html`<pm-entry-create-mobile class="card" hide-back></pm-entry-create-mobile>`
  }

  protected override shouldHideCreateBackButton(): boolean {
    return true
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('passwords', () =>
      this.handleMobileToolbarBack(),
    )
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    super.disconnectedCallback()
  }

  getMobileToolbarContext(): PMMobileToolbarContext {
    return this.model.getMobileToolbarContext(this.isGroupEditActive())
  }

  handleMobileToolbarBack(): boolean {
    return this.model.handleMobileToolbarBack({
      isGroupEditActive: this.isGroupEditActive(),
      onExitGroupEdit: () => this.getGroupEditElement()?.editEnd?.(),
    })
  }

  getMobileCommandContext(): PMMobileCommandContext {
    return this.model.getMobileCommandContext(this.isGroupEditActive())
  }

  getMobileToolbarActions(): PMMobileToolbarAction[] {
    const ctx = this.getMobileCommandContext()
    const isReadOnly = ctx.readOnly

    if (ctx.kind === 'passwords-list') {
      const actions: PMMobileToolbarAction[] = [
        {id: 'pm-filters', icon: 'sliders', label: i18n('button:filters_sorting')},
        {id: 'pm-create-group', icon: 'folder-plus', label: i18n('group:create:title'), disabled: isReadOnly},
        {id: 'pm-create-entry', icon: 'plus-lg', label: i18n('button:create_entry'), disabled: isReadOnly},
      ]
      if (this.model.isInNonRootGroup()) {
        actions.push(
          {id: 'pm-edit-group', icon: 'pencil-square', label: i18n('button:edit'), disabled: isReadOnly},
          {id: 'pm-delete-group', icon: 'trash', label: i18n('button:remove'), disabled: isReadOnly},
        )
      }
      return actions
    }

    if (ctx.kind === 'passwords-entry') {
      return [
        {id: 'pm-entry-edit', icon: 'pencil-square', label: i18n('entry:edit:title'), disabled: isReadOnly},
        {id: 'pm-entry-move', icon: 'folder-symlink', label: i18n('button:move_entry'), disabled: isReadOnly},
        {id: 'pm-entry-delete', icon: 'trash', label: i18n('button:delete_entry'), disabled: isReadOnly},
      ]
    }

    return []
  }

  executeMobileCommand(actionId: string, payload?: {query?: string}): boolean {
    return this.model.executeMobileCommand(actionId, payload, {
      isGroupEditActive: this.isGroupEditActive(),
      onEntryEdit: () => this.onEntryFabEdit(),
      onEntryMove: () => this.onEntryFabMove(),
      onEntryDelete: () => this.onEntryFabDelete(),
      onGroupEdit: () => this.onGroupEdit(),
      onGroupDelete: () => this.onGroupDelete(),
    })
  }

  private isGroupEditActive(): boolean {
    const group = this.shadowRoot?.querySelector('pm-group-mobile') as HTMLElement | null
    return Boolean(group?.shadowRoot?.querySelector('pm-group-edit'))
  }

  private getGroupEditElement(): PMGroupEditElement | null {
    const group = this.shadowRoot?.querySelector('pm-group-mobile') as HTMLElement | null
    return group?.shadowRoot?.querySelector('pm-group-edit') as PMGroupEditElement | null
  }

  private getEntryElement(): PMEntryActionsElement | null {
    return this.shadowRoot?.querySelector('pm-entry-mobile') as PMEntryActionsElement | null
  }

  private onOpenFiltersFab() {
    this.model.openFiltersPalette()
  }

  private getGroupElement(): PMGroupActionsElement | null {
    return this.shadowRoot?.querySelector('pm-group-mobile') as PMGroupActionsElement | null
  }

  private onGroupEdit() {
    this.getGroupElement()?.triggerEditAction?.()
  }

  private onGroupDelete() {
    this.getGroupElement()?.triggerDeleteAction?.()
  }

  private onEntryFabEdit() {
    this.getEntryElement()?.triggerEditAction?.()
  }

  private onEntryFabMove() {
    this.getEntryElement()?.triggerMoveAction?.()
  }

  private onEntryFabDelete() {
    this.getEntryElement()?.triggerDeleteAction?.()
  }

  private renderMoreMenu() {
    return html`
      <cv-menu-button
        class="tb-btn tb-btn-more"
        data-action="pm-more"
        size="small"
        aria-label=${i18n('button:more_actions')}
      >
        <cv-icon name="ellipsis" slot="prefix"></cv-icon>
        <cv-menu-item slot="menu" data-action="pm-export" value="pm-export" @click=${this.onExportClick}>
          <cv-icon name="cloud-download" slot="prefix"></cv-icon>
          ${i18n('export')}
        </cv-menu-item>
        <cv-menu-item slot="menu" data-action="pm-import" value="pm-import" @click=${this.onImportClick}>
          <cv-icon name="cloud-upload" slot="prefix"></cv-icon>
          ${i18n('import')}
        </cv-menu-item>
        <cv-menu-item
          class="more-menu-item-danger"
          slot="menu"
          data-action="pm-clean"
          value="pm-clean"
          @click=${this.onFullCleanClick}
        >
          <cv-icon name="trash" slot="prefix"></cv-icon>
          ${i18n('clean')}
        </cv-menu-item>
      </cv-menu-button>
    `
  }

  private renderListActions(isReadOnly: boolean) {
    const hasActiveFilters = this.model.hasActiveFilters()

    return html`
      ${this.renderMoreMenu()}

      <cv-button
        class="tb-btn ${hasActiveFilters ? 'has-badge' : ''}"
        data-action="pm-filters"
        variant="default"
        size="small"
        @click=${this.onOpenFiltersFab}
        aria-label=${i18n('button:filters_sorting')}
      >
        <cv-icon name="sliders"></cv-icon>
      </cv-button>

      <cv-button
        class="tb-btn"
        data-action="pm-create-group"
        size="small"
        @click=${this.onCreateGroup}
        ?disabled=${isReadOnly}
        aria-label=${i18n('group:create:title')}
      >
        <cv-icon name="folder-plus"></cv-icon>
      </cv-button>

      <cv-button
        class="tb-btn"
        data-action="pm-create-entry"
        size="small"
        @click=${this.onCreateEntry}
        ?disabled=${isReadOnly}
        aria-label=${i18n('button:create_entry')}
      >
        <cv-icon name="plus-lg"></cv-icon>
      </cv-button>
    `
  }

  private renderEntryActions(isReadOnly: boolean) {
    return html`
      ${this.renderMoreMenu()}

      <cv-button
        class="tb-btn"
        data-action="pm-entry-edit"
        variant="primary"
        size="small"
        @click=${this.onEntryFabEdit}
        ?disabled=${isReadOnly}
        aria-label=${i18n('entry:edit:title')}
      >
        <cv-icon name="pencil-square"></cv-icon>
      </cv-button>

      <cv-button
        class="tb-btn"
        data-action="pm-entry-move"
        variant="primary"
        size="small"
        @click=${this.onEntryFabMove}
        ?disabled=${isReadOnly}
        aria-label=${i18n('button:move_entry')}
      >
        <cv-icon name="folder-symlink"></cv-icon>
      </cv-button>

      <cv-button
        class="tb-btn tb-btn-danger"
        data-action="pm-entry-delete"
        variant="default"
        size="small"
        @click=${this.onEntryFabDelete}
        ?disabled=${isReadOnly}
        aria-label=${i18n('button:delete_entry')}
      >
        <cv-icon name="trash"></cv-icon>
      </cv-button>
    `
  }

  override render() {
    return html`
      <div class="wrapper">
        <div class="content scrollable animate-fade-in">${this.renderMain()}</div>
        <slot name="buttons"></slot>
      </div>
    `
  }
}
