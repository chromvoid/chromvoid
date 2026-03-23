/// <reference path="./components/global-elements-events.d.ts" />

import {CVAccordion} from './components/cv-accordion'
import {CVAccordionItem} from './components/cv-accordion-item'
import {CVAlertDialog} from './components/cv-alert-dialog'
import {CVAlert} from './components/cv-alert'
import {CVBreadcrumb} from './components/cv-breadcrumb'
import {CVBreadcrumbItem} from './components/cv-breadcrumb-item'
import {CVBadge} from './components/cv-badge'
import {CVButton} from './components/cv-button'
import {CVCallout} from './components/cv-callout'
import {CVCard} from './components/cv-card'
import {CVCopyButton} from './components/cv-copy-button'
import {CVCarousel} from './components/cv-carousel'
import {CVCarouselSlide} from './components/cv-carousel-slide'
import {CVCheckbox} from './components/cv-checkbox'
import {CVCommandItem} from './components/cv-command-item'
import {CVCommandPalette} from './components/cv-command-palette'
import {CVCombobox} from './components/cv-combobox'
import {CVComboboxOption} from './components/cv-combobox-option'
import {CVContextMenu} from './components/cv-context-menu'
import {CVDisclosure} from './components/cv-disclosure'
import {CVDatePicker} from './components/cv-date-picker'
import {CVDialog} from './components/cv-dialog'
import {CVDrawer} from './components/cv-drawer'
import {CVFeed} from './components/cv-feed'
import {CVFeedArticle} from './components/cv-feed-article'
import {CVGridCell} from './components/cv-grid-cell'
import {CVGridColumn} from './components/cv-grid-column'
import {CVGridRow} from './components/cv-grid-row'
import {CVGrid} from './components/cv-grid'
import {
  CVIcon,
  getIconBasePath,
  registerIconCollection,
  setIconBasePath,
  unregisterIconCollection,
} from './components/cv-icon'
import {CVInput} from './components/cv-input'
import {CVLandmark} from './components/cv-landmark'
import {CVListbox} from './components/cv-listbox'
import {CVLink} from './components/cv-link'
import {CVMenu} from './components/cv-menu'
import {CVMenuButton} from './components/cv-menu-button'
import {CVMenuItem} from './components/cv-menu-item'
import {CVMeter} from './components/cv-meter'
import {CVNumber} from './components/cv-number'
import {CVOption} from './components/cv-option'
import {CVPopover} from './components/cv-popover'
import {CVProgress} from './components/cv-progress'
import {CVProgressRing} from './components/cv-progress-ring'
import {CVRadio} from './components/cv-radio'
import {CVRadioGroup} from './components/cv-radio-group'
import {CVSelect} from './components/cv-select'
import {CVSidebar} from './components/cv-sidebar'
import {CVSidebarItem} from './components/cv-sidebar-item'
import {CVSelectGroup} from './components/cv-select-group'
import {CVSelectOption} from './components/cv-select-option'
import {CVSlider} from './components/cv-slider'
import {CVSliderMultiThumb} from './components/cv-slider-multi-thumb'
import {CVSpinbutton} from './components/cv-spinbutton'
import {CVSpinner} from './components/cv-spinner'
import {CVSwitch} from './components/cv-switch'
import {CVTableCell} from './components/cv-table-cell'
import {CVTableColumn} from './components/cv-table-column'
import {CVTableRow} from './components/cv-table-row'
import {CVTable} from './components/cv-table'
import {CVTextarea} from './components/cv-textarea'
import {CVTab} from './components/cv-tab'
import {CVTabPanel} from './components/cv-tab-panel'
import {CVTabs} from './components/cv-tabs'
import {CVToastRegion} from './components/cv-toast-region'
import {CVTreegrid} from './components/cv-treegrid'
import {CVTreegridCell} from './components/cv-treegrid-cell'
import {CVTreegridColumn} from './components/cv-treegrid-column'
import {CVTreegridRow} from './components/cv-treegrid-row'
import {CVTreeItem} from './components/cv-treeitem'
import {CVTreeview} from './components/cv-treeview'
import {CVToolbar} from './components/cv-toolbar'
import {CVToolbarItem} from './components/cv-toolbar-item'
import {CVTooltip} from './components/cv-tooltip'
import {CVWindowSplitter} from './components/cv-window-splitter'
import {CVThemeProvider} from './theme/cv-theme-provider'

