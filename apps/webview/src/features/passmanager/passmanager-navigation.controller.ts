import {Entry, Group, ManagerRoot} from '@project/passmanager/core'

import type {PassmanagerRoute} from 'root/app/navigation/navigation.types'
import {defaultLogger} from 'root/core/logger'
import {pmActiveRowModel} from './models/pm-active-row.model'
import {pmEntryEditorModel} from './models/pm-entry-editor.model'
import {pmMotionModel, type PassmanagerMotionDirection} from './models/pm-motion.model'
import {getPassmanagerRoot, getPassmanagerShowElement, type PMRootShowElement} from './models/pm-root.adapter'
import {subscribeToSignalChanges} from './service/subscribed-signal'

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

function describeShowElement(showElement: unknown): string {
  if (showElement instanceof Entry) return `entry:${showElement.id}`
  if (showElement instanceof Group) return `group:${showElement.id}`
  if (showElement instanceof ManagerRoot) return `root:${showElement.id}`
  if (showElement === undefined) return 'undefined'
  return String(showElement)
}

function setExtendedShowElement(root: ManagerRoot, showElement: Exclude<PMRootShowElement, undefined>): void {
  ;(root.showElement.set as (next: Exclude<PMRootShowElement, undefined>) => void)(showElement)
}

class PassmanagerNavigationController {
  private readonly logger = defaultLogger
  private readonly navigationStack: PMNavigationFrame[] = []
  private readonly listeners = new Set<RouteListener>()
  private readonly unsubscribers: Array<() => void> = []

  private suppressedNotify = 0
  private createEntryTargetGroupPath: string | undefined
  private createGroupTargetGroupPath: string | undefined

