import {Entry, Group, ManagerRoot} from '@project/passmanager'

import type {PassmanagerRoute} from 'root/app/navigation/navigation.types'

type PMNavigationFrame = {
  containerId: string
  selectedItemId: string
}

type RouteListener = () => void

function getParentGroupPath(path: string): string | undefined {
  const index = path.lastIndexOf('/')
  if (index < 0) {
    return undefined
  }

  return path.slice(0, index) || undefined
}

class PassmanagerNavigationController {
  private readonly navigationStack: PMNavigationFrame[] = []
  private readonly restoreSelectionByContainer = new Map<string, string>()
  private readonly listeners = new Set<RouteListener>()
  private readonly unsubscribers: Array<() => void> = []

  private suppressedNotify = 0
  private createEntryTargetGroupPath: string | undefined

  attach(root: typeof window.passmanager | undefined): void {
    this.detach()
    if (!root) {
      return
    }

    const showElement = root.showElement
    const isEditMode = root.isEditMode

    if (typeof showElement?.subscribe === 'function') {
      this.unsubscribers.push(showElement.subscribe(() => this.handleExternalChange()))
    }
    if (typeof isEditMode?.subscribe === 'function') {
      this.unsubscribers.push(isEditMode.subscribe(() => this.handleExternalChange()))
    }

    this.handleExternalChange()
  }

  detach(): void {
    while (this.unsubscribers.length > 0) {
      const unsubscribe = this.unsubscribers.pop()
      try {
        unsubscribe?.()
      } catch {
        // best-effort cleanup
      }
    }

    this.reset()
    this.notify()
  }