export {
  CVAccordion,
  CVAccordionItem,
  CVAlertDialog,
  CVAlert,
  CVBreadcrumb,
  CVBreadcrumbItem,
  CVBadge,
  CVButton,
  CVCallout,
  CVCard,
  CVCopyButton,
  CVCarousel,
  CVCarouselSlide,
  CVCheckbox,
  CVCommandItem,
  CVCommandPalette,
  CVCombobox,
  CVComboboxOption,
  CVContextMenu,
  CVDisclosure,
  CVDatePicker,
  CVDialog,
  CVDrawer,
  CVFeed,
  CVFeedArticle,
  CVGridCell,
  CVGridColumn,
  CVGridRow,
  CVGrid,
  CVIcon,
  CVInput,
  CVLandmark,
  CVListbox,
  CVLink,
  CVMenu,
  CVMenuButton,
  CVMenuItem,
  CVMeter,
  CVNumber,
  CVOption,
  CVPopover,
  CVProgress,
  CVProgressRing,
  CVRadio,
  CVRadioGroup,
  CVSelect,
  CVSidebar,
  CVSidebarItem,
  CVSelectGroup,
  CVSelectOption,
  CVSlider,
  CVSliderMultiThumb,
  CVSpinbutton,
  CVSpinner,
  CVSwitch,
  CVTableCell,
  CVTableColumn,
  CVTableRow,
  CVTable,
  CVTextarea,
  CVTab,
  CVTabPanel,
  CVTabs,
  CVToastRegion,
  CVTreegrid,
  CVTreegridCell,
  CVTreegridColumn,
  CVTreegridRow,
  CVTreeItem,
  CVTreeview,
  CVToolbar,
  CVToolbarItem,
  CVTooltip,
  CVWindowSplitter,
  CVThemeProvider,
}

export {createToastController} from './toast/create-toast-controller'
export type {CVToastController} from './toast/create-toast-controller'
export type {ToastRegionPosition} from './components/cv-toast-region'
export {getIconBasePath, registerIconCollection, setIconBasePath, unregisterIconCollection}
export {createDialogController} from './dialog/create-dialog-controller'
export type {
  CustomDialogOptions,
  DialogController,
  DialogControllerAdapters,
  DialogPriority,
  ManagedDialogOptions,
} from './dialog/create-dialog-controller'

