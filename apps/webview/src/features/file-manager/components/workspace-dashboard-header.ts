import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {
  CVChipGroup,
  type CVChipGroupInputDetail,
  type CVChipGroupInputEvent,
} from '@chromvoid/uikit/components/cv-chip-group'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup} from '@chromvoid/uikit/components/cv-radio-group'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {animationStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {
  beginMobileFilePickerSession,
  type MobileFilePickerSession,
} from 'root/shared/services/mobile-file-picker-session'
import {DashboardHeader} from 'root/features/shell/components/dashboard-header'

import {BreadcrumbsNav} from './breadcrumbs-nav'
import {
  createDefaultWorkspaceDashboardHeaderFilters,
  WorkspaceDashboardHeaderModel,
} from './workspace-dashboard-header.model'
import {getFileTypeLabel, getSortLabel, getViewLabel} from './file-manager-labels'
import type {SearchFilters, ViewMode} from 'root/shared/contracts/file-manager'
import {
  createFileSearchFilterActions,
  hasContentFiltering,
  type FileSearchFilterActions,
  type MobileFileQuickFilter,
  type MobileFileViewMode,
  type MobileQuickFilterChip,
} from '../models/file-search-filters.model'
import type {FileManagerMobileToolbarAction} from '../models/file-manager-mobile-toolbar.model'

export type WorkspaceDashboardHeaderFilterChip = {
  key: string
  label: string
  count?: number
  active?: boolean
}

export type WorkspaceDashboardHeaderViewModeOption = {
  value: string
  icon: string
  label: string
}

type WorkspaceDashboardHeaderModelValue<T> = T | (() => T)

export type WorkspaceDashboardHeaderSearchModel = {
  value: WorkspaceDashboardHeaderModelValue<string>
  placeholder?: WorkspaceDashboardHeaderModelValue<string>
  ariaLabel: WorkspaceDashboardHeaderModelValue<string>
  setValue(value: string): void
  clear?(): void
}

export type WorkspaceDashboardHeaderFiltersModel = {
  chips: WorkspaceDashboardHeaderModelValue<WorkspaceDashboardHeaderFilterChip[]>
  value: WorkspaceDashboardHeaderModelValue<string>
  selectionMode?: WorkspaceDashboardHeaderModelValue<'single' | 'multiple'>
  ariaLabel: WorkspaceDashboardHeaderModelValue<string>
  leadingAction?: WorkspaceDashboardHeaderFilterLeadingActionModel
  setValue(value: string, detail?: CVChipGroupInputDetail): void
}

export type WorkspaceDashboardHeaderFilterLeadingActionModel = {
  id?: string
  icon?: WorkspaceDashboardHeaderModelValue<string>
  label: WorkspaceDashboardHeaderModelValue<string>
  showLabel?: WorkspaceDashboardHeaderModelValue<boolean>
  ariaLabel?: WorkspaceDashboardHeaderModelValue<string>
  title?: WorkspaceDashboardHeaderModelValue<string>
  activate(): void
}

export type WorkspaceDashboardHeaderSummaryItem = {
  id: string
  icon: string
  label: string
  value: string | number
}

export type WorkspaceDashboardHeaderSummaryModel = {
  label: WorkspaceDashboardHeaderModelValue<string>
  items?: WorkspaceDashboardHeaderModelValue<WorkspaceDashboardHeaderSummaryItem[]>
}

export type WorkspaceDashboardHeaderSortModel = {
  label: WorkspaceDashboardHeaderModelValue<string>
  ariaLabel?: WorkspaceDashboardHeaderModelValue<string>
  title?: WorkspaceDashboardHeaderModelValue<string>
  mode?: WorkspaceDashboardHeaderModelValue<string>
  activate(): void
}

export type WorkspaceDashboardHeaderViewModeModel = {
  value: WorkspaceDashboardHeaderModelValue<string>
  ariaLabel: WorkspaceDashboardHeaderModelValue<string>
  options: WorkspaceDashboardHeaderModelValue<WorkspaceDashboardHeaderViewModeOption[]>
  setValue(value: string): void
}

export type WorkspaceDashboardHeaderControlsModel = {
  search?: WorkspaceDashboardHeaderSearchModel
  filters?: WorkspaceDashboardHeaderFiltersModel
  summary?: WorkspaceDashboardHeaderSummaryModel
  sort?: WorkspaceDashboardHeaderSortModel
  viewMode?: WorkspaceDashboardHeaderViewModeModel
}

type WorkspaceRadioGroupInputEvent = CustomEvent<{value?: unknown}>

const VIEW_MODE_OPTIONS: ViewMode[] = ['list', 'grid', 'table']

const MOBILE_QUICK_FILTER_KEYS: MobileFileQuickFilter[] = ['all', 'markdown', 'images']
const MOBILE_VIEW_MODE_OPTIONS: Array<{mode: MobileFileViewMode; icon: string}> = [
  {mode: 'list', icon: 'list'},
  {mode: 'grid', icon: 'grid'},
]

function isMobileQuickFilter(value: string | undefined): value is MobileFileQuickFilter {
  return MOBILE_QUICK_FILTER_KEYS.includes(value as MobileFileQuickFilter)
}

function isMobileViewMode(value: string | undefined): value is MobileFileViewMode {
  return value === 'list' || value === 'grid'
}

function renderFileViewModeIcon(mode: ViewMode) {
  switch (mode) {
    case 'list':
      return html`
        <svg
          class="view-mode-icon view-mode-icon--list"
          data-file-view-icon="list"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 7h11M9 12h11M9 17h11"></path>
          <circle class="view-mode-icon__dot" cx="4.5" cy="7" r="1.1"></circle>
          <circle class="view-mode-icon__dot" cx="4.5" cy="12" r="1.1"></circle>
          <circle class="view-mode-icon__dot" cx="4.5" cy="17" r="1.1"></circle>
        </svg>
      `
    case 'grid':
      return html`
        <svg
          class="view-mode-icon"
          data-file-view-icon="grid"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.2"></rect>
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"></rect>
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"></rect>
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"></rect>
        </svg>
      `
    case 'table':
      return html`
        <svg
          class="view-mode-icon"
          data-file-view-icon="table"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="4" y="5" width="16" height="14" rx="1.5"></rect>
          <path d="M4 9.5h16M10 9.5V19"></path>
        </svg>
      `
  }
}

function hasNamedSlotContent(host: HTMLElement, slotName: string): boolean {
  return Array.from(host.childNodes).some((node) => {
    if (!(node instanceof HTMLElement)) return false
    if (node.slot !== slotName) return false
    if (node.hidden) return false

    return true
  })
}

function readModelValue<T>(value: WorkspaceDashboardHeaderModelValue<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

function serializeWorkspaceFilterValue(value: CVChipGroupInputDetail['value'] | null | undefined): string {
  if (Array.isArray(value)) return value.join(' ')
  return String(value ?? '')
}

export class WorkspaceDashboardHeader extends ReatomLitElement {
  static elementName = 'workspace-dashboard-header'

  static define() {
    BreadcrumbsNav.define()
    DashboardHeader.define()
    CVButton.define()
    CVChipGroup.define()
    CVInput.define()
    CVMenuButton.define()
    CVMenuItem.define()
    CVRadio.define()
    CVRadioGroup.define()

    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      surface: {type: String, reflect: true},
      twoRow: {type: Boolean, reflect: true, attribute: 'two-row'},
      embedded: {type: Boolean, reflect: true},
      controlsModel: {attribute: false},
      currentPath: {type: String, attribute: 'current-path'},
      filters: {type: Object},
      totalFiles: {type: Number, attribute: 'total-files'},
      filteredFiles: {type: Number, attribute: 'filtered-files'},
      selectedCount: {type: Number, attribute: 'selected-count'},
      canDownloadSelection: {type: Boolean, attribute: 'can-download-selection'},
      quickFilterChips: {type: Array, attribute: false},
      mobileViewMode: {type: String, attribute: 'mobile-view-mode'},
      mobileToolbarActions: {type: Array, attribute: false},
      mobileSelectionActions: {type: Array, attribute: false},
      filterActions: {attribute: false},
    }
  }

  declare surface: string
  declare twoRow: boolean
  declare embedded: boolean
  declare controlsModel: WorkspaceDashboardHeaderControlsModel | null
  declare currentPath: string
  declare filters: SearchFilters
  declare totalFiles: number
  declare filteredFiles: number
  declare selectedCount: number
  declare canDownloadSelection: boolean
  declare quickFilterChips: MobileQuickFilterChip[]
  declare mobileViewMode: MobileFileViewMode
  declare mobileToolbarActions: FileManagerMobileToolbarAction[]
  declare mobileSelectionActions: FileManagerMobileToolbarAction[]
  declare filterActions: FileSearchFilterActions | null

  private readonly model = new WorkspaceDashboardHeaderModel()
  private readonly legacyFilterActions = createFileSearchFilterActions({
    read: () => this.model.filters(),
    write: (next) => this.dispatchFiltersChange(next),
  })
  private readonly filesMobileControlsModel = this.createFilesMobileControlsModel()
  private filePickerSession: MobileFilePickerSession | null = null

  constructor() {
    super()
    this.surface = 'files'
    this.twoRow = false
    this.embedded = false
    this.controlsModel = null
    this.currentPath = '/'
    this.filters = createDefaultWorkspaceDashboardHeaderFilters()
    this.totalFiles = 0
    this.filteredFiles = 0
    this.selectedCount = 0
    this.canDownloadSelection = false
    this.quickFilterChips = []
    this.mobileViewMode = 'list'
    this.mobileToolbarActions = []
    this.mobileSelectionActions = []
    this.filterActions = null
    this.syncModelFromProps()
  }

  static styles = [
    sharedStyles,
    animationStyles,
    css`
      :host {
        display: block;
        contain: style;
      }

      #file-input {
        display: none;
      }

      .slot-forwarder {
        display: contents;
        min-inline-size: 0;
      }

      .slot-forwarder[hidden] {
        display: none !important;
      }

      .workspace-controls {
        display: grid;
        gap: var(--cv-space-2);
        inline-size: 100%;
        min-inline-size: 0;
      }

      .workspace-search {
        inline-size: 100%;
      }

      .workspace-filter-chips {
        inline-size: 100%;
        min-inline-size: 0;
      }

      .workspace-filter-row {
        display: flex;
        align-items: center;
        gap: var(--app-dashboard-header-control-gap);
        inline-size: 100%;
        min-inline-size: 0;
      }

      .search-box {
        display: block;
        inline-size: 100%;
        min-inline-size: 0;
        box-sizing: border-box;
        --cv-input-height: var(--app-dashboard-header-control-block-size);
        --cv-input-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --cv-input-font-size: var(--app-dashboard-header-control-font-size);
        --cv-input-border-radius: var(--app-dashboard-header-control-radius);
        --cv-input-border-color: var(--cv-color-border);
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-color: var(--cv-color-text);
        --cv-input-placeholder-color: var(--cv-color-text-muted);
        --cv-input-focus-ring: 0 0 0 2px var(--cv-color-accent-ring);
        --cv-input-icon-size: 18px;
        --cv-input-gap: var(--cv-space-2);
        --cv-input-search-mobile-height: var(--app-dashboard-header-control-block-size);
        --cv-input-search-mobile-border-radius: var(--app-dashboard-header-control-radius);
        --cv-input-search-mobile-background: var(--cv-color-surface-2);
        --cv-input-search-mobile-border-color: var(--cv-color-border);
        --cv-input-search-mobile-font-size: var(--app-dashboard-header-control-font-size);
        --cv-input-search-mobile-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --cv-input-search-mobile-icon-size: 18px;
        --cv-input-search-mobile-shadow: inset 0 1px 2px var(--cv-alpha-black-10);
      }

      .search-box cv-icon {
        color: var(--cv-color-text-muted);
      }

      .filter-chips {
        display: block;
        flex: 1 1 auto;
        min-inline-size: 0;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        --cv-chip-group-gap: var(--cv-space-2);
      }

      .filter-chips::part(base) {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: center;
        gap: var(--cv-space-2);
        min-inline-size: 0;
      }

      .filter-chips::-webkit-scrollbar {
        display: none;
      }

      .filter-chip {
        inline-size: max-content;
        --cv-chip-block-size: 32px;
        --cv-chip-padding-inline: var(--cv-space-3);
        --cv-chip-radius: var(--cv-radius-4);
        --cv-chip-gap: var(--cv-space-2);
        --cv-chip-font-size: var(--cv-font-size-xs);
        --cv-chip-border-color: var(--cv-color-border);
        --cv-chip-background: var(--cv-color-surface-glass-subtle);
        --cv-chip-color: var(--cv-color-text-muted);
        --cv-chip-selected-border-color: var(--cv-color-primary-border-strong);
        --cv-chip-selected-background: var(--cv-color-surface-secondary-glass-soft);
      }

      .filter-chip[selected] {
        --cv-chip-color: var(--cv-color-text);
      }

      .filter-chip__label,
      .filter-chip__count {
        line-height: 1;
      }

      .filter-chip__count {
        color: var(--cv-color-text-muted);
        font-family: var(--cv-font-family-code);
      }

      .workspace-filter-leading-action {
        --cv-button-min-height: var(--file-dashboard-compact-control-block-size);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--file-dashboard-compact-control-padding-inline);
        --cv-button-border-radius: var(--file-dashboard-compact-control-radius);
        --cv-button-font-size: var(--file-dashboard-compact-control-font-size);
        --cv-button-font-weight: var(--file-dashboard-compact-control-font-weight);
        --cv-button-gap: 6px;
        flex: 0 0 auto;
        min-inline-size: auto;
      }

      .workspace-filter-leading-action[data-icon-only] {
        --cv-button-gap: 0;
        --cv-button-padding-inline: 0;
        inline-size: var(--file-dashboard-compact-control-block-size);
        block-size: var(--file-dashboard-compact-control-block-size);
      }

      .workspace-filter-leading-action cv-icon {
        --cv-icon-size: 15px;
        inline-size: 15px;
        block-size: 15px;
      }

      .workspace-count-row {
        display: grid;
        grid-template-columns: max-content auto;
        align-items: center;
        gap: var(--app-dashboard-header-control-gap);
        min-inline-size: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--app-dashboard-header-control-font-size);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.2;
        min-height: 34px;
      }

      .workspace-summary {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .workspace-summary--compact {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        inline-size: max-content;
        max-inline-size: 100%;
        overflow: visible;
        text-overflow: clip;
      }

      .workspace-summary__item {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        min-inline-size: 0;
      }

      .workspace-summary__item cv-icon {
        --cv-icon-size: 14px;
        inline-size: 14px;
        block-size: 14px;
        flex: 0 0 auto;
        color: var(--cv-color-text-subtle);
      }

      .workspace-summary__value {
        color: var(--cv-color-text-muted);
        font-family: var(--cv-font-family-code);
        font-weight: var(--cv-font-weight-bold);
        line-height: 1;
      }

      .workspace-count-actions {
        display: grid;
        grid-auto-flow: column;
        align-items: center;
        justify-content: end;
        gap: var(--app-dashboard-header-control-gap);
        min-inline-size: 0;
      }

      .workspace-count-actions ::slotted(.workspace-count-action) {
        min-inline-size: 0;
      }

      .workspace-sort-control {
        --cv-button-min-height: var(--file-dashboard-compact-control-block-size);
        --cv-button-border-radius: var(--file-dashboard-compact-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--file-dashboard-compact-control-padding-inline);
        --cv-button-font-size: var(--file-dashboard-compact-control-font-size);
        --cv-button-font-weight: var(--file-dashboard-compact-control-font-weight);
        --cv-button-gap: 6px;
        min-inline-size: auto;
      }

      .sort-control {
        --cv-button-min-height: var(--file-dashboard-compact-control-block-size);
        --cv-button-padding-inline: var(--file-dashboard-compact-control-padding-inline);
        --cv-button-padding-block: 0;
        --cv-button-border-radius: var(--file-dashboard-compact-control-radius);
        --cv-button-gap: 6px;
        --cv-button-font-size: var(--file-dashboard-compact-control-font-size);
        --cv-button-font-weight: var(--file-dashboard-compact-control-font-weight);
        --cv-button-background: var(--cv-color-surface-secondary-glass-soft);
        --cv-button-border-color: var(--cv-color-border-muted);
        --cv-button-text-color: var(--cv-color-text);
        --cv-button-background-hover: var(--cv-color-surface-secondary-glass-soft);
        --cv-button-border-color-hover: var(--cv-color-primary-border);
        --cv-button-background-active: var(--cv-color-active);
        --cv-button-border-color-active: var(--cv-color-primary-border-strong);
        --cv-button-focus-ring-color: var(--cv-color-accent);
        display: inline-block;
        inline-size: max-content;
      }

      .sort-control cv-icon {
        --cv-icon-size: 15px;
        inline-size: 15px;
        block-size: 15px;
      }

      .sort-control__label {
        max-inline-size: 6.5rem;
        overflow: hidden;
        font-size: var(--file-dashboard-compact-control-font-size);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .workspace-sort-label {
        max-inline-size: 7rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .view-switch {
        display: inline-grid;
        align-items: center;
        inline-size: max-content;
        block-size: var(--file-dashboard-view-switch-block-size);
        min-block-size: var(--file-dashboard-view-switch-block-size);
        padding: 3px;
        border: 1px solid var(--file-dashboard-view-switch-border);
        border-radius: var(--cv-radius-2);
        background: var(--file-dashboard-view-switch-background);
        box-sizing: border-box;
        --cv-radio-group-gap: 2px;
      }

      .view-switch::part(base) {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: var(--file-dashboard-view-switch-item-inline-size);
        align-items: center;
        gap: 2px;
        block-size: var(--file-dashboard-view-switch-item-block-size);
        padding: 0;
        border: 0;
        border-radius: calc(var(--cv-radius-2) - 2px);
        background: transparent;
        box-sizing: border-box;
      }

      .view-switch__button {
        display: inline-grid;
        inline-size: var(--file-dashboard-view-switch-item-inline-size);
        block-size: var(--file-dashboard-view-switch-item-block-size);
        min-inline-size: var(--file-dashboard-view-switch-item-inline-size);
        color: var(--cv-color-text-muted);
        --cv-radio-gap: 0;
      }

      .view-switch__button::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 100%;
        padding: 0;
        border: 1px solid transparent;
        border-radius: max(0px, calc(var(--cv-radius-2) - 4px));
        background: transparent;
        box-sizing: border-box;
        color: currentColor;
      }

      .view-switch__button::part(description) {
        display: none;
      }

      .view-switch__button::part(label) {
        display: inline-grid;
        place-items: center;
        line-height: 1;
      }

      .view-switch__button:hover {
        color: var(--cv-color-text);
      }

      .view-switch__button:hover::part(base) {
        background: var(--cv-color-surface-glass-subtle);
      }

      .view-switch__button[checked] {
        color: var(--cv-color-accent);
      }

      .view-switch__button[checked]::part(base) {
        border-color: var(--file-dashboard-view-switch-selected-border);
        background: var(--file-dashboard-view-switch-selected-background);
      }

      .view-switch__button:focus-visible::part(base) {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 1px;
      }

      .view-switch__icon {
        --cv-icon-size: 16px;
        inline-size: 16px;
        block-size: 16px;
      }

      .files-desktop-header {
        container-type: inline-size;
        min-inline-size: 0;
      }

      .files-dashboard-toolbar {
        --app-toolbar-min-block-size: calc(
          var(--file-dashboard-compact-control-block-size) + var(--cv-space-5)
        );
        --app-toolbar-padding-block: 0;
        --app-toolbar-padding-inline: var(--cv-space-3);
        --app-toolbar-padding-inline-wide: var(--cv-space-3);
        --app-dashboard-header-control-block-size: var(--file-dashboard-compact-control-block-size);
        --app-dashboard-header-control-radius: var(--file-dashboard-compact-control-radius);
        --app-dashboard-header-control-padding-inline: var(
          --file-dashboard-compact-control-padding-inline
        );
        --app-dashboard-header-control-font-size: var(--file-dashboard-compact-control-font-size);
        --app-dashboard-header-control-font-weight: var(
          --file-dashboard-compact-control-font-weight
        );
        --app-dashboard-header-control-gap: var(--cv-space-2);
      }

      .files-toolbar-row {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        inline-size: 100%;
        min-inline-size: 0;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .files-toolbar-row::-webkit-scrollbar,
      .files-context-strip::-webkit-scrollbar {
        display: none;
      }

      .breadcrumbs-section {
        flex: 0 1 240px;
        min-inline-size: 88px;
        max-inline-size: 280px;
        overflow: hidden;
      }

      .breadcrumbs-section breadcrumbs-nav {
        --cv-breadcrumb-item-link-padding-inline: var(--cv-space-1);
        --cv-breadcrumb-item-current-border-color: transparent;
        --cv-breadcrumb-item-current-background: transparent;
        --cv-breadcrumb-item-current-highlight: transparent;
        inline-size: 100%;
        min-inline-size: 0;
      }

      .files-toolbar-spacer {
        flex: 1 1 var(--cv-space-4);
        min-inline-size: 0;
      }

      .filters-section {
        flex: 0 0 clamp(296px, 26vw, 360px);
        inline-size: clamp(296px, 26vw, 360px);
        min-inline-size: 296px;
      }

      .filters-section file-search {
        --file-search-control-block-size: var(--app-dashboard-header-control-block-size);
        --file-search-control-radius: var(--app-dashboard-header-control-radius);
        --file-search-control-font-size: var(--app-dashboard-header-control-font-size);
        --file-search-control-font-weight: var(--app-dashboard-header-control-font-weight);
        inline-size: 100%;
        min-inline-size: 0;
      }

      .files-toolbar-divider {
        flex: 0 0 auto;
        inline-size: 1px;
        block-size: 22px;
        background: var(--cv-color-border-muted);
      }

      .actions-group {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .create-upload-actions {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .action-btn {
        --cv-button-min-height: var(--app-dashboard-header-control-block-size);
        --cv-button-border-radius: var(--app-dashboard-header-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --cv-button-font-size: var(--app-dashboard-header-control-font-size);
        --cv-button-font-weight: var(--app-dashboard-header-control-font-weight);
        --cv-button-gap: var(--app-dashboard-header-control-gap);
        min-inline-size: auto;
      }

      .action-btn:not([variant='primary']) {
        --cv-button-background: var(--cv-color-surface-2);
        --cv-button-border-color: var(--cv-color-border-muted);
        --cv-button-text-color: var(--cv-color-text-muted);
        --cv-button-background-hover: var(--cv-color-hover);
        --cv-button-border-color-hover: var(--cv-color-border);
        --cv-button-background-active: var(--cv-color-active);
      }

      .action-btn:not([variant='primary']):hover::part(base) {
        color: var(--cv-color-text);
      }

      .view-mode-group {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: center;
        gap: 2px;
        block-size: var(--file-dashboard-view-switch-block-size);
        padding: 3px;
        border: 1px solid var(--file-dashboard-view-switch-border);
        border-radius: var(--file-dashboard-compact-control-radius);
        background: var(--file-dashboard-view-switch-background);
        box-sizing: border-box;
      }

      .view-mode-button {
        --cv-button-min-height: var(--file-dashboard-view-switch-item-block-size);
        --cv-button-border-radius: calc(var(--file-dashboard-compact-control-radius) - 2px);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: 0;
        --cv-button-font-size: var(--app-dashboard-header-control-font-size);
        --cv-button-font-weight: var(--app-dashboard-header-control-font-weight);
        inline-size: var(--file-dashboard-view-switch-item-inline-size);
        min-inline-size: var(--file-dashboard-view-switch-item-inline-size);
      }

      .view-mode-button::part(label) {
        display: inline-grid;
        place-items: center;
        line-height: 1;
      }

      .view-mode-button:focus-visible::part(base) {
        outline-offset: -2px;
      }

      .sort-toggle {
        white-space: nowrap;
      }

      .selection-mode-toggle {
        --cv-button-padding-inline: var(--cv-space-2);
      }

      .view-mode-button[pressed]::part(base) {
        background: var(--cv-color-surface-3);
        border-color: var(--file-dashboard-view-switch-background);
      }

      .view-mode-icon {
        display: block;
        inline-size: 16px;
        block-size: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }

      .view-mode-icon--list {
        stroke-width: 1.7;
      }

      .view-mode-icon__dot {
        fill: currentColor;
        stroke: none;
      }

      .view-mode-button[pressed] .view-mode-icon {
        color: var(--cv-color-primary);
      }

      .selection-mode-toggle[pressed]::part(base) {
        background: var(--cv-color-primary-surface-strong);
        border-color: var(--cv-color-primary-border-strong);
        box-shadow: none;
      }

      .selection-mode-toggle[pressed]::part(label),
      .selection-mode-toggle[pressed] cv-icon {
        color: var(--cv-color-primary);
      }

      .action-btn cv-icon {
        display: block;
        width: 15px;
        height: 15px;
        color: inherit;
      }

      .files-context-strip {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-block-size: 38px;
        padding: var(--cv-space-1) var(--app-toolbar-padding-inline);
        border-block-start: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .files-selection-actions,
      .files-filter-pills {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex: 0 0 auto;
      }

      .files-selected-count {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2);
        min-block-size: 26px;
        padding-inline: var(--cv-space-3);
        border: 1px solid var(--cv-color-primary-border-strong);
        border-radius: var(--cv-radius-pill);
        background: var(--cv-color-primary-surface-strong);
        color: var(--cv-color-primary);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
        white-space: nowrap;
      }

      .files-selected-count cv-icon {
        --cv-icon-size: 14px;
        inline-size: 14px;
        block-size: 14px;
      }

      .context-action {
        --cv-button-min-height: 26px;
        --cv-button-border-radius: var(--cv-radius-2);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--cv-space-2);
        --cv-button-font-size: var(--cv-font-size-xs);
        --cv-button-font-weight: var(--cv-font-weight-medium);
        --cv-button-gap: var(--cv-space-2);
        min-inline-size: auto;
      }

      .context-action cv-icon {
        --cv-icon-size: 14px;
        inline-size: 14px;
        block-size: 14px;
      }

      .files-filter-pills:not(:first-child)::before {
        content: '';
        inline-size: 1px;
        block-size: 20px;
        margin-inline: var(--cv-space-1);
        background: var(--cv-color-border-muted);
      }

      .filter-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2);
        min-block-size: 26px;
        padding-inline-start: var(--cv-space-3);
        padding-inline-end: var(--cv-space-1);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-pill);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        white-space: nowrap;
      }

      .filter-pill__kind {
        color: var(--cv-color-text-subtle);
        font-size: var(--cv-font-size-xs);
      }

      .filter-pill__remove {
        display: inline-grid;
        place-items: center;
        inline-size: 18px;
        block-size: 18px;
        padding: 0;
        border: 0;
        border-radius: var(--cv-radius-pill);
        background: var(--cv-color-surface-3);
        color: var(--cv-color-text-muted);
        cursor: pointer;
      }

      .filter-pill__remove:hover {
        background: var(--cv-color-danger-surface-strong);
        color: var(--cv-color-danger);
      }

      .filter-pill__remove:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 1px;
      }

      .filter-pill__remove cv-icon {
        --cv-icon-size: 11px;
        inline-size: 11px;
        block-size: 11px;
      }

      @container (width < 1180px) {
        .files-toolbar-label--utility {
          display: none;
        }

        .sort-toggle,
        .selection-mode-toggle {
          --cv-button-padding-inline: var(--cv-space-2);
        }
      }

      @container (width < 960px) {
        .files-toolbar-spacer {
          display: none;
        }

        .breadcrumbs-section {
          flex-basis: 150px;
          max-inline-size: 150px;
        }

        .filters-section {
          flex: 1 1 240px;
        }

        .files-toolbar-label--secondary {
          display: none;
        }

        .actions-group-primary .action-btn {
          --cv-button-padding-inline: var(--cv-space-2);
        }
      }

      @container (width < 760px) {
        .files-toolbar-label--primary {
          display: none;
        }
      }

      .workspace-mobile-shell {
        display: grid;
        grid-auto-flow: row;
        gap: var(--app-spacing-2);
        padding-block-start: var(--app-mobile-surface-gutter-block-start);
        padding-block-end: var(--app-mobile-surface-gutter-block-end);
        padding-inline: var(--app-mobile-surface-gutter-inline);
      }

      .mobile-action-menu,
      .mobile-selection-action {
        border: none;
        font: inherit;
        letter-spacing: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .mobile-action-menu cv-icon,
      .mobile-selection-action cv-icon {
        display: block;
        inline-size: 16px;
        block-size: 16px;
      }

      .mobile-action-menu {
        --cv-menu-button-menu-align: end;
        --cv-menu-button-menu-min-inline-size: 208px;
        --cv-menu-button-menu-z-index: 60;
        --cv-menu-item-gap: 12px;
        position: fixed;
        z-index: 40;
        inset-inline-end: max(
          18px,
          calc(var(--app-runtime-safe-area-inline-end, 0px) + 18px)
        );
        /* The mobile shell content box already ends above the tab bar and its safe area. */
        inset-block-end: var(--app-spacing-2);
      }

      .mobile-action-menu::part(trigger) {
        display: inline-grid;
        place-items: center;
        inline-size: 56px;
        block-size: 56px;
        min-inline-size: 56px;
        min-block-size: 56px;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: var(--cv-color-primary);
        color: var(--cv-color-on-primary);
        box-shadow:
          0 16px 32px var(--cv-alpha-black-30),
          0 0 0 1px var(--cv-color-primary-border-strong);
      }

      .mobile-action-menu[open]::part(trigger),
      .mobile-action-menu::part(trigger):hover {
        background: var(--cv-color-primary-hover, var(--cv-color-primary));
      }

      .mobile-action-menu::part(trigger):active {
        transform: scale(0.96);
      }

      .mobile-action-menu::part(prefix),
      .mobile-action-menu__trigger {
        display: inline-grid;
        place-items: center;
      }

      .mobile-action-menu::part(label),
      .mobile-action-menu::part(suffix),
      .mobile-action-menu::part(dropdown-icon) {
        display: none;
      }

      .mobile-action-menu::part(menu) {
        gap: 2px;
        padding: 4px;
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
        box-shadow: var(--cv-shadow-3);
      }

      .mobile-action-menu__trigger cv-icon {
        inline-size: 24px;
        block-size: 24px;
      }

      .mobile-action-menu-item {
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        font-size: var(--cv-font-size-sm, 14px);
      }

      .mobile-action-menu-item::part(base) {
        align-items: center;
        gap: var(--cv-menu-item-gap, 12px);
        padding: 10px 12px;
        border-radius: var(--cv-radius-1, 6px);
        white-space: nowrap;
      }

      .mobile-action-menu-item::part(prefix) {
        opacity: 0.7;
      }

      .mobile-action-menu-item cv-icon {
        font-size: 18px;
        inline-size: 18px;
        block-size: 18px;
      }

      .mobile-action-menu-item.tone-accent::part(base) {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }

      .mobile-selection-bar {
        position: fixed;
        z-index: 45;
        inset-inline: max(12px, var(--app-runtime-safe-area-inline-start, 0px))
          max(12px, var(--app-runtime-safe-area-inline-end, 0px));
        inset-block-end: calc(
          var(--app-mobile-tabbar-block-size, 64px) + var(--app-runtime-safe-area-block-end-active, 0px) + 10px
        );
        display: grid;
        grid-template-columns: minmax(84px, auto) minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: 18px;
        background: var(--file-dashboard-mobile-selection-background);
        box-shadow:
          0 18px 38px var(--cv-alpha-black-35),
          inset 0 1px 0 var(--cv-alpha-white-6);
      }

      .mobile-selection-count {
        min-inline-size: 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-bold);
        line-height: 1.2;
      }

      .mobile-selection-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        min-inline-size: 0;
      }

      .mobile-selection-action {
        display: grid;
        grid-auto-flow: row;
        place-items: center;
        gap: 4px;
        min-inline-size: 0;
        min-block-size: 48px;
        padding: 4px 2px;
        border-radius: 12px;
        background: transparent;
        color: var(--cv-color-text-muted);
        font-size: 11px;
        font-weight: var(--cv-font-weight-semibold);
      }

      .mobile-selection-action span {
        max-inline-size: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mobile-selection-action[data-action='delete-selected'] {
        color: var(--cv-color-danger);
      }

      .mobile-selection-action:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      @container (width < 720px) {
        .workspace-sort-control {
          --cv-button-padding-inline: var(--cv-space-3);
        }

        .workspace-sort-label {
          max-inline-size: 5.5rem;
        }
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.model.startResponsiveSync()
    this.syncModelFromProps()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.endFilePickerSession()
    this.model.stopResponsiveSync()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (
      changedProperties.has('currentPath') ||
      changedProperties.has('filters') ||
      changedProperties.has('totalFiles') ||
      changedProperties.has('filteredFiles') ||
      changedProperties.has('selectedCount') ||
      changedProperties.has('canDownloadSelection') ||
      changedProperties.has('quickFilterChips') ||
      changedProperties.has('mobileViewMode') ||
      changedProperties.has('mobileToolbarActions') ||
      changedProperties.has('mobileSelectionActions')
    ) {
      this.syncModelFromProps()
    }
  }

  private syncModelFromProps() {
    this.model.sync({
      currentPath: this.currentPath,
      filters: this.filters,
      totalFiles: this.totalFiles,
      filteredFiles: this.filteredFiles,
      selectedCount: this.selectedCount,
      canDownloadSelection: this.canDownloadSelection,
      quickFilterChips: this.quickFilterChips,
      mobileViewMode: this.mobileViewMode,
      mobileToolbarActions: this.mobileToolbarActions,
      mobileSelectionActions: this.mobileSelectionActions,
    })
  }

  private dispatchFiltersChange(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  private getFilterActions(): FileSearchFilterActions {
    return this.filterActions ?? this.legacyFilterActions
  }

  private createFilesMobileControlsModel(): WorkspaceDashboardHeaderControlsModel {
    const host = this

    return {
      search: {
        get value(): string {
          return host.model.filters().query
        },
        get placeholder(): string {
          return i18n('file-manager:search')
        },
        get ariaLabel(): string {
          return i18n('file-manager:search')
        },
        setValue(value: string): void {
          host.getFilterActions().patchFilters({query: value})
        },
        clear(): void {
          host.getFilterActions().clearQuery()
        },
      },
      filters: {
        get chips(): WorkspaceDashboardHeaderFilterChip[] {
          return host.model.quickFilterChips()
        },
        get value(): string {
          const fileTypes = host.model.filters().fileTypes
          if (fileTypes.length === 0) return 'all'
          return fileTypes.filter(isMobileQuickFilter).join(' ')
        },
        get selectionMode(): 'multiple' {
          return 'multiple'
        },
        get ariaLabel(): string {
          return i18n('file-manager:file-type')
        },
        setValue(value: string, detail?: CVChipGroupInputDetail): void {
          const changedValue = detail?.changedValue ?? value
          if (!isMobileQuickFilter(changedValue)) return

          host.getFilterActions().setMobileQuickFilter(changedValue)
        },
      },
      summary: {
        get label(): string {
          return i18n('file-manager:mobile-count', {count: String(host.model.filteredFiles())})
        },
      },
      sort: {
        get label(): string {
          return getSortLabel(host.model.filters().sortBy)
        },
        get ariaLabel(): string {
          return i18n('file-manager:sort-current', {sort: getSortLabel(host.model.filters().sortBy)})
        },
        get title(): string {
          return i18n('file-manager:sort-current', {sort: getSortLabel(host.model.filters().sortBy)})
        },
        get mode(): string {
          return host.model.filters().sortBy
        },
        activate(): void {
          host.getFilterActions().cycleMobileSort()
        },
      },
      viewMode: {
        get value(): string {
          return host.model.mobileViewMode()
        },
        get ariaLabel(): string {
          return i18n('file-manager:view')
        },
        get options(): WorkspaceDashboardHeaderViewModeOption[] {
          return MOBILE_VIEW_MODE_OPTIONS.map(({mode, icon}) => ({
            value: mode,
            icon,
            label: getViewLabel(mode),
          }))
        },
        setValue(value: string): void {
          if (!isMobileViewMode(value)) return

          host.getFilterActions().setMobileViewMode(value)
        },
      },
    }
  }

  private getActiveWorkspaceControlsModel(): WorkspaceDashboardHeaderControlsModel | null {
    if (this.isFilesSurface() && this.model.isMobile()) {
      return this.filesMobileControlsModel
    }

    return this.controlsModel
  }

  private getFileInput(): HTMLInputElement | null {
    return this.renderRoot.querySelector('#file-input') as HTMLInputElement | null
  }

  focusCreateDirActionTarget(): boolean {
    const button = this.renderRoot.querySelector<HTMLElement>('[data-action="create-dir"]')
    if (!button) return false

    button.focus({preventScroll: true})
    return true
  }

  focusInput(): void {
    const input = this.renderRoot.querySelector('cv-input.search-box') as
      | (HTMLElement & {focus?: (options?: FocusOptions) => void})
      | null
    input?.focus?.()
  }

  clear(): void {
    this.onWorkspaceSearchClear()
  }

  private onNavigate(e: CustomEvent) {
    this.dispatchEvent(new CustomEvent('navigate', {detail: e.detail, bubbles: true}))
  }

  private onFiltersChange(e: CustomEvent) {
    this.dispatchFiltersChange(e.detail)
  }

  private onCreateDirClick() {
    this.dispatchEvent(new CustomEvent('create-dir', {bubbles: true}))
  }

  private onCreateNoteClick() {
    this.dispatchEvent(new CustomEvent('create-note', {bubbles: true}))
  }

  private onUploadClick() {
    void this.handleUploadClick()
  }

  private async handleUploadClick() {
    const input = this.getFileInput()

    if (this.model.canUseNativeUpload()) {
      this.dispatchEvent(new CustomEvent('native-upload-requested', {bubbles: true}))
      return
    }

    if (this.model.canUseNativePathUpload()) {
      this.beginFilePickerSession()
      try {
        const files = await this.model.pickNativeUploadFiles()
        this.endFilePickerSession()
        if (files.length > 0) {
          this.dispatchEvent(new CustomEvent('upload-paths-requested', {detail: {files}, bubbles: true}))
        }
        return
      } catch (e) {
        this.endFilePickerSession()
        console.warn('[dashboard][tauri] open file dialog failed, falling back to <input type=file>', e)
      }
    }

    if (!input) return
    this.beginFilePickerSession()
    try {
      input.click()
    } catch {
      this.endFilePickerSession()
    }
  }

  private onFileInputChange(e: Event) {
    this.endFilePickerSession()
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      this.dispatchEvent(new CustomEvent('upload-requested', {detail: {files}, bubbles: true}))
    }
  }

  private beginFilePickerSession() {
    this.endFilePickerSession()
    this.filePickerSession = beginMobileFilePickerSession()
  }

  private endFilePickerSession() {
    this.filePickerSession?.end()
    this.filePickerSession = null
  }

  private onDeleteClick() {
    this.dispatchEvent(new CustomEvent('delete-selected', {bubbles: true}))
  }

  private onMoveSelectedClick() {
    this.dispatchEvent(new CustomEvent('move-selected', {bubbles: true}))
  }

  private onDownloadSelectedClick() {
    this.dispatchEvent(new CustomEvent('download-selected', {bubbles: true}))
  }

  private onClearSelectionClick() {
    this.dispatchEvent(new CustomEvent('clear-selection', {bubbles: true}))
  }

  private onClearQueryFilterClick() {
    this.getFilterActions().clearQuery()
  }

  private onHideHiddenFilesClick() {
    this.getFilterActions().hideHiddenFiles()
  }

  private onRemoveFileTypeFilterClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const type = target.dataset['fileType']
    if (!type) return

    this.getFilterActions().removeFileType(type)
  }

  private onResetFiltersClick() {
    this.getFilterActions().reset()
  }

  private onSelectionModeToggle() {
    this.dispatchEvent(
      new CustomEvent('selection-mode-requested', {
        detail: {enabled: !this.model.selectionModeEnabled()},
        bubbles: true,
      }),
    )
  }

  private onViewListClick() {
    this.getFilterActions().setViewMode('list')
  }

  private onViewTableClick() {
    this.getFilterActions().setViewMode('table')
  }

  private onViewGridClick() {
    this.getFilterActions().setViewMode('grid')
  }

  private onSortDirectionToggle() {
    this.getFilterActions().toggleSortDirection()
  }

  private onWorkspaceSearchInput(event: CVInputInputEvent) {
    this.getActiveWorkspaceControlsModel()?.search?.setValue(event.detail.value)
  }

  private onWorkspaceSearchClear() {
    const search = this.getActiveWorkspaceControlsModel()?.search
    if (!search) return

    if (search.clear) {
      search.clear()
      return
    }

    search.setValue('')
  }

  private onWorkspaceFilterInput(event: CVChipGroupInputEvent) {
    const filters = this.getActiveWorkspaceControlsModel()?.filters
    if (!filters) return

    filters.setValue(serializeWorkspaceFilterValue(event.detail.value), event.detail)
  }

  private onWorkspaceFilterLeadingActionClick() {
    this.getActiveWorkspaceControlsModel()?.filters?.leadingAction?.activate()
  }

  private onWorkspaceSortClick() {
    this.getActiveWorkspaceControlsModel()?.sort?.activate()
  }

  private onWorkspaceViewModeInput(event: WorkspaceRadioGroupInputEvent) {
    this.getActiveWorkspaceControlsModel()?.viewMode?.setValue(String(event.detail.value ?? ''))
  }

  private renderBreadcrumbs() {
    return html`
      <breadcrumbs-nav
        .currentPath=${this.model.currentPath()}
        @navigate=${this.onNavigate}
      ></breadcrumbs-nav>
    `
  }

  private renderViewModeControls() {
    const currentViewMode = this.model.filters().viewMode
    const handlers: Record<ViewMode, () => void> = {
      list: this.onViewListClick,
      table: this.onViewTableClick,
      grid: this.onViewGridClick,
    }

    return html`
      <div class="view-mode-group" role="group" aria-label=${i18n('file-manager:view' as any)}>
        ${VIEW_MODE_OPTIONS.map((mode) => {
          const active = currentViewMode === mode
          const label = getViewLabel(mode)
          return html`
            <cv-button
              class="view-mode-button"
              data-view-mode=${mode}
              variant="ghost"
              size="small"
              toggle
              .pressed=${active}
              aria-pressed=${active ? 'true' : 'false'}
              aria-label=${label}
              title=${label}
              @click=${handlers[mode]}
            >
              ${renderFileViewModeIcon(mode)}
            </cv-button>
          `
        })}
      </div>
    `
  }

  private renderPrimaryActions() {
    return html`
      <div class="actions-group actions-group-primary">
        <cv-guidance-anchor
          class="create-upload-actions"
          anchor-id="files.create-or-upload"
          surface="files"
          owner="file-manager"
        >
          <cv-button
            class="action-btn"
            data-action="create-dir"
            variant="default"
            size="small"
            @click=${this.onCreateDirClick}
            aria-label=${i18n('file-manager:create-folder')}
            title=${i18n('file-manager:create-folder')}
          >
            <cv-icon name="folder-plus" slot="prefix"></cv-icon>
            <span class="files-toolbar-label files-toolbar-label--secondary">${i18n('node:dir')}</span>
          </cv-button>

          <cv-button
            class="action-btn"
            data-action="create-note"
            variant="default"
            size="small"
            @click=${this.onCreateNoteClick}
            aria-label=${i18n('file-manager:create-note')}
            title=${i18n('file-manager:create-note')}
          >
            <cv-icon name="file-plus" slot="prefix"></cv-icon>
            <span class="files-toolbar-label files-toolbar-label--secondary">
              ${i18n('file-manager:note')}
            </span>
          </cv-button>

          <cv-button
            class="action-btn"
            data-action="upload"
            variant="primary"
            size="small"
            @click=${this.onUploadClick}
            aria-label=${i18n('file-manager:upload-files')}
            title=${i18n('file-manager:upload-files')}
          >
            <cv-icon name="upload" slot="prefix"></cv-icon>
            <span class="files-toolbar-label files-toolbar-label--primary">
              ${i18n('file-manager:upload')}
            </span>
          </cv-button>
        </cv-guidance-anchor>
      </div>
    `
  }

  private renderSortControl() {
    const filters = this.model.filters()
    const sortArrow = filters.sortDirection === 'asc' ? '↑' : '↓'
    const sortLabel = `${i18n('file-manager:sort-current', {sort: getSortLabel(filters.sortBy)})} ${sortArrow}`
    const directionLabel = i18n(
      filters.sortDirection === 'asc'
        ? 'file-manager:sort-direction:asc-short'
        : 'file-manager:sort-direction:desc-short',
    )
    const sortIcon = filters.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'

    return html`
      <cv-button
        class="action-btn sort-toggle"
        variant="default"
        size="small"
        @click=${this.onSortDirectionToggle}
        aria-label=${sortLabel}
        title=${i18n('file-manager:toggle-sort-direction')}
      >
        <cv-icon name=${sortIcon} slot="prefix"></cv-icon>
        <span class="files-toolbar-label files-toolbar-label--utility">${directionLabel}</span>
      </cv-button>
    `
  }

  private renderSelectionActions() {
    const selectionModeEnabled = this.model.selectionModeEnabled()

    return html`
      <div class="actions-group actions-group-secondary">
        ${this.renderSortControl()}
        <cv-button
          class="action-btn selection-mode-toggle"
          variant="default"
          size="small"
          toggle
          .pressed=${selectionModeEnabled}
          aria-pressed=${selectionModeEnabled ? 'true' : 'false'}
          aria-label=${i18n(
            selectionModeEnabled ? 'statusbar:selection-mode:disable' : 'statusbar:selection-mode:enable',
          )}
          title=${`${i18n('statusbar:selection-mode')}: ${i18n(
            selectionModeEnabled ? 'statusbar:selection-mode:on' : 'statusbar:selection-mode:off',
          )}`}
          @click=${this.onSelectionModeToggle}
        >
          <cv-icon name="square-check-big"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private renderFilters() {
    return html`
      <file-search
        toolbar-only
        .filters=${this.model.filters()}
        .filterActions=${this.filterActions}
        .totalFiles=${this.model.totalFiles()}
        .filteredFiles=${this.model.filteredFiles()}
        @filters-change=${this.onFiltersChange}
      ></file-search>
    `
  }

  private renderFilterPill(kind: string, label: string, clearLabel: string, onClear: (event: Event) => void) {
    return html`
      <span class="filter-pill">
        <span class="filter-pill__kind">${kind}</span>
        <span>${label}</span>
        <button type="button" class="filter-pill__remove" aria-label=${clearLabel} @click=${onClear}>
          <cv-icon name="x" aria-hidden="true"></cv-icon>
        </button>
      </span>
    `
  }

  private renderContextStrip() {
    const filters = this.model.filters()
    const hasFilters = hasContentFiltering(filters)
    const hasSelection = this.model.hasSelection()
    if (!hasFilters && !hasSelection) return nothing

    const selectedCount = this.model.selectedCount()

    return html`
      <div
        class="files-context-strip"
        role="group"
        aria-label=${hasSelection
          ? i18n('file-manager:selected-count', {count: String(selectedCount)})
          : i18n('file-manager:active-filters')}
      >
        ${hasSelection
          ? html`
              <div
                class="files-selection-actions"
                role="group"
                aria-label=${i18n('file-manager:selected-count', {count: String(selectedCount)})}
              >
                <span class="files-selected-count">
                  <cv-icon name="check" aria-hidden="true"></cv-icon>
                  ${i18n('file-manager:selected-count', {count: String(selectedCount)})}
                </span>
                <cv-button
                  class="context-action"
                  data-action="move-selected"
                  variant="default"
                  size="small"
                  @click=${this.onMoveSelectedClick}
                >
                  <cv-icon name="folder-symlink" slot="prefix"></cv-icon>
                  <span>${i18n('file-manager:move:action')}</span>
                </cv-button>
                <cv-button
                  class="context-action"
                  data-action="download-selected"
                  variant="default"
                  size="small"
                  ?disabled=${!this.model.canDownloadSelection()}
                  @click=${this.onDownloadSelectedClick}
                >
                  <cv-icon name="download" slot="prefix"></cv-icon>
                  <span>${i18n('button:download')}</span>
                </cv-button>
                <cv-button
                  class="context-action"
                  data-action="delete-selected"
                  variant="danger"
                  size="small"
                  aria-label=${i18n('file-manager:delete-selected', {count: String(selectedCount)})}
                  @click=${this.onDeleteClick}
                >
                  <cv-icon name="trash-2" slot="prefix"></cv-icon>
                  <span>${i18n('button:delete')}</span>
                </cv-button>
                <cv-button
                  class="context-action context-action--clear"
                  data-action="clear-selection"
                  variant="ghost"
                  size="small"
                  @click=${this.onClearSelectionClick}
                >
                  ${i18n('file-manager:selection-clear')}
                </cv-button>
              </div>
            `
          : nothing}
        ${hasFilters
          ? html`
              <div
                class="files-filter-pills"
                role="group"
                aria-label=${i18n('file-manager:active-filters')}
              >
                ${filters.query.trim()
                  ? this.renderFilterPill(
                      i18n('file-manager:search'),
                      `“${filters.query.trim()}”`,
                      i18n('file-manager:clear-search'),
                      this.onClearQueryFilterClick,
                    )
                  : nothing}
                ${filters.showHidden
                  ? this.renderFilterPill(
                      i18n('file-manager:hidden-files'),
                      i18n('file-manager:show'),
                      i18n('file-manager:hide-hidden-files'),
                      this.onHideHiddenFilesClick,
                    )
                  : nothing}
                ${filters.fileTypes.map((type) => {
                  const label = getFileTypeLabel(type)
                  return html`
                    <span class="filter-pill">
                      <span class="filter-pill__kind">${i18n('file-manager:type')}</span>
                      <span>${label}</span>
                      <button
                        type="button"
                        class="filter-pill__remove"
                        data-file-type=${type}
                        aria-label=${i18n('file-manager:remove-filter', {label})}
                        @click=${this.onRemoveFileTypeFilterClick}
                      >
                        <cv-icon name="x" aria-hidden="true"></cv-icon>
                      </button>
                    </span>
                  `
                })}
                <cv-button
                  class="context-action"
                  data-action="reset-filters"
                  variant="ghost"
                  size="small"
                  @click=${this.onResetFiltersClick}
                >
                  ${i18n('file-manager:clear-filters')}
                </cv-button>
              </div>
            `
          : nothing}
      </div>
    `
  }

  private onMobileSelectionActionClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    const actionId = target.dataset['action']
    if (!actionId) return

    this.dispatchEvent(new CustomEvent('mobile-command', {detail: {actionId}, bubbles: true}))
  }

  private getMobileSelectionActionAriaLabel(action: FileManagerMobileToolbarAction): string {
    if (action.id === 'delete-selected') {
      return i18n('file-manager:delete-selected', {count: String(this.model.selectedCount())})
    }

    return action.label
  }

  private resetMobileActionMenuSelection(menu: HTMLElementTagNameMap['cv-menu-button']) {
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
  }

  private onMobileActionMenuInput(event: CustomEvent<{value: string | null; open: boolean}>) {
    const actionId = event.detail.value
    if (!actionId) return

    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']

    if (event.detail.open) {
      this.resetMobileActionMenuSelection(menu)
      return
    }

    menu.open = false
    this.resetMobileActionMenuSelection(menu)
    this.dispatchEvent(new CustomEvent('mobile-command', {detail: {actionId}, bubbles: true}))
  }

  private renderMobileActionMenu() {
    const actions = this.model.mobileToolbarActions()
    if (actions.length === 0) return nothing

    return html`
      <cv-menu-button
        class="mobile-action-menu"
        data-action="mobile-actions-menu"
        variant="ghost"
        preset="icon-overflow"
        aria-label=${i18n('button:more_actions' as any)}
        @cv-input=${this.onMobileActionMenuInput}
      >
        <span slot="prefix" class="mobile-action-menu__trigger">
          <cv-icon name="three-dots" aria-hidden="true"></cv-icon>
        </span>
        <span class="sr-only">${i18n('button:more_actions' as any)}</span>
        ${actions.map(
          (action) => html`
            <cv-menu-item
              slot="menu"
              value=${action.id}
              class="mobile-action-menu-item ${action.tone === 'accent' ? 'tone-accent' : ''}"
              ?disabled=${action.disabled}
            >
              <cv-icon slot="prefix" name=${action.icon}></cv-icon>
              ${action.label}
            </cv-menu-item>
          `,
        )}
      </cv-menu-button>
    `
  }

  private renderMobileSelectionBar() {
    const selectedCount = this.model.selectedCount()
    const actions = this.model.mobileSelectionActions()

    return html`
      <div class="mobile-selection-bar" role="toolbar" aria-label=${i18n('file-manager:selected-count', {count: String(selectedCount)})}>
        <div class="mobile-selection-count">
          ${i18n('file-manager:selected-count', {count: String(selectedCount)})}
        </div>
        <div class="mobile-selection-actions">
          ${actions.map(
            (action) => html`
              <button
                type="button"
                class="mobile-selection-action"
                data-action=${action.id}
                ?disabled=${Boolean(action.disabled)}
                aria-label=${this.getMobileSelectionActionAriaLabel(action)}
                @click=${this.onMobileSelectionActionClick}
              >
                <cv-icon name=${action.icon} aria-hidden="true"></cv-icon>
                <span>${action.label}</span>
              </button>
            `,
          )}
        </div>
      </div>
    `
  }

  private renderMobileLayout() {
    const selectedCount = this.model.selectedCount()

    return html`
      <section class="workspace-mobile-shell" aria-label=${i18n('navigation:files')}>
        ${this.renderWorkspaceControls(this.filesMobileControlsModel)}
      </section>

      ${selectedCount > 0 ? this.renderMobileSelectionBar() : this.renderMobileActionMenu()}
    `
  }

  private isFilesSurface(): boolean {
    return this.surface === 'files' || this.surface === ''
  }

  private handleSlotChange() {
    this.requestUpdate()
  }

  private hasWorkspaceControls(controls: WorkspaceDashboardHeaderControlsModel | null = this.controlsModel): boolean {
    const hasCountActionsSlot = hasNamedSlotContent(this, 'count-actions')
    if (!controls) return hasCountActionsSlot

    const filterChips = controls.filters ? readModelValue(controls.filters.chips) : []
    const hasFilterLeadingAction = Boolean(controls.filters?.leadingAction)
    const summaryLabel = controls.summary ? readModelValue(controls.summary.label) : ''
    const sortLabel = controls.sort ? readModelValue(controls.sort.label) : ''
    const viewModeOptions = controls.viewMode ? readModelValue(controls.viewMode.options) : []

    return Boolean(
      controls.search ||
        filterChips.length > 0 ||
        hasFilterLeadingAction ||
        summaryLabel ||
        sortLabel ||
        viewModeOptions.length > 0 ||
        hasCountActionsSlot,
    )
  }

  private renderWorkspaceSearch(controls: WorkspaceDashboardHeaderControlsModel | null) {
    const search = controls?.search
    if (!search) return nothing

    const placeholder = search.placeholder ? readModelValue(search.placeholder) : ''
    const label = readModelValue(search.ariaLabel) || placeholder

    return html`
      <cv-input
        class="search-box workspace-search"
        type="search"
        variant="filled"
        preset="search-mobile"
        clearable
        .value=${readModelValue(search.value)}
        placeholder=${placeholder || label}
        aria-label=${label}
        @cv-input=${this.onWorkspaceSearchInput}
        @cv-clear=${this.onWorkspaceSearchClear}
      >
        <cv-icon slot="prefix" name="search" aria-hidden="true"></cv-icon>
        <cv-icon slot="clear-icon" name="x" aria-hidden="true"></cv-icon>
      </cv-input>
    `
  }

  private renderWorkspaceFilterChips(controls: WorkspaceDashboardHeaderControlsModel | null) {
    const filters = controls?.filters
    if (!filters) return nothing

    const chips = readModelValue(filters.chips)
    const leadingAction = filters.leadingAction
    if (chips.length === 0 && !leadingAction) return nothing
    const selectionMode = filters.selectionMode ? readModelValue(filters.selectionMode) : 'single'

    return html`
      <div class="workspace-filter-row">
        ${leadingAction ? this.renderWorkspaceFilterLeadingAction(leadingAction) : nothing}
        ${chips.length === 0
          ? nothing
          : html`
              <cv-chip-group
                class="filter-chips workspace-filter-chips"
                selection-mode=${selectionMode}
                .value=${readModelValue(filters.value)}
                aria-label=${readModelValue(filters.ariaLabel)}
                @cv-input=${this.onWorkspaceFilterInput}
              >
                ${chips.map((chip) => html`
                  <cv-chip
                    class="filter-chip workspace-filter-chip"
                    value=${chip.key}
                    ?selected=${Boolean(chip.active)}
                  >
                    <span class="filter-chip__label workspace-filter-chip__label">${chip.label}</span>
                    ${chip.count === undefined
                      ? nothing
                      : html`<span slot="suffix" class="filter-chip__count workspace-filter-chip__count">${chip.count}</span>`}
                  </cv-chip>
                `)}
              </cv-chip-group>
            `}
      </div>
    `
  }

  private renderWorkspaceFilterLeadingAction(action: WorkspaceDashboardHeaderFilterLeadingActionModel) {
    const label = readModelValue(action.label)
    const ariaLabel = action.ariaLabel ? readModelValue(action.ariaLabel) : label
    const title = action.title ? readModelValue(action.title) : ariaLabel
    const icon = action.icon ? readModelValue(action.icon) : ''
    const showLabel = action.showLabel === undefined ? true : readModelValue(action.showLabel)
    const iconOnly = Boolean(icon && !showLabel)

    return html`
      <cv-button
        class="workspace-filter-leading-action"
        data-filter-action=${action.id ?? 'leading'}
        ?data-icon-only=${iconOnly}
        type="button"
        variant="default"
        size="small"
        aria-label=${ariaLabel}
        title=${title}
        @click=${this.onWorkspaceFilterLeadingActionClick}
      >
        ${icon
          ? html`<cv-icon slot=${iconOnly ? nothing : 'prefix'} name=${icon} aria-hidden="true"></cv-icon>`
          : nothing}
        ${showLabel || !icon ? html`<span>${label}</span>` : nothing}
      </cv-button>
    `
  }

  private renderWorkspaceSortControl(controls: WorkspaceDashboardHeaderControlsModel | null) {
    const sort = controls?.sort
    if (!sort) return nothing

    const sortLabel = readModelValue(sort.label)
    if (!sortLabel) return nothing
    const label = sort.ariaLabel ? readModelValue(sort.ariaLabel) : sortLabel
    const title = sort.title ? readModelValue(sort.title) : label
    const mode = sort.mode ? readModelValue(sort.mode) : ''

    return html`
      <cv-button
        class="sort-control workspace-sort-control"
        type="button"
        aria-label=${label}
        title=${title}
        data-sort-mode=${mode}
        @click=${this.onWorkspaceSortClick}
      >
        <cv-icon slot="prefix" name="arrow-up-down" aria-hidden="true"></cv-icon>
        <span class="sort-control__label workspace-sort-label">${sortLabel}</span>
      </cv-button>
    `
  }

  private renderWorkspaceViewModeSwitch(controls: WorkspaceDashboardHeaderControlsModel | null) {
    const viewMode = controls?.viewMode
    if (!viewMode) return nothing

    const options = readModelValue(viewMode.options)
    if (options.length === 0) return nothing
    const value = readModelValue(viewMode.value)

    return html`
      <cv-radio-group
        class="view-switch workspace-view-switch"
        variant="segmented"
        .value=${value}
        aria-label=${readModelValue(viewMode.ariaLabel)}
        @cv-input=${this.onWorkspaceViewModeInput}
      >
        ${options.map((option) => {
          const active = value === option.value
          return html`
            <cv-radio
              class="view-switch__button workspace-view-button"
              value=${option.value}
              data-display-mode=${option.value}
              aria-label=${option.label}
              ?checked=${active}
              title=${option.label}
            >
              <cv-icon class="view-switch__icon workspace-view-icon" name=${option.icon} aria-hidden="true"></cv-icon>
              <span class="sr-only">${option.label}</span>
            </cv-radio>
          `
        })}
      </cv-radio-group>
    `
  }

  private renderWorkspaceCountRow(controls: WorkspaceDashboardHeaderControlsModel | null) {
    const summaryLabel = controls?.summary ? readModelValue(controls.summary.label) : ''
    const summaryItems = controls?.summary?.items ? readModelValue(controls.summary.items) : []
    const sortLabel = controls?.sort ? readModelValue(controls.sort.label) : ''
    const viewModeOptions = controls?.viewMode ? readModelValue(controls.viewMode.options) : []
    const hasCountActionsSlot = hasNamedSlotContent(this, 'count-actions')
    if (!summaryLabel && summaryItems.length === 0 && !sortLabel && viewModeOptions.length === 0 && !hasCountActionsSlot) return nothing

    return html`
      <div class="count-row workspace-count-row">
        ${this.renderWorkspaceSummary(summaryLabel, summaryItems)}
        <div class="count-row__actions workspace-count-actions">
          ${this.renderWorkspaceSortControl(controls)}
          ${this.renderWorkspaceViewModeSwitch(controls)}
          <slot name="count-actions" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `
  }

  private renderWorkspaceSummary(label: string, items: WorkspaceDashboardHeaderSummaryItem[]) {
    if (items.length > 0) {
      const accessibleLabel = label || items.map((item) => `${item.label}: ${item.value}`).join(', ')

      return html`
        <span
          class="count-row__label workspace-summary workspace-summary--compact"
          aria-label=${accessibleLabel}
          title=${accessibleLabel}
        >
          <span class="sr-only">${accessibleLabel}</span>
          ${items.map(
            (item) => html`
              <span class="workspace-summary__item" data-summary-id=${item.id} aria-hidden="true">
                <cv-icon name=${item.icon}></cv-icon>
                <span class="workspace-summary__value">${item.value}</span>
              </span>
            `,
          )}
        </span>
      `
    }

    return label
      ? html`<span class="count-row__label workspace-summary">${label}</span>`
      : html`<span class="count-row__label workspace-summary" aria-hidden="true"></span>`
  }

  private renderWorkspaceControls(controls: WorkspaceDashboardHeaderControlsModel | null = this.controlsModel) {
    return html`
      <div class="workspace-controls" part="controls">
        ${this.renderWorkspaceSearch(controls)}
        ${this.renderWorkspaceFilterChips(controls)}
        ${this.renderWorkspaceCountRow(controls)}
      </div>
    `
  }

  private renderGenericDesktopLayout() {
    const hasLeadingSlot = hasNamedSlotContent(this, 'leading')
    const hasTitleSlot = hasNamedSlotContent(this, 'title')
    const hasSubtitleSlot = hasNamedSlotContent(this, 'subtitle')
    const hasStartSlot = hasNamedSlotContent(this, 'start')
    const controls = this.controlsModel
    const hasControls = this.hasWorkspaceControls(controls)
    const hasCenterSlot = hasNamedSlotContent(this, 'center')
    const hasActionsSlot = hasNamedSlotContent(this, 'actions')
    const hasEndSlot = hasNamedSlotContent(this, 'end')

    return html`
      <dashboard-header surface=${this.surface} ?two-row=${this.twoRow}>
        <div slot="leading" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasLeadingSlot}>
          <slot name="leading" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="title" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasTitleSlot}>
          <slot name="title" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="subtitle" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasSubtitleSlot}>
          <slot name="subtitle" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="start" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasStartSlot}>
          <slot name="start" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="center" class="slot-forwarder" ?data-slot-forwarder=${!hasControls} ?hidden=${!hasCenterSlot && !hasControls}>
          ${hasControls ? this.renderWorkspaceControls(controls) : nothing}
          <slot name="center" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="actions" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasActionsSlot}>
          <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="end" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasEndSlot}>
          <slot name="end" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </dashboard-header>
    `
  }

  private renderFilesDesktopLayout() {
    return html`
      <div class="files-desktop-header">
        <dashboard-header class="files-dashboard-toolbar" surface="files">
          <div slot="center" class="files-toolbar-row">
            <div class="breadcrumbs-section">${this.renderBreadcrumbs()}</div>
            <span class="files-toolbar-spacer" aria-hidden="true"></span>
            <div class="filters-section">${this.renderFilters()}</div>
            <span class="files-toolbar-divider" aria-hidden="true"></span>
            ${this.renderViewModeControls()} ${this.renderSelectionActions()}
            <span class="files-toolbar-divider" aria-hidden="true"></span>
            ${this.renderPrimaryActions()}
          </div>
        </dashboard-header>
        ${this.renderContextStrip()}
      </div>
    `
  }

  protected render() {
    if (!this.isFilesSurface()) {
      if (this.embedded) {
        return this.hasWorkspaceControls() ? this.renderWorkspaceControls() : nothing
      }

      return this.renderGenericDesktopLayout()
    }

    return html`
      ${this.model.isMobile() ? this.renderMobileLayout() : this.renderFilesDesktopLayout()}
      <input id="file-input" type="file" multiple @change=${this.onFileInputChange} />
    `
  }
}
