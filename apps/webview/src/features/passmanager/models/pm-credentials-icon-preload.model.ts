import {Entry, Group, ManagerRoot} from '@project/passmanager/core'

import {defaultLogger} from 'root/core/logger'
import {subscribeAfterInitial, type Unsubscribe} from 'root/shared/services/subscribed-signal'
import {pmModel} from '../password-manager.model'
import type {PassmanagerMotionIntent} from './pm-motion.model'
import {pmIconStore} from './pm-icon-store'
import {getPMCredentialSurfaceRows} from './pm-root-search-projection'
import {getPassmanagerRoot, getPassmanagerShowElement, type PMRootShowElement} from './pm-root.adapter'

const INITIAL_ICON_PRELOAD_ROW_COUNT = 40

class PMCredentialsIconPreloadModel {
  private unsubscribeSessionStatus: Unsubscribe | undefined
  private readonly pendingBySignature = new Map<string, Promise<void>>()

  connect(): void {
    if (this.unsubscribeSessionStatus) return
    this.unsubscribeSessionStatus = subscribeAfterInitial(pmModel.sessionStatus, () => {
      this.handleSessionStatusChange()
    })
    this.handleSessionStatusChange()
  }

  disconnect(): void {
    this.unsubscribeSessionStatus?.()
    this.unsubscribeSessionStatus = undefined
    this.pendingBySignature.clear()
  }

  prepareCurrentSurface(): Promise<void> {
    const root = getPassmanagerRoot()
    if (!root || pmModel.sessionStatus() !== 'ready') return Promise.resolve()
    return this.prepareTarget(root, getPassmanagerShowElement())
  }

  prepareIntent(intent: Exclude<PassmanagerMotionIntent, {kind: 'none'}>): Promise<void> {
    const root = getPassmanagerRoot()
    if (!root || pmModel.sessionStatus() !== 'ready') return Promise.resolve()
    return this.prepareTarget(root, this.resolveIntentTarget(root, intent.target))
  }

  collectTargetIconRefs(root: ManagerRoot, target: PMRootShowElement): string[] {
    if (target instanceof Entry) {
      return this.uniqueRefs([target.iconRef])
    }
    if (!(target instanceof Group) && !(target instanceof ManagerRoot)) {
      return []
    }

    const refs: Array<string | undefined> = target instanceof Group ? [target.iconRef] : []
    const rows = getPMCredentialSurfaceRows(root, target).slice(0, INITIAL_ICON_PRELOAD_ROW_COUNT)
    for (const row of rows) {
      if (row.kind === 'entry' || row.kind === 'group') refs.push(row.item.iconRef)
    }
    return this.uniqueRefs(refs)
  }

  private handleSessionStatusChange(): void {
    if (pmModel.sessionStatus() !== 'ready') {
      this.pendingBySignature.clear()
      return
    }
    void this.prepareCurrentSurface()
  }

  private prepareTarget(root: ManagerRoot, target: PMRootShowElement): Promise<void> {
    const refs = this.collectTargetIconRefs(root, target)
    if (refs.length === 0) return Promise.resolve()

    const signature = `${root.id}:${this.describeTarget(target)}:${refs.join(',')}`
    const pending = this.pendingBySignature.get(signature)
    if (pending) return pending

    let request!: Promise<void>
    request = pmIconStore
      .preloadIconUrls(refs)
      .catch((error) => {
        defaultLogger.debug('[PassManager][icons] presentation preload failed', {
          error: error instanceof Error ? error.message : String(error),
          target: this.describeTarget(target),
        })
      })
      .finally(() => {
        if (this.pendingBySignature.get(signature) === request) {
          this.pendingBySignature.delete(signature)
        }
      })
    this.pendingBySignature.set(signature, request)
    return request
  }

  private resolveIntentTarget(root: ManagerRoot, target: string): PMRootShowElement {
    if (target === `root:${root.id}` || target === 'root-like') return root

    if (target.startsWith('group:')) {
      const id = target.slice('group:'.length)
      return root.entriesList().find((item): item is Group => item instanceof Group && item.id === id)
    }

    if (target.startsWith('entry:')) {
      const id = target.slice('entry:'.length)
      return root.allEntries.find((entry) => entry.id === id)
    }

    return undefined
  }

  private describeTarget(target: PMRootShowElement): string {
    if (target instanceof Entry) return `entry:${target.id}`
    if (target instanceof Group) return `group:${target.id}`
    if (target instanceof ManagerRoot) return `root:${target.id}`
    return String(target)
  }

  private uniqueRefs(values: Iterable<string | undefined>): string[] {
    const refs: string[] = []
    const seen = new Set<string>()
    for (const value of values) {
      const iconRef = typeof value === 'string' ? value.trim() : ''
      if (iconRef && !seen.has(iconRef)) {
        seen.add(iconRef)
        refs.push(iconRef)
      }
    }
    return refs
  }
}

export const pmCredentialsIconPreloadModel = new PMCredentialsIconPreloadModel()