export {defineTheme, getTheme, applyTheme} from './theme/theme-engine'
export type {CVThemeDefinition, CVThemeTarget, CVThemeTokenName, CVThemeTokens} from './theme/types'
export type {
  CVAccordionItemEventMap,
  CVAccordionItemTriggerClickEvent,
  CVAccordionItemTriggerFocusEvent,
  CVAccordionItemTriggerKeydownDetail,
  CVAccordionItemTriggerKeydownEvent,
} from './components/cv-accordion-item'
export type {
  CVComboboxChangeEvent,
  CVComboboxClearEvent,
  CVComboboxEventDetail,
  CVComboboxEventMap,
  CVComboboxInputEvent,
} from './components/cv-combobox'
export type {
  CVCopyButtonCopyDetail,
  CVCopyButtonCopyEvent,
  CVCopyButtonErrorDetail,
  CVCopyButtonErrorEvent,
  CVCopyButtonEventMap,
} from './components/cv-copy-button'
export type {
  CVFeedEventMap,
  CVFeedExitAfterEvent,
  CVFeedExitBeforeEvent,
  CVFeedLoadMoreEvent,
  CVFeedLoadNewerEvent,
} from './components/cv-feed'
export type {CVGridRowEventMap, CVGridRowSlotchangeEvent} from './components/cv-grid-row'
export type {
  CVCheckboxChangeEvent,
  CVCheckboxEventDetail,
  CVCheckboxEventMap,
  CVCheckboxInputEvent,
} from './components/cv-checkbox'
export type {
  CVInputBlurEvent,
  CVInputChangeEvent,
  CVInputClearEvent,
  CVInputEventMap,
  CVInputFocusEvent,
  CVInputInputEvent,
  CVInputValueDetail,
} from './components/cv-input'
export type {
  CVMenuButtonActionEvent,
  CVMenuButtonChangeEvent,
  CVMenuButtonEventDetail,
  CVMenuButtonEventMap,
  CVMenuButtonInputEvent,
} from './components/cv-menu-button'
export type {
  CVNumberBlurEvent,
  CVNumberChangeEvent,
  CVNumberClearEvent,
  CVNumberEventMap,
  CVNumberFocusEvent,
  CVNumberValueDetail,
} from './components/cv-number'
export type {
  CVSelectChangeEvent,
  CVSelectEventDetail,
  CVSelectEventMap,
  CVSelectInputEvent,
} from './components/cv-select'
export type {
  CVSidebarChangeDetail,
  CVSidebarChangeEvent,
  CVSidebarEventMap,
  CVSidebarInputDetail,
  CVSidebarInputEvent,
  CVSidebarScrollspyChangeDetail,
  CVSidebarScrollspyChangeEvent,
  CVSidebarScrollspyStrategy,
} from './components/cv-sidebar'
export type {
  CVTableChangeEvent,
  CVTableEventDetail,
  CVTableEventMap,
  CVTableFocusChangeDetail,
  CVTableFocusChangeEvent,
  CVTableInputEvent,
  CVTableSelectionChangeDetail,
  CVTableSelectionChangeEvent,
} from './components/cv-table'
export type {CVTableRowEventMap, CVTableRowSlotchangeEvent} from './components/cv-table-row'
export type {
  CVSwitchChangeEvent,
  CVSwitchCheckedDetail,
  CVSwitchEventMap,
  CVSwitchInputEvent,
} from './components/cv-switch'
export type {
  CVTextareaBlurEvent,
  CVTextareaChangeEvent,
  CVTextareaEventMap,
  CVTextareaFocusEvent,
  CVTextareaInputEvent,
  CVTextareaValueDetail,
} from './components/cv-textarea'
export type {CVTreegridRowEventMap, CVTreegridRowSlotchangeEvent} from './components/cv-treegrid-row'
export type {
  CVTreeItemEventMap,
  CVTreeItemToggleDetail,
  CVTreeItemToggleEvent,
} from './components/cv-treeitem'

export {ReatomLitElement, setUnoUtilities} from './reatom-lit/ReatomLitElement'
export {withReatomElement} from './reatom-lit/withReatomElement'
export {watch} from './reatom-lit/watch'
export {html, svg} from './reatom-lit/html'

