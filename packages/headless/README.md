The goal of this package is to provide a standalone headless foundation for a future UI kit,
built on Reatom v1000 and WAI-ARIA APG behavior contracts.

The visual UI kit is intentionally out of scope for this package.

Architecture decisions and delivery artifacts:

- `./specs/ADR-001-headless-architecture.md`
- `./specs/IMPLEMENTATION-ROADMAP.md`
- `./specs/ISSUE-BACKLOG.md`
- `./specs/RELEASE-CANDIDATE.md`
- `./specs/release/mvp-changelog.md`

## Implemented components

- `listbox` (`src/listbox/`, `specs/components/listbox.md`)
- `combobox` (`src/combobox/`, `specs/components/combobox.md`)
- `menu` (`src/menu/`, `specs/components/menu.md`)
- `tabs` (`src/tabs/`, `specs/components/tabs.md`)
- `treeview` (`src/treeview/`, `specs/components/treeview.md`)
- `alert` (`src/alert/`, `specs/components/alert.md`)
- `breadcrumb` (`src/breadcrumb/`, `specs/components/breadcrumb.md`)
- `landmarks` (`src/landmarks/`, `specs/components/landmarks.md`)
- `meter` (`src/meter/`, `specs/components/meter.md`)
- `link` (`src/link/`, `specs/components/link.md`)
- `table` (`src/table/`, `specs/components/table.md`)
- `button` (`src/button/`, `specs/components/button.md`)
- `checkbox` (`src/checkbox/`, `specs/components/checkbox.md`)
- `switch` (`src/switch/`, `specs/components/switch.md`)
- `radio-group` (`src/radio-group/`, `specs/components/radio-group.md`)
- `slider` (`src/slider/`, `specs/components/slider.md`)
- `spinbutton` (`src/spinbutton/`, `specs/components/spinbutton.md`)
- `slider-multi-thumb` (`src/slider-multi-thumb/`, `specs/components/slider-multi-thumb.md`)
- `disclosure` (`src/disclosure/`, `specs/components/disclosure.md`)
- `accordion` (`src/accordion/`, `specs/components/accordion.md`)
- `dialog` (`src/dialog/`, `specs/components/dialog.md`)
- `alert-dialog` (`src/alert-dialog/`, `specs/components/alert-dialog.md`)
- `tooltip` (`src/tooltip/`, `specs/components/tooltip.md`)
- `menu-button` (`src/menu-button/`, `specs/components/menu-button.md`)
- `toolbar` (`src/toolbar/`, `specs/components/toolbar.md`)
- `grid` (`src/grid/`, `specs/components/grid.md`)
- `treegrid` (`src/treegrid/`, `specs/components/treegrid.md`)
- `feed` (`src/feed/`, `specs/components/feed.md`)
- `carousel` (`src/carousel/`, `specs/components/carousel.md`)
- `window-splitter` (`src/window-splitter/`, `specs/components/window-splitter.md`)

## MVP-next scaffolds (not finalized)

- `popover` (`src/popover/`, `specs/components/popover.md`)
- `select` (`src/select/`, `specs/components/select.md`)
- `context-menu` (`src/context-menu/`, `specs/components/context-menu.md`)
- `command-palette` (`src/command-palette/`, `specs/components/command-palette.md`)
- `toast` (`src/toast/`, `specs/components/toast.md`)
- `progress` (`src/progress/`, `specs/components/progress.md`)

## Shared layers

- `src/core/` - selection and value-range state primitives
- `src/interactions/` - keyboard intents, typeahead, composite navigation, overlay focus
- `src/a11y-contracts/` - typed aria/role contracts
- `src/adapters/` - adapter contracts and integration coverage

## Conventions

- each component lives in a dedicated directory: `src/<component>/`
- each component has a dedicated contract spec: `specs/components/<component>.md`
- package must remain independent from monorepo-only imports (`@project/*`, `apps/*`)
