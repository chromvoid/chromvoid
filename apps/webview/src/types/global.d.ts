import type {
  CVBadge,
  CVBreadcrumb,
  CVBreadcrumbItem,
  CVButton,
  CVCallout,
  CVCheckbox,
  CVDialog,
  CVDrawer,
  CVIcon,
  CVInput,
  CVMenuButton,
  CVMenuItem,
  CVNumber,
  CVProgress,
  CVProgressRing,
  CVSelect,
  CVSelectGroup,
  CVSelectOption,
  CVTab,
  CVTabPanel,
  CVTabs,
  CVTextarea,
  CVToolbar,
  CVToolbarItem,
  CVToolbarSeparator,
  CVTooltip,
} from '@chromvoid/uikit'
import type {BreadcrumbsNav} from '../features/file-manager/components/breadcrumbs-nav'
import type {ContextMenu} from '../features/file-manager/components/context-menu'
import type {DashboardDropzone} from '../features/file-manager/components/dashboard-dropzone'
import type {DashboardFileList} from '../features/file-manager/components/dashboard-file-list'
import type {DashboardHeader} from '../features/file-manager/components/dashboard-header'
import type {DashboardNotifications} from '../features/file-manager/components/dashboard-notifications'
import type {FileItem} from '../features/file-manager/components/file-item'
import type {FileSearch} from '../features/file-manager/components/file-search'
import type {StatusBar as Footer} from '../features/file-manager/components/footer'
import type {StatusBar} from '../features/shell/components/status-bar'
import type {UploadProgressDesktop} from '../features/file-manager/components/upload-progress-desktop'
import type {UploadProgressMobile} from '../features/file-manager/components/upload-progress-mobile'
import type {UploadProgress} from '../features/file-manager/components/upload-progress'
import type {VirtualFileList} from '../features/file-manager/components/virtual-file-list'
import type {FileManager} from '../features/file-manager/file-manager'
import type {Router} from '../router'
import type {ChromVoidActions} from '../core/state/app-actions'
import type {ChromVoidState} from '../core/state/app-state'
import type {CatalogService} from '../core/catalog/catalog'
import type {TransportLike} from '../core/transport/transport'
import type {Store} from '../store'

// Vite raw imports
declare module '*.css?raw' {
  const content: string
  export default content
}

declare global {
  interface Window {
    env: 'dev' | 'prod'
    __PM_LOG__: boolean
    __chromvoidHandleAndroidBack?: () => boolean
    state: ChromVoidState
    actions: ChromVoidActions
    ws: TransportLike
    router: Router
    store: Store
    catalog: CatalogService
  }

  interface HTMLElementTagNameMap {
    'cv-button': CVButton
    'cv-toolbar': CVToolbar
    'cv-toolbar-item': CVToolbarItem
    'cv-toolbar-separator': CVToolbarSeparator
    'cv-badge': CVBadge
    'cv-breadcrumb': CVBreadcrumb
    'cv-breadcrumb-item': CVBreadcrumbItem
    'cv-checkbox': CVCheckbox
    'cv-callout': CVCallout
    'cv-dialog': CVDialog
    'cv-drawer': CVDrawer
    'cv-icon': CVIcon
    'cv-tab': CVTab
    'cv-tab-panel': CVTabPanel
    'cv-tabs': CVTabs
    'cv-tooltip': CVTooltip
    'cv-progress': CVProgress
    'cv-progress-ring': CVProgressRing

    // ChromVoid UI components
    'upload-task-item': HTMLElement
    'cv-input': CVInput
    'cv-menu-button': CVMenuButton
    'cv-menu-item': CVMenuItem
    'cv-number': CVNumber
    'cv-select': CVSelect
    'cv-select-group': CVSelectGroup
    'cv-select-option': CVSelectOption
    'cv-textarea': CVTextarea

    'theme-toggle': HTMLElement

    'breadcrumbs-nav': BreadcrumbsNav
    'context-menu': ContextMenu
    'file-item': FileItem
    'file-search': FileSearch
    'dashboard-header': DashboardHeader
    'dashboard-notifications': DashboardNotifications
    'dashboard-dropzone': DashboardDropzone
    'dashboard-file-list': DashboardFileList
    'upload-progress': UploadProgress
    'upload-progress-desktop': UploadProgressDesktop
    'upload-progress-mobile': UploadProgressMobile
    'virtual-file-list': VirtualFileList
    'status-bar': StatusBar
    'chromvoid-footer': Footer
    'chromvoid-file-manager': FileManager
    'no-connection': HTMLElement
  }
}

export {}