export {
  createAccordion,
  createAlertDialog,
  createAlert,
  createBreadcrumb,
  createButton,
  createCarousel,
  createCheckbox,
  createCommandPalette,
  createCombobox,
  createContextMenu,
  createDatePicker,
  createDisclosure,
  createDialog,
  createFeed,
  createGrid,
  createLandmark,
  createLink,
  createListbox,
  createMenu,
  createMenuButton,
  createMeter,
  createPopover,
  createProgress,
  createRadioGroup,
  createSelect,
  createSlider,
  createSpinbutton,
  createSwitch,
  createTabs,
  createToast,
  createTreeview,
  createToolbar,
  createTooltip,
  createWindowSplitter,
  type CreateAccordionOptions,
  type AccordionModel,
  type CreateAlertDialogOptions,
  type AlertDialogModel,
  type CreateAlertOptions,
  type AlertModel,
  type CreateBreadcrumbOptions,
  type BreadcrumbModel,
  type CreateButtonOptions,
  type ButtonModel,
  type CreateCarouselOptions,
  type CarouselModel,
  type CarouselSlide,
  type CreateCheckboxOptions,
  type CheckboxModel,
  type CreateCommandPaletteOptions,
  type CommandPaletteModel,
  type CreateComboboxOptions,
  type ComboboxModel,
  type CreateDatePickerOptions,
  type DatePickerModel,
  type CreateContextMenuOptions,
  type ContextMenuModel,
  type CreateDisclosureOptions,
  type DisclosureModel,
  type CreateDialogOptions,
  type DialogModel,
  type CreateFeedOptions,
  type FeedModel,
  type CreateGridOptions,
  type GridCellId,
  type GridFocusStrategy,
  type GridModel,
  type GridSelectionMode,
  type CreateLandmarkOptions,
  type LandmarkModel,
  type LandmarkType,
  type CreateLinkOptions,
  type LinkModel,
  type CreateListboxOptions,
  type ListboxModel,
  type CreateMenuOptions,
  type MenuModel,
  type CreateMenuButtonOptions,
  type MenuButtonModel,
  type CreateMeterOptions,
  type MeterModel,
  type CreatePopoverOptions,
  type PopoverModel,
  type CreateProgressOptions,
  type ProgressModel,
  type CreateRadioGroupOptions,
  type RadioGroupModel,
  type CreateSelectOptions,
  type SelectModel,
  type CreateSliderOptions,
  type SliderModel,
  createSliderMultiThumb,
  type CreateSliderMultiThumbOptions,
  type SliderMultiThumbModel,
  type SliderMultiThumbOrientation,
  createTable,
  type CreateTableOptions,
  type TableModel,
  type TableSortDirection,
  type CreateSpinbuttonOptions,
  type SpinbuttonModel,
  type CreateSwitchOptions,
  type SwitchModel,
  type CreateTabsOptions,
  type TabsModel,
  type CreateToastOptions,
  type ToastModel,
  type ToastItem,
  type CreateTreeviewOptions,
  type TreeNode,
  type TreeviewModel,
  createTreegrid,
  type CreateTreegridOptions,
  type TreegridCellId,
  type TreegridModel,
  type TreegridRow,
  type TreegridSelectionMode,
  type TreegridCellRole,
  type CreateToolbarOptions,
  type ToolbarModel,
  type CreateTooltipOptions,
  type TooltipModel,
  type CreateWindowSplitterOptions,
  type WindowSplitterModel,
} from '@chromvoid/headless-ui'

export function registerUikit(): void {
  CVThemeProvider.define()
  CVAccordionItem.define()
  CVAccordion.define()
  CVAlertDialog.define()
  CVAlert.define()
  CVBreadcrumbItem.define()
  CVBreadcrumb.define()
  CVBadge.define()
  CVButton.define()
  CVCard.define()
  CVCopyButton.define()
  CVCarouselSlide.define()
  CVCarousel.define()
  CVCheckbox.define()
  CVCommandItem.define()
  CVCommandPalette.define()
  CVComboboxOption.define()
  CVCombobox.define()
  CVContextMenu.define()
  CVDisclosure.define()
  CVDatePicker.define()
  CVDialog.define()
  CVDrawer.define()
  CVFeedArticle.define()
  CVFeed.define()
  CVGridCell.define()
  CVGridColumn.define()
  CVGridRow.define()
  CVGrid.define()
  CVInput.define()
  CVLandmark.define()
  CVOption.define()
  CVListbox.define()
  CVLink.define()
  CVMenuItem.define()
  CVMenu.define()
  CVMenuButton.define()
  CVMeter.define()
  CVPopover.define()
  CVProgress.define()
  CVProgressRing.define()
  CVRadio.define()
  CVRadioGroup.define()
  CVSelectOption.define()
  CVSelectGroup.define()
  CVSelect.define()
  CVSlider.define()
  CVSliderMultiThumb.define()
  CVSpinbutton.define()
  CVSpinner.define()
  CVSwitch.define()
  CVTableCell.define()
  CVTableColumn.define()
  CVTableRow.define()
  CVTable.define()
  CVTextarea.define()
  CVTab.define()
  CVTabPanel.define()
  CVTabs.define()
  CVToastRegion.define()
  CVTreegrid.define()
  CVTreegridColumn.define()
  CVTreegridCell.define()
  CVTreegridRow.define()
  CVTreeItem.define()
  CVTreeview.define()
  CVToolbarItem.define()
  CVToolbar.define()
  CVTooltip.define()
  CVWindowSplitter.define()
}
