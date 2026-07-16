import type {AppGuidanceHost} from 'root/features/guidance'
import type {DashboardHeader} from 'root/features/shell/components/dashboard-header'
import type {DesktopShellToolbar} from 'root/features/shell/components/desktop-shell-toolbar'
import type {FileAppShell} from 'root/features/shell/components/file-app-shell'
import type {FileDetailsPanel} from 'root/features/file-manager/components/file-details-panel'
import type {WorkspaceDashboardHeader} from 'root/features/file-manager/components/workspace-dashboard-header'
import type {NavigationRail, NavigationRailActions} from 'root/features/file-manager/components/navigation-rail'

declare global {
  interface HTMLElementTagNameMap {
    'app-guidance-host': AppGuidanceHost
    'dashboard-header': DashboardHeader
    'desktop-shell-toolbar': DesktopShellToolbar
    'file-app-shell': FileAppShell
    'file-details-panel': FileDetailsPanel
    'workspace-dashboard-header': WorkspaceDashboardHeader
    'navigation-rail': NavigationRail
    'navigation-rail-actions': NavigationRailActions
  }
}

export {}
