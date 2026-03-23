declare global {
  interface HTMLElementTagNameMap {
    'cv-accordion': import('./cv-accordion').CVAccordion
    'cv-accordion-item': import('./cv-accordion-item').CVAccordionItem
    'cv-alert': import('./cv-alert').CVAlert
    'cv-alert-dialog': import('./cv-alert-dialog').CVAlertDialog
    'cv-badge': import('./cv-badge').CVBadge
    'cv-breadcrumb': import('./cv-breadcrumb').CVBreadcrumb
    'cv-breadcrumb-item': import('./cv-breadcrumb-item').CVBreadcrumbItem
    'cv-button': import('./cv-button').CVButton
    'cv-card': import('./cv-card').CVCard
    'cv-carousel': import('./cv-carousel').CVCarousel
    'cv-carousel-slide': import('./cv-carousel-slide').CVCarouselSlide
    'cv-checkbox': import('./cv-checkbox').CVCheckbox
    'cv-combobox': import('./cv-combobox').CVCombobox
    'cv-combobox-group': import('./cv-combobox-group').CVComboboxGroup
    'cv-combobox-option': import('./cv-combobox-option').CVComboboxOption
    'cv-command-item': import('./cv-command-item').CVCommandItem
    'cv-command-palette': import('./cv-command-palette').CVCommandPalette
    'cv-context-menu': import('./cv-context-menu').CVContextMenu
    'cv-copy-button': import('./cv-copy-button').CVCopyButton
    'cv-date-picker': import('./cv-date-picker').CVDatePicker
    'cv-dialog': import('./cv-dialog').CVDialog
    'cv-drawer': import('./cv-drawer').CVDrawer
    'cv-disclosure': import('./cv-disclosure').CVDisclosure
    'cv-feed': import('./cv-feed').CVFeed
    'cv-feed-article': import('./cv-feed-article').CVFeedArticle
    'cv-grid': import('./cv-grid').CVGrid
    'cv-grid-cell': import('./cv-grid-cell').CVGridCell
    'cv-grid-column': import('./cv-grid-column').CVGridColumn
    'cv-grid-row': import('./cv-grid-row').CVGridRow
    'cv-icon': import('./cv-icon').CVIcon
    'cv-input': import('./cv-input').CVInput
    'cv-landmark': import('./cv-landmark').CVLandmark
    'cv-link': import('./cv-link').CVLink
    'cv-listbox': import('./cv-listbox').CVListbox
    'cv-listbox-group': import('./cv-listbox-group').CVListboxGroup
    'cv-menu': import('./cv-menu').CVMenu
    'cv-menu-button': import('./cv-menu-button').CVMenuButton
    'cv-menu-group': import('./cv-menu-group').CVMenuGroup
    'cv-menu-item': import('./cv-menu-item').CVMenuItem
    'cv-meter': import('./cv-meter').CVMeter
    'cv-number': import('./cv-number').CVNumber
    'cv-option': import('./cv-option').CVOption
    'cv-popover': import('./cv-popover').CVPopover
    'cv-progress': import('./cv-progress').CVProgress
    'cv-progress-ring': import('./cv-progress-ring').CVProgressRing
    'cv-radio': import('./cv-radio').CVRadio
    'cv-radio-group': import('./cv-radio-group').CVRadioGroup
    'cv-select': import('./cv-select').CVSelect
    'cv-select-group': import('./cv-select-group').CVSelectGroup
    'cv-select-option': import('./cv-select-option').CVSelectOption
    'cv-sidebar': import('./cv-sidebar').CVSidebar
    'cv-sidebar-item': import('./cv-sidebar-item').CVSidebarItem
    'cv-slider': import('./cv-slider').CVSlider
    'cv-slider-multi-thumb': import('./cv-slider-multi-thumb').CVSliderMultiThumb
    'cv-spinbutton': import('./cv-spinbutton').CVSpinbutton
    'cv-spinner': import('./cv-spinner').CVSpinner
    'cv-switch': import('./cv-switch').CVSwitch
    'cv-tab': import('./cv-tab').CVTab
    'cv-tab-panel': import('./cv-tab-panel').CVTabPanel
    'cv-table': import('./cv-table').CVTable
    'cv-table-cell': import('./cv-table-cell').CVTableCell
    'cv-table-column': import('./cv-table-column').CVTableColumn
    'cv-table-row': import('./cv-table-row').CVTableRow
    'cv-tabs': import('./cv-tabs').CVTabs
    'cv-textarea': import('./cv-textarea').CVTextarea
    'cv-toast': import('./cv-toast').CVToast
    'cv-toast-region': import('./cv-toast-region').CVToastRegion
    'cv-toolbar': import('./cv-toolbar').CVToolbar
    'cv-toolbar-item': import('./cv-toolbar-item').CVToolbarItem
    'cv-toolbar-separator': import('./cv-toolbar-separator').CVToolbarSeparator
    'cv-tooltip': import('./cv-tooltip').CVTooltip
    'cv-treegrid': import('./cv-treegrid').CVTreegrid
    'cv-treegrid-cell': import('./cv-treegrid-cell').CVTreegridCell
    'cv-treegrid-column': import('./cv-treegrid-column').CVTreegridColumn
    'cv-treegrid-row': import('./cv-treegrid-row').CVTreegridRow
    'cv-treeitem': import('./cv-treeitem').CVTreeItem
    'cv-treeview': import('./cv-treeview').CVTreeview
    'cv-window-splitter': import('./cv-window-splitter').CVWindowSplitter
  }

  interface GlobalEventHandlersEventMap {
    'cv-accordion-item-trigger-click': import('./cv-accordion-item').CVAccordionItemTriggerClickEvent
    'cv-accordion-item-trigger-focus': import('./cv-accordion-item').CVAccordionItemTriggerFocusEvent
    'cv-accordion-item-trigger-keydown': import('./cv-accordion-item').CVAccordionItemTriggerKeydownEvent
    'cv-action':
      | import('./cv-alert-dialog').CVAlertDialogActionEvent
      | import('./cv-menu-button').CVMenuButtonActionEvent
    'cv-blur':
      | import('./cv-input').CVInputBlurEvent
      | import('./cv-number').CVNumberBlurEvent
      | import('./cv-textarea').CVTextareaBlurEvent
    'cv-change':
      | import('./cv-checkbox').CVCheckboxChangeEvent
      | import('./cv-input').CVInputChangeEvent
      | import('./cv-number').CVNumberChangeEvent
      | import('./cv-select').CVSelectChangeEvent
      | import('./cv-sidebar').CVSidebarChangeEvent
      | import('./cv-switch').CVSwitchChangeEvent
      | import('./cv-textarea').CVTextareaChangeEvent
    'cv-cancel': import('./cv-alert-dialog').CVAlertDialogCancelEvent
    'cv-clear':
      | import('./cv-combobox').CVComboboxClearEvent
      | import('./cv-input').CVInputClearEvent
      | import('./cv-number').CVNumberClearEvent
    'cv-close':
      | import('./cv-tab').CVTabCloseEvent
      | import('./cv-toast').CVToastCloseEvent
      | import('./cv-toast-region').CVToastRegionCloseEvent
    'cv-copy': import('./cv-copy-button').CVCopyButtonCopyEvent
    'cv-error': import('./cv-copy-button').CVCopyButtonErrorEvent
    'cv-execute': import('./cv-command-palette').CVCommandPaletteExecuteEvent
    'cv-exit-after': import('./cv-feed').CVFeedExitAfterEvent
    'cv-exit-before': import('./cv-feed').CVFeedExitBeforeEvent
    'cv-focus':
      | import('./cv-input').CVInputFocusEvent
      | import('./cv-number').CVNumberFocusEvent
      | import('./cv-textarea').CVTextareaFocusEvent
    'cv-focus-change': import('./cv-table').CVTableFocusChangeEvent
    'cv-grid-row-slotchange': import('./cv-grid-row').CVGridRowSlotchangeEvent
    'cv-input':
      | import('./cv-checkbox').CVCheckboxInputEvent
      | import('./cv-input').CVInputInputEvent
      | import('./cv-select').CVSelectInputEvent
      | import('./cv-sidebar').CVSidebarInputEvent
      | import('./cv-switch').CVSwitchInputEvent
      | import('./cv-textarea').CVTextareaInputEvent
    'cv-load-more': import('./cv-feed').CVFeedLoadMoreEvent
    'cv-load-newer': import('./cv-feed').CVFeedLoadNewerEvent
    'cv-selection-change': import('./cv-table').CVTableSelectionChangeEvent
    'cv-scrollspy-change': import('./cv-sidebar').CVSidebarScrollspyChangeEvent
    'cv-table-row-slotchange': import('./cv-table-row').CVTableRowSlotchangeEvent
    'cv-treegrid-row-slotchange': import('./cv-treegrid-row').CVTreegridRowSlotchangeEvent
    'cv-treeitem-toggle': import('./cv-treeitem').CVTreeItemToggleEvent
  }
}

export {}
