import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {wrap} from '@reatom/core'

import type {PassmanagerRoute} from 'root/app/navigation/navigation.types'
import {defaultLogger} from 'root/core/logger'
import {dialogService} from 'root/shared/services/dialog-service'
import {pmActiveRowModel} from './models/pm-active-row.model'
import {pmEntryEditorModel} from './models/pm-entry-editor.model'
import {pmListViewportModel} from './models/pm-list-viewport.model'
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
  private pendingDirtyNavigation: (() => void) | null = null
  private dirtyNavigationPromptOpen = false

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
    pmListViewportModel.clearAll()
    pmMotionModel.reset()
    this.createEntryTargetGroupPath = undefined
    this.createGroupTargetGroupPath = undefined
    this.pendingDirtyNavigation = null
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

    if (current === 'sshView') {
      return {kind: 'ssh-view'}
    }

    if (current === 'envRuntimeView') {
      return {kind: 'env-runtime-view'}
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

    const dirtyEntryId = pmEntryEditorModel.dirtyEntryId()
    const targetEntryId = route.kind === 'entry' ? route.entryId : undefined
    if (this.requestDirtyNavigationConfirmation({targetEntryId, resume: () => this.applyRoute(route)})) {
      return false
    }

    const preserveEntryEditor = dirtyEntryId !== undefined && dirtyEntryId === targetEntryId
    return this.applyRouteNow(root, route, {preserveEntryEditor})
  }

  private applyRouteNow(
    root: ManagerRoot,
    route: PassmanagerRoute,
    options: {preserveEntryEditor?: boolean} = {},
  ): boolean {
    const current = root.showElement()
    let direction: PassmanagerMotionDirection
    let target: string
    let applyRoute: () => void

    switch (route.kind) {
      case 'root':
        direction = this.getApplyRouteDirection(current, root)
        target = this.targetForRoot(root)
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          this.maybePreserveActiveSelection(current, root)
          root.showElement.set(root)
        }
        break
      case 'group': {
        const group = this.findGroupByPath(route.groupPath)
        if (!group) return false
        direction = this.getApplyRouteDirection(current, group)
        target = this.targetForGroup(group)
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          this.maybePreserveActiveSelection(current, group)
          root.showElement.set(group)
        }
        break
      }
      case 'entry': {
        const entry = this.findEntryById(route.entryId)
        if (!entry) return false
        direction = current === entry ? 'none' : 'replace'
        target = this.targetForEntry(entry)
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          root.showElement.set(entry)
        }
        break
      }
      case 'create-entry': {
        const previousTargetGroupPath = this.createEntryTargetGroupPath
        const group = route.targetGroupPath ? this.findGroupByPath(route.targetGroupPath) : undefined
        direction =
          current === 'createEntry' && route.targetGroupPath === previousTargetGroupPath ? 'none' : 'open'
        target = this.targetForCreateEntry(group)
        applyRoute = () => {
          this.createEntryTargetGroupPath = route.targetGroupPath
          this.createGroupTargetGroupPath = undefined
          if (group) root.setShowElement('createEntry', group)
          else root.showElement.set('createEntry')
        }
        break
      }
      case 'create-group': {
        const previousTargetGroupPath = this.createGroupTargetGroupPath
        const group = route.targetGroupPath ? this.findGroupByPath(route.targetGroupPath) : undefined
        direction =
          current === 'createGroup' && route.targetGroupPath === previousTargetGroupPath ? 'none' : 'open'
        target = this.targetForCreateGroup(group)
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = route.targetGroupPath
          if (group) root.setShowElement('createGroup', group)
          else root.showElement.set('createGroup')
        }
        break
      }
      case 'import':
        direction = current === 'importDialog' ? 'none' : 'open'
        target = this.targetForImport()
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          root.showElement.set('importDialog')
        }
        break
      case 'otp-view':
        direction = current === 'otpView' ? 'none' : 'open'
        target = this.targetForOtpView()
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          setExtendedShowElement(root, 'otpView')
        }
        break
      case 'ssh-view':
        direction = current === 'sshView' ? 'none' : 'open'
        target = this.targetForSshView()
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          setExtendedShowElement(root, 'sshView')
        }
        break
      case 'env-runtime-view':
        direction = current === 'envRuntimeView' ? 'none' : 'open'
        target = this.targetForEnvRuntimeView()
        applyRoute = () => {
          this.createEntryTargetGroupPath = undefined
          this.createGroupTargetGroupPath = undefined
          setExtendedShowElement(root, 'envRuntimeView')
        }
        break
    }

    this.logger.debug('[PassManager][NavController] applyRoute begin', {
      route,
      current: describeShowElement(current),
      hasActiveEntryEditor: pmEntryEditorModel.active(),
    })
    this.runMotion(direction, target, () => {
      if (!options.preserveEntryEditor) {
        pmEntryEditorModel.reset()
      }
      applyRoute()

      this.logger.debug('[PassManager][NavController] applyRoute result', {
        route,
        handled: true,
        next: describeShowElement(root.showElement()),
        hasActiveEntryEditor: pmEntryEditorModel.active(),
      })
    })
    return true
  }

  openItem(item: Entry | Group): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    const current = root.showElement()
    if (
      (current instanceof Group && item instanceof Group && current.id === item.id) ||
      (current instanceof Entry && item instanceof Entry && current.id === item.id)
    ) {
      this.runMotion('none', this.targetForItem(current), () => {})
      return
    }

    if (
      this.requestDirtyNavigationConfirmation({
        targetEntryId: item instanceof Entry ? item.id : undefined,
        resume: () => this.openItem(item),
      })
    ) {
      return
    }

    this.openItemNow(root, item)
  }

  private openItemNow(root: ManagerRoot, item: Entry | Group): void {
    const current = root.showElement()
    if (
      (current instanceof Group && item instanceof Group && current.id === item.id) ||
      (current instanceof Entry && item instanceof Entry && current.id === item.id)
    ) {
      this.runMotion('none', this.targetForItem(current), () => {})
      return
    }

    this.runMotion('forward', this.targetForItem(item), () => {
      pmEntryEditorModel.reset()

      if (current instanceof ManagerRoot || current instanceof Group) {
        pmActiveRowModel.setActive(current.id, item.id)
        this.navigationStack.push({
          containerId: current.id,
          selectedItemId: item.id,
        })
      }

      this.createEntryTargetGroupPath = undefined
      root.showElement.set(item)
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
    if (
      current instanceof Entry &&
      pmEntryEditorModel.isActiveForEntry(current.id) &&
      this.requestDirtyNavigationConfirmation({
        force: true,
        resume: () => {
          this.goBackFromCurrent()
        },
      })
    ) {
      return true
    }

    return this.goBackFromCurrentNow(root)
  }

  private goBackFromCurrentNow(root: ManagerRoot): boolean {
    const current = root.showElement() as PMRootShowElement
    if (current instanceof Entry && pmEntryEditorModel.closeSurface(current.id)) {
      return true
    }

    if (
      current === 'createEntry' ||
      current === 'createGroup' ||
      current === 'importDialog' ||
      current === 'otpView' ||
      current === 'sshView' ||
      current === 'envRuntimeView'
    ) {
      this.runMotion('back', this.targetForRoot(root), () => {
        this.createEntryTargetGroupPath = undefined
        this.createGroupTargetGroupPath = undefined
        root.showElement.set(root)
      })
      return true
    }

    if (!(current instanceof Entry || current instanceof Group)) {
      return false
    }

    let stackMatch:
      | {frame: PMNavigationFrame; index: number; target: Group | ManagerRoot}
      | undefined
    for (let index = this.navigationStack.length - 1; index >= 0; index -= 1) {
      const frame = this.navigationStack[index]
      if (frame?.selectedItemId !== current.id) continue
      const target = this.getContainerById(frame.containerId)
      if (target && target !== current) {
        stackMatch = {frame, index, target}
        break
      }
    }

    if (stackMatch) {
      this.runMotion('back', this.targetForContainer(stackMatch.target), () => {
        this.navigationStack.splice(stackMatch.index)
        pmActiveRowModel.setActive(stackMatch.frame.containerId, stackMatch.frame.selectedItemId)
        root.showElement.set(stackMatch.target)
      })
      return true
    }

    if (current instanceof Entry) {
      const parent = current.parent
      this.runMotion('back', this.targetForContainer(parent), () => {
        this.navigationStack.length = 0
        pmActiveRowModel.setActive(parent.id, current.id)
        root.showElement.set(parent)
      })
      return true
    }

    const parent = this.resolveParentContainer(current)
    this.runMotion('back', this.targetForContainer(parent), () => {
      this.navigationStack.length = 0
      pmActiveRowModel.setActive(parent.id, current.id)
      root.showElement.set(parent)
    })
    return true
  }

  openCreateEntry(targetGroupPath?: string): void {
    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) {
      return
    }

    if (this.requestDirtyNavigationConfirmation({force: true, resume: () => this.openCreateEntry(targetGroupPath)})) {
      return
    }

    this.openCreateEntryNow(root, targetGroupPath)
  }

  private openCreateEntryNow(root: ManagerRoot, targetGroupPath?: string): void {
    const current = root.showElement()
    const currentGroup =
      targetGroupPath != null
        ? this.findGroupByPath(targetGroupPath)
        : current instanceof Group
          ? current
          : undefined

    this.runMotion('open', this.targetForCreateEntry(currentGroup), () => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = currentGroup?.name

      if (currentGroup) {
        root.setShowElement('createEntry', currentGroup)
      } else {
        root.showElement.set('createEntry')
      }
    })
  }

  openCreateGroup(targetGroupPath?: string): void {
    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) {
      return
    }

    if (this.requestDirtyNavigationConfirmation({force: true, resume: () => this.openCreateGroup(targetGroupPath)})) {
      return
    }

    this.openCreateGroupNow(root, targetGroupPath)
  }

  private openCreateGroupNow(root: ManagerRoot, targetGroupPath?: string): void {
    const current = root.showElement()
    const currentGroup =
      targetGroupPath != null
        ? this.findGroupByPath(targetGroupPath)
        : current instanceof Group
          ? current
          : undefined

    this.runMotion('open', this.targetForCreateGroup(currentGroup), () => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = currentGroup?.name
      if (currentGroup) {
        root.setShowElement('createGroup', currentGroup)
      } else {
        root.showElement.set('createGroup')
      }
    })
  }

  openImport(): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    if (this.requestDirtyNavigationConfirmation({force: true, resume: () => this.openImport()})) {
      return
    }

    this.openImportNow(root)
  }

  private openImportNow(root: ManagerRoot): void {
    this.runMotion('open', this.targetForImport(), () => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = undefined
      root.showElement.set('importDialog')
    })
  }

  closeImport(): void {
    const root = getPassmanagerRoot()
    if (!root) {
      return
    }

    this.runMotion('close', this.targetForRoot(root), () => {
      pmEntryEditorModel.reset()
      this.createEntryTargetGroupPath = undefined
      this.createGroupTargetGroupPath = undefined
      root.showElement.set(root)
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

  private requestDirtyNavigationConfirmation(options: {
    targetEntryId?: string
    force?: boolean
    resume: () => void
  }): boolean {
    const dirtyEntryId = pmEntryEditorModel.dirtyEntryId()
    if (!dirtyEntryId) {
      return false
    }

    if (!options.force && options.targetEntryId === dirtyEntryId) {
      return false
    }

    this.pendingDirtyNavigation = options.resume
    if (!this.dirtyNavigationPromptOpen) {
      void this.confirmDirtyNavigation(dirtyEntryId)
    }
    return true
  }

  private async confirmDirtyNavigation(entryId: string): Promise<void> {
    this.dirtyNavigationPromptOpen = true
    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('entry:dirty:discard-title'),
        message: i18n('entry:dirty:discard-message'),
        confirmText: i18n('button:discard'),
        cancelText: i18n('button:cancel'),
        confirmVariant: 'danger',
        variant: 'warning',
      }),
    ).catch(() => false)

    const resume = this.pendingDirtyNavigation
    this.pendingDirtyNavigation = null
    this.dirtyNavigationPromptOpen = false
    if (!confirmed || !resume) {
      return
    }

    pmEntryEditorModel.clearDirty(entryId)
    resume()
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

  private runMotion(direction: PassmanagerMotionDirection, target: string, commit: () => void): void {
    pmMotionModel.run(
      direction === 'none'
        ? {kind: 'none', direction: 'none', target: null}
        : {kind: 'surface-change', direction, target},
      () => this.withSuppressedNotify(commit),
    )
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

  private targetForSshView(): string {
    return 'ssh-view'
  }

  private targetForEnvRuntimeView(): string {
    return 'env-runtime-view'
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
