import {atom, type Atom} from '@reatom/core'

export type PassmanagerMotionDirection = 'none' | 'forward' | 'back' | 'open' | 'close' | 'replace'
export type PassmanagerMotionReason = 'navigation' | 'create-success' | 'delete-success'
export type PassmanagerSurfaceKind =
  | 'root'
  | 'group'
  | 'entry'
  | 'create-entry'
  | 'create-group'
  | 'import'
  | 'otp-view'
  | 'ssh-view'
  | 'env-runtime-view'

const SNAPSHOT_SAFE_SURFACES = new Set<PassmanagerSurfaceKind>(['root', 'group', 'create-group'])

export function isPassmanagerMotionSnapshotSafe(
  intent: Exclude<PassmanagerMotionIntent, {kind: 'none'}>,
): boolean {
  return (
    SNAPSHOT_SAFE_SURFACES.has(intent.sourceSurface) &&
    SNAPSHOT_SAFE_SURFACES.has(intent.targetSurface)
  )
}

export type PassmanagerMotionIntent =
  | {
      kind: 'none'
      direction: 'none'
      target: null
    }
  | {
      kind: 'surface-change'
      direction: Exclude<PassmanagerMotionDirection, 'none'>
      target: string
      reason: PassmanagerMotionReason
      sourceSurface: PassmanagerSurfaceKind
      targetSurface: PassmanagerSurfaceKind
    }

export const PASSMANAGER_NO_MOTION_INTENT: PassmanagerMotionIntent = {
  kind: 'none',
  direction: 'none',
  target: null,
}

export type PassmanagerMotionPresenter = (request: {
  intent: Exclude<PassmanagerMotionIntent, {kind: 'none'}>
  commit: () => void
}) => void | Promise<void>

export class PMMotionModel {
  readonly intent: Atom<PassmanagerMotionIntent>
  private presenter?: {token: symbol; present: PassmanagerMotionPresenter}
  private readonly pendingPresentations = new Set<Promise<void>>()

  constructor(name = 'passmanager.motion.intent') {
    this.intent = atom<PassmanagerMotionIntent>(PASSMANAGER_NO_MOTION_INTENT, name)
  }

  setIntent(intent: PassmanagerMotionIntent): void {
    this.intent.set(intent)
  }

  registerPresenter(present: PassmanagerMotionPresenter): () => void {
    const token = Symbol('passmanager-motion-presenter')
    this.presenter = {token, present}
    return () => {
      if (this.presenter?.token === token) {
        this.presenter = undefined
      }
    }
  }

  run(intent: PassmanagerMotionIntent, commit: () => void): void {
    this.setIntent(intent)
    if (intent.kind === 'none' || !this.presenter) {
      commit()
      return
    }
    const presenter = this.presenter.present

    let attempted = false
    const commitOnce = () => {
      if (attempted) return
      attempted = true
      commit()
    }
    let presentation: Promise<void>
    try {
      presentation = Promise.resolve(presenter({intent, commit: commitOnce}))
    } catch (error) {
      presentation = Promise.reject(error)
    }

    const tracked = presentation
      .then(commitOnce)
      .catch(() => commitOnce())
      .finally(() => this.pendingPresentations.delete(tracked))
    this.pendingPresentations.add(tracked)
  }

  async whenSettled(): Promise<void> {
    await Promise.all([...this.pendingPresentations])
  }

  reset(): void {
    this.intent.set(PASSMANAGER_NO_MOTION_INTENT)
  }
}

export const pmMotionModel = new PMMotionModel()
