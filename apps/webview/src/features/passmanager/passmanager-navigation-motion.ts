import {Entry, Group, ManagerRoot} from '@project/passmanager/core'

import type {PassmanagerMotionDirection, PassmanagerSurfaceKind} from './models/pm-motion.model'
import type {PMRootShowElement} from './models/pm-root.adapter'

export const pmNavigationMotion = {
  surfaceFor(showElement: PMRootShowElement): PassmanagerSurfaceKind {
    if (showElement instanceof Entry) return 'entry'
    if (showElement instanceof Group) return 'group'
    if (showElement instanceof ManagerRoot || showElement === undefined) return 'root'
    return showElement === 'createEntry'
      ? 'create-entry'
      : showElement === 'createGroup'
        ? 'create-group'
        : showElement === 'importDialog'
          ? 'import'
          : showElement === 'otpView'
            ? 'otp-view'
            : showElement === 'sshView'
              ? 'ssh-view'
              : 'env-runtime-view'
  },

  surfaceForTarget(target: string): PassmanagerSurfaceKind {
    if (target.startsWith('entry:')) return 'entry'
    if (target.startsWith('group:')) return 'group'
    if (target.startsWith('root:')) return 'root'
    if (target.startsWith('create-entry:')) return 'create-entry'
    if (target.startsWith('create-group:')) return 'create-group'
    if (target === 'import') return 'import'
    if (target === 'otp-view') return 'otp-view'
    if (target === 'ssh-view') return 'ssh-view'
    return 'env-runtime-view'
  },

  targetForRoot: (root: ManagerRoot) => `root:${root.id}`,
  targetForGroup: (group: Group) => `group:${group.id}`,
  targetForEntry: (entry: Entry) => `entry:${entry.id}`,
  targetForItem(item: Entry | Group): string {
    return item instanceof Entry ? this.targetForEntry(item) : this.targetForGroup(item)
  },
  targetForContainer(container: Group | ManagerRoot): string {
    return container instanceof Group ? this.targetForGroup(container) : this.targetForRoot(container)
  },
  targetForCreateEntry: (group: Group | undefined) => `create-entry:${group?.id ?? 'root'}`,
  targetForCreateGroup: (group: Group | undefined) => `create-group:${group?.id ?? 'root'}`,
  targetForImport: () => 'import',
  targetForOtpView: () => 'otp-view',
  targetForSshView: () => 'ssh-view',
  targetForEnvRuntimeView: () => 'env-runtime-view',

  parentFor(group: Group): Group | ManagerRoot {
    const separator = group.name.lastIndexOf('/')
    if (separator < 0) return group.root

    const parentPath = group.name.slice(0, separator)
    return (
      group.root
        .entriesList()
        .find((item): item is Group => item instanceof Group && item.name === parentPath) ?? group.root
    )
  },

  directionForRoute(
    current: PMRootShowElement,
    next: Group | ManagerRoot,
    root: ManagerRoot | undefined,
  ): PassmanagerMotionDirection {
    if (current === next) return 'none'
    if (current instanceof Entry) {
      const parent = current.parent instanceof Group ? current.parent : root
      return parent === next ? 'back' : 'replace'
    }
    if (current instanceof Group) return this.parentFor(current) === next ? 'back' : 'replace'
    return 'replace'
  },
}
