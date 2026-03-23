import type {CommandBar} from 'root/features/file-manager/components/command-bar'
import type {FileAppShell} from 'root/features/shell/components/file-app-shell'
import type {FileDetailsPanel} from 'root/features/file-manager/components/file-details-panel'
import type {NavigationRail} from 'root/features/file-manager/components/navigation-rail'
import type {StorageWidget} from 'root/features/file-manager/components/storage-widget'
import type {TagsPanel} from 'root/features/file-manager/components/tags-panel'

declare global {
  interface HTMLElementTagNameMap {
    'command-bar': CommandBar
    'file-app-shell': FileAppShell
    'file-details-panel': FileDetailsPanel
    'navigation-rail': NavigationRail
    'storage-widget': StorageWidget
    'tags-panel': TagsPanel
  }
}

export {}