  attach(root: ManagerRoot | undefined): void {
    this.detach()
    if (!root) {
      return
    }

    this.logger.debug('[PassManager][NavController] attach', {
      current: describeShowElement(root.showElement()),
      hasActiveEntryEditor: pmEntryEditorModel.active(),
    })

    const showElement = root.showElement
    const handleSubscribedChange = () => {
      this.handleExternalChange()
    }

    if (typeof showElement === 'function') {
      this.unsubscribers.push(subscribeToSignalChanges(showElement, handleSubscribedChange))
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
    pmActiveRowModel.clearAll()
    pmMotionModel.reset()
    this.createEntryTargetGroupPath = undefined
    this.createGroupTargetGroupPath = undefined
  }

  readRoute(): PassmanagerRoute {
    const root = getPassmanagerRoot()
    if (!root) {
      return {kind: 'root'}
    }

    const current = root.showElement() as PMRootShowElement
    if (current === root) {
      return {kind: 'root'}
    }

    if (current === 'createEntry') {
      return {kind: 'create-entry', targetGroupPath: this.createEntryTargetGroupPath}
    }

    if (current === 'createGroup') {
      return {kind: 'create-group', targetGroupPath: this.createGroupTargetGroupPath}
    }

    if (current === 'importDialog') {
      return {kind: 'import'}
    }

    if (current === 'otpView') {
      return {kind: 'otp-view'}
    }

    if (current instanceof Entry) {
      const parent = current.parent
      const groupPath = parent instanceof Group ? parent.name : undefined
      return {kind: 'entry', entryId: current.id, groupPath}
    }

    if (current instanceof Group) {
      return {kind: 'group', groupPath: current.name}
    }

    return {kind: 'root'}
  }

  applyRoute(route: PassmanagerRoute): boolean {
    const root = getPassmanagerRoot()
    if (!root) {
      return false
    }

    return this.withSuppressedNotify(() => {
      const current = root.showElement()
      pmEntryEditorModel.reset()
      this.logger.debug('[PassManager][NavController] applyRoute begin', {
        route,
        current: describeShowElement(current),
        hasActiveEntryEditor: pmEntryEditorModel.active(),
      })

      let handled = false
      switch (route.kind) {
        case 'root':
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          this.maybePreserveActiveSelection(current, root)
          root.showElement.set(root)
          this.setMotionIntent(this.getApplyRouteDirection(current, root), this.targetForRoot(root))
          handled = true
          break
        case 'group': {
          const group = this.findGroupByPath(route.groupPath)
          if (!group) {
            return false
          }
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          this.maybePreserveActiveSelection(current, group)
          root.showElement.set(group)
          this.setMotionIntent(this.getApplyRouteDirection(current, group), this.targetForGroup(group))
          handled = true
          break
        }
        case 'entry': {
          const entry = this.findEntryById(route.entryId)
          if (!entry) {
            return false
          }
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          root.showElement.set(entry)
          this.setMotionIntent(current === entry ? 'none' : 'replace', this.targetForEntry(entry))
          handled = true
          break
        }
        case 'create-entry': {
          const previousTargetGroupPath = this.createEntryTargetGroupPath
          this.createEntryTargetGroupPath = route.targetGroupPath
          this.createGroupTargetGroupPath = undefined
          const target = route.targetGroupPath ? this.findGroupByPath(route.targetGroupPath) : undefined
          if (target) {
            root.setShowElement('createEntry', target)
          } else {
            root.showElement.set('createEntry')
          }
          this.setMotionIntent(
            current === 'createEntry' && route.targetGroupPath === previousTargetGroupPath ? 'none' : 'open',
            this.targetForCreateEntry(target),
          )
          handled = true
          break
        }
        case 'create-group': {
          const previousTargetGroupPath = this.createGroupTargetGroupPath
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = route.targetGroupPath
          const target = route.targetGroupPath ? this.findGroupByPath(route.targetGroupPath) : undefined
          if (target) {
            root.setShowElement('createGroup', target)
          } else {
            root.showElement.set('createGroup')
          }
          this.setMotionIntent(
            current === 'createGroup' && route.targetGroupPath === previousTargetGroupPath ? 'none' : 'open',
            this.targetForCreateGroup(target),
          )
          handled = true
          break
        }
        case 'import':
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          root.showElement.set('importDialog')
          this.setMotionIntent(current === 'importDialog' ? 'none' : 'open', this.targetForImport())
          handled = true
          break
        case 'otp-view':
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          setExtendedShowElement(root, 'otpView')
          this.setMotionIntent(current === 'otpView' ? 'none' : 'open', this.targetForOtpView())
          handled = true
          break
      }

      this.logger.debug('[PassManager][NavController] applyRoute result', {
        route,
        handled,
        next: describeShowElement(root.showElement()),
        hasActiveEntryEditor: pmEntryEditorModel.active(),
      })

      return handled
    })
  }

  openItem(item: Entry | Group): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      const current = root.showElement()
      pmEntryEditorModel.reset()

      if (
        (current instanceof Group && item instanceof Group && current.id === item.id) ||
        (current instanceof Entry && item instanceof Entry && current.id === item.id)
      ) {
        this.setMotionIntent('none', this.targetForItem(current))
        return
      }

      if (current instanceof ManagerRoot || current instanceof Group) {
        pmActiveRowModel.setActive(current.id, item.id)
        this.navigationStack.push({
          containerId: current.id,
          selectedItemId: item.id,
        })
      }

      this.createEntryTargetGroupPath = undefined
      root.showElement.set(item)
      this.setMotionIntent('forward', this.targetForItem(item))
    })
  }

  consumeRestoreSelection(containerId: string): string | undefined {
    return pmActiveRowModel.getActive(containerId) ?? undefined
  }

  goBackFromCurrent(): boolean {
    const root = getPassmanagerRoot()
    if (!root) {
      return false
    }

    const current = root.showElement() as PMRootShowElement

    return this.withSuppressedNotify(() => {
      if (current instanceof Entry && pmEntryEditorModel.closeSurface(current.id)) {
        return true
      }

      if (
        current === 'createEntry' ||
        current === 'createGroup' ||
        current === 'importDialog' ||
        current === 'otpView'
      ) {
        this.createEntryTargetGroupPath = undefined
        this.createGroupTargetGroupPath = undefined
        root.showElement.set(root)
        this.setMotionIntent('back', this.targetForRoot(root))
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
            pmActiveRowModel.setActive(frame.containerId, frame.selectedItemId)
            root.showElement.set(target)
            this.setMotionIntent('back', this.targetForContainer(target))
            return true
          }
        }

        frame = this.navigationStack.pop()
      }

      if (current instanceof Entry) {
        const parent = current.parent
        pmActiveRowModel.setActive(parent.id, current.id)
        root.showElement.set(parent)
        this.setMotionIntent('back', this.targetForContainer(parent))
        return true
      }

      const parent = this.resolveParentContainer(current)
      pmActiveRowModel.setActive(parent.id, current.id)
      root.showElement.set(parent)
      this.setMotionIntent('back', this.targetForContainer(parent))
      return true
    })
  }

  openCreateEntry(targetGroupPath?: string): void {
    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) {
      return
    }

    this.withSuppressedNotify(() => {
      pmEntryEditorModel.reset()
      const current = root.showElement()
      const currentGroup =
        targetGroupPath != null
          ? this.findGroupByPath(targetGroupPath)
          : current instanceof Group
            ? current
            : undefined

      this.createEntryTargetGroupPath = currentGroup?.name

      if (currentGroup) {
        root.setShowElement('createEntry', currentGroup)
      } else {
        root.showElement.set('createEntry')
      }
      this.setMotionIntent('open', this.targetForCreateEntry(currentGroup))
    })
  }

  openCreateGroup(targetGroupPath?: string): void {
    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) {
      return
    }

    this.withSuppressedNotify(() => {
      pmEntryEditorModel.reset()
      const current = root.showElement()
      const currentGroup =
        targetGroupPath != null
          ? this.findGroupByPath(targetGroupPath)
          : current instanceof Group
            ? current
            : undefined

      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = currentGroup?.name
      if (currentGroup) {
        root.setShowElement('createGroup', currentGroup)
      } else {
        root.showElement.set('createGroup')
      }
      this.setMotionIntent('open', this.targetForCreateGroup(currentGroup))
    })
  }

  openImport(): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = undefined
      root.showElement.set('importDialog')
      this.setMotionIntent('open', this.targetForImport())
    })
  }

  closeImport(): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    this.withSuppressedNotify(() => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = undefined
      root.showElement.set(root)
      this.setMotionIntent('close', this.targetForRoot(root))
    })
  }

  getCreateGroupTargetGroupPath(): string | undefined {
    return this.createGroupTargetGroupPath
  }

  private handleExternalChange(): void {
    const showElement = getPassmanagerShowElement()
    pmEntryEditorModel.resetForEntryChange(showElement instanceof Entry ? showElement.id : undefined)
    const route = this.readRoute()
    if (route.kind !== 'create-entry') {
      this.createEntryTargetGroupPath = undefined
    }
    if (route.kind !== 'create-group') {
      this.createGroupTargetGroupPath = undefined
    }
    this.logger.debug('[PassManager][NavController] handleExternalChange', {
      route,
      current: describeShowElement(showElement),
      hasActiveEntryEditor: pmEntryEditorModel.active(),
    })
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

  private setMotionIntent(direction: PassmanagerMotionDirection, target: string): void {
    if (direction === 'none') {
      pmMotionModel.reset()
      return
    }

    pmMotionModel.setIntent({
      kind: 'surface-change',
      direction,
      target,
    })
  }

  private targetForRoot(root: ManagerRoot): string {
    return `root:${root.id}`
  }

  private targetForGroup(group: Group): string {
    return `group:${group.id}`
  }

  private targetForEntry(entry: Entry): string {
    return `entry:${entry.id}`
  }

  private targetForItem(item: Entry | Group): string {
    return item instanceof Entry ? this.targetForEntry(item) : this.targetForGroup(item)
  }

  private targetForContainer(container: Group | ManagerRoot): string {
    return container instanceof Group ? this.targetForGroup(container) : this.targetForRoot(container)
  }

  private targetForCreateEntry(targetGroup: Group | undefined): string {
    return `create-entry:${targetGroup?.id ?? 'root'}`
  }

  private targetForCreateGroup(targetGroup: Group | undefined): string {
    return `create-group:${targetGroup?.id ?? 'root'}`
  }

  private targetForImport(): string {
    return 'import'
  }

  private targetForOtpView(): string {
    return 'otp-view'
  }

  private getApplyRouteDirection(
    current: PMRootShowElement,
    next: Group | ManagerRoot,
  ): PassmanagerMotionDirection {
    if (current === next) {
      return 'none'
    }

    if (current instanceof Entry) {
      const parent = current.parent instanceof Group ? current.parent : getPassmanagerRoot()
      return parent === next ? 'back' : 'replace'
    }

    if (current instanceof Group) {
      return this.resolveParentContainer(current) === next ? 'back' : 'replace'
    }

    return 'replace'
  }

  private resolveParentContainer(group: Group): Group | ManagerRoot {
    const currentPath = group.name
    const parentPath = getParentGroupPath(currentPath)
    if (!parentPath) {
      return group.root
    }

    return this.findGroupByPath(parentPath) ?? group.root
  }

  private maybePreserveActiveSelection(
    current: unknown,
    nextContainer: Group | ManagerRoot,
  ): void {
    if (current instanceof Entry) {
      const parent = current.parent instanceof Group ? current.parent : getPassmanagerRoot()
      if (parent === nextContainer) {
        pmActiveRowModel.setActive(nextContainer.id, current.id)
      }
      return
    }

    if (current instanceof Group) {
      const parent = this.resolveParentContainer(current)
      if (parent === nextContainer) {
        pmActiveRowModel.setActive(nextContainer.id, current.id)
      }
    }
  }

  private getContainerById(containerId: string): Group | ManagerRoot | undefined {
    const card = getPassmanagerRoot()?.getCardByID(containerId)
    if (card instanceof Group || card instanceof ManagerRoot) {
      return card
    }

    return undefined
  }

  private findGroupByPath(groupPath: string): Group | undefined {
    const root = getPassmanagerRoot()
    if (!root) {
      return undefined
    }

    return root.entriesList().find((item): item is Group => item instanceof Group && item.name === groupPath)
  }

  private findEntryById(entryId: string): Entry | undefined {
    const root = getPassmanagerRoot()
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