  subscribe(listener: RouteListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reset(): void {
    this.navigationStack.length = 0
    this.restoreSelectionByContainer.clear()
    this.createEntryTargetGroupPath = undefined
  }

  readRoute(): PassmanagerRoute {
    const root = window.passmanager
    if (!root) {
      return {kind: 'root'}
    }

    const current = root.showElement()
    if (current === root) {
      return {kind: 'root'}
    }

    if (current === 'createEntry') {
      return {kind: 'create-entry', targetGroupPath: this.createEntryTargetGroupPath}
    }

    if (current === 'createGroup') {
      return {kind: 'create-group'}
    }

    if (current === 'importDialog') {
      return {kind: 'import'}
    }

    if (current instanceof Entry) {
      const parent = current.parent
      const groupPath = parent instanceof Group ? parent.name : undefined
      if (root.isEditMode()) {
        return {kind: 'entry-edit', entryId: current.id, groupPath}
      }
      return {kind: 'entry', entryId: current.id, groupPath}
    }

    if (current instanceof Group) {
      return {kind: 'group', groupPath: current.name}
    }

    return {kind: 'root'}
  }

  applyRoute(route: PassmanagerRoute): boolean {
    const root = window.passmanager
    if (!root) {
      return false
    }

    return this.withSuppressedNotify(() => {
      root.isEditMode.set(false)

      switch (route.kind) {
        case 'root':
          this.createEntryTargetGroupPath = undefined
          root.showElement.set(root)
          return true
        case 'group': {
          const group = this.findGroupByPath(route.groupPath)
          if (!group) {
            return false
          }
          this.createEntryTargetGroupPath = undefined
          root.showElement.set(group)
          return true
        }
        case 'entry': {
          const entry = this.findEntryById(route.entryId)
          if (!entry) {
            return false
          }
          this.createEntryTargetGroupPath = undefined
          root.showElement.set(entry)
          return true
        }
        case 'entry-edit': {
          const entry = this.findEntryById(route.entryId)
          if (!entry) {
            return false
          }
          this.createEntryTargetGroupPath = undefined
          root.showElement.set(entry)
          root.isEditMode.set(true)
          return true
        }
        case 'create-entry': {
          this.createEntryTargetGroupPath = route.targetGroupPath
          const target = route.targetGroupPath ? this.findGroupByPath(route.targetGroupPath) : undefined
          if (target) {
            root.setShowElement('createEntry', target)
          } else {
            root.showElement.set('createEntry')
          }
          return true
        }
        case 'create-group':
          this.createEntryTargetGroupPath = undefined
          root.showElement.set('createGroup')
          return true
        case 'import':
          this.createEntryTargetGroupPath = undefined
          root.showElement.set('importDialog')
          return true
      }
    })
  }

  openItem(item: Entry | Group): void {
    const root = window.passmanager
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      const current = root.showElement()

      if (current instanceof Group && current.id === item.id) {
        return
      }

      if (current instanceof ManagerRoot || current instanceof Group) {
        this.navigationStack.push({
          containerId: current.id,
          selectedItemId: item.id,
        })
      }

      this.createEntryTargetGroupPath = undefined
      root.isEditMode.set(false)
      root.showElement.set(item)
    })
  }

  consumeRestoreSelection(containerId: string): string | undefined {
    const selectedItemId = this.restoreSelectionByContainer.get(containerId)
    if (!selectedItemId) {
      return undefined
    }

    this.restoreSelectionByContainer.delete(containerId)
    return selectedItemId
  }

  goBackFromCurrent(): boolean {
    const root = window.passmanager
    if (!root) {
      return false
    }

    const current = root.showElement()

    return this.withSuppressedNotify(() => {
      if (root.isEditMode()) {
        root.isEditMode.set(false)
        return true
      }

      if (current === 'createEntry' || current === 'createGroup' || current === 'importDialog') {
        this.createEntryTargetGroupPath = undefined
        root.showElement.set(root)
        return true
      }

      if (!(current instanceof Entry || current instanceof Group)) {
        return false
      }

      let frame = this.navigationStack.pop()
      while (frame) {
        if (frame.selectedItemId === current.id) {
          const target = this.getContainerById(frame.containerId)
          if (target && target !== current) {
            this.restoreSelectionByContainer.set(frame.containerId, frame.selectedItemId)
            root.showElement.set(target)
            return true
          }
        }

        frame = this.navigationStack.pop()
      }

      if (current instanceof Entry) {
        const parent = current.parent
        this.restoreSelectionByContainer.set(parent.id, current.id)
        root.showElement.set(parent)
        return true
      }

      const parent = this.resolveParentContainer(current)
      this.restoreSelectionByContainer.set(parent.id, current.id)
      root.showElement.set(parent)
      return true
    })
  }

  openCreateEntry(targetGroupPath?: string): void {
    const root = window.passmanager
    if (!root || root.isReadOnly()) {
      return
    }

    this.withSuppressedNotify(() => {
      const current = root.showElement()
      const currentGroup =
        targetGroupPath != null
          ? this.findGroupByPath(targetGroupPath)
          : current instanceof Group
            ? current
            : undefined

      this.createEntryTargetGroupPath = currentGroup?.name
      root.isEditMode.set(false)

      if (currentGroup) {
        root.setShowElement('createEntry', currentGroup)
      } else {
        root.showElement.set('createEntry')
      }
    })
  }

  openCreateGroup(): void {
    const root = window.passmanager
    if (!root || root.isReadOnly()) {
      return
    }

    this.withSuppressedNotify(() => {
      this.createEntryTargetGroupPath = undefined
      root.isEditMode.set(false)
      root.showElement.set('createGroup')
    })
  }

  openImport(): void {
    const root = window.passmanager
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      this.createEntryTargetGroupPath = undefined
      root.isEditMode.set(false)
      root.showElement.set('importDialog')
    })
  }

  closeImport(): void {
    const root = window.passmanager
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      this.createEntryTargetGroupPath = undefined
      root.showElement.set(root)
    })
  }

  private handleExternalChange(): void {
    const route = this.readRoute()
    if (route.kind !== 'create-entry') {
      this.createEntryTargetGroupPath = undefined
    }
    this.notify()
  }

  private notify(): void {
    if (this.suppressedNotify > 0) {
      return
    }

    for (const listener of this.listeners) {
      listener()
    }
  }

  private withSuppressedNotify<T>(fn: () => T): T {
    this.suppressedNotify++
    try {
      return fn()
    } finally {
      this.suppressedNotify--
      this.notify()
    }
  }

  private resolveParentContainer(group: Group): Group | ManagerRoot {
    const currentPath = group.name
    const parentPath = getParentGroupPath(currentPath)
    if (!parentPath) {
      return window.passmanager
    }

    return this.findGroupByPath(parentPath) ?? window.passmanager
  }

  private getContainerById(containerId: string): Group | ManagerRoot | undefined {
    const card = window.passmanager?.getCardByID(containerId)
    if (card instanceof Group || card instanceof ManagerRoot) {
      return card
    }

    return undefined
  }

  private findGroupByPath(groupPath: string): Group | undefined {
    const root = window.passmanager
    if (!root) {
      return undefined
    }

    return root.entriesList().find((item): item is Group => item instanceof Group && item.name === groupPath)
  }

  private findEntryById(entryId: string): Entry | undefined {
    const root = window.passmanager
    if (!root) {
      return undefined
    }

    const card = root.getCardByID(entryId)
    if (card instanceof Entry) {
      return card
    }

    return undefined
  }
}

export const passmanagerNavigationController = new PassmanagerNavigationController()
