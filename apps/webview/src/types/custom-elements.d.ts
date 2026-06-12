import type {CommandBar} from 'root/features/file-manager/components/command-bar'
import type {AppGuidanceHost} from 'root/features/guidance'
import type {DesktopShellToolbar} from 'root/features/shell/components/desktop-shell-toolbar'
import type {FileAppShell} from 'root/features/shell/components/file-app-shell'
import type {FileDetailsPanel} from 'root/features/file-manager/components/file-details-panel'
import type {NavigationRail, NavigationRailActions} from 'root/features/file-manager/components/navigation-rail'

declare global {
  interface HTMLElementTagNameMap {
    'app-guidance-host': AppGuidanceHost
    'command-bar': CommandBar
    'desktop-shell-toolbar': DesktopShellToolbar
    'file-app-shell': FileAppShell
    'file-details-panel': FileDetailsPanel
    'navigation-rail': NavigationRail
    'navigation-rail-actions': NavigationRailActions
  }
}

export {}
