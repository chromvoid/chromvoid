import {html, nothing} from 'lit'

import {Entry, Group, i18n} from '@project/passmanager'
import type {ManagerRoot} from '@project/passmanager'
import {emptyStateCSS, folderItemCSS, listItemsCSS, pmSharedStyles} from '../../../styles/shared'
import {hostContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {listGroupStyles} from '../../list/list-item-styles'
import {PMGroupBase} from './group-base'
import {pmGroupCommonStyles, pmGroupMobileStyles} from './styles'

export class PMGroupMobile extends PMGroupBase {
  static define() {
    if (!customElements.get('pm-group-mobile')) {
      customElements.define('pm-group-mobile', this)
    }
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    motionPrimitiveStyles,
    listItemsCSS,
    listGroupStyles,
    folderItemCSS,
    emptyStateCSS,
    pmGroupCommonStyles,
    pmGroupMobileStyles,
  ]

  protected override renderEntryItem(item: Entry, active: boolean) {
    return html`
      <div
        class="entry-row ${active ? 'active' : ''}"
        data-row-id=${item.id}
        @click=${() => this.setActiveItemById(item.id)}
      >
        <pm-entry-list-item-mobile .entry=${item} group></pm-entry-list-item-mobile>
      </div>
    `
  }

  protected override renderFolderItem(item: Group, active: boolean) {
    const count = String(item.entries().length).padStart(2, '0')

    return html`
      <div class="group-row-wrap" data-row-id=${item.id}>
        <div
          class="group-row ${active ? 'active' : ''}"
          data-drop-target-id=${item.id}
          role="button"
          tabindex="-1"
          @click=${() => {
            this.setActiveItemById(item.id)
            this.model.selectByID(item.id)
          }}
        >
          <div class="group-icon-wrap">
            <pm-avatar-icon class="folder-custom-icon" .item=${item} icon="folder"></pm-avatar-icon>
          </div>
          <div class="group-name">${this.getGroupDisplayName(item)}</div>
          <div class="group-trail">
            <span class="group-entry-count">${count}</span>
            <cv-icon class="group-chevron" name="chevron-right"></cv-icon>
          </div>
        </div>
      </div>
    `
  }

  private getEntryCount(group: Group, isRoot: boolean): number {
    if (isRoot) {
      const root = group as unknown as ManagerRoot
      return root.entriesList().filter((item) => item instanceof Entry).length
    }
    return group.entries().length
  }

  private renderCompactHeader(group: Group, isRoot: boolean) {
    const title = isRoot
      ? (group as unknown as ManagerRoot).name || i18n('no_title')
      : this.getGroupMetadata(group).title
    const entryCount = this.getEntryCount(group, isRoot)
    const time = !isRoot
      ? html`<span class="header-updated">${(group as Group).updatedFormatted}</span>`
      : nothing

    return html`
      <header class="compact-header">
        ${isRoot
          ? html`<cv-icon class="compact-header-root-icon" name="grid"></cv-icon>`
          : html`<pm-avatar-icon class="compact-header-icon" .item=${group} icon="folder"></pm-avatar-icon>`}
        <div class="header-info">
          <span class="group-title">${title}</span>
        </div>
        <div>
          <span class="header-entry-pill">${entryCount} ENTRIES</span>
        </div>
      </header>
    `
  }

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    if (this.model.isEditMode()) {
      return html`<pm-group-edit @editEnd=${this.handleEditEnd}></pm-group-edit>`
    }

    const isRoot = this.isManagerRoot(group)

    return html`
      <div class="wrapper">
        ${this.renderCompactHeader(group as Group, isRoot)} ${this.renderGroupsList(group)}
      </div>
    `
  }
}
