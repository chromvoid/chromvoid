import {atom, type Atom} from '@reatom/core'

export type PassmanagerMotionDirection = 'none' | 'forward' | 'back' | 'open' | 'close' | 'replace'

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
    }

export const PASSMANAGER_NO_MOTION_INTENT: PassmanagerMotionIntent = {
  kind: 'none',
  direction: 'none',
  target: null,
}

export class PMMotionModel {
  readonly intent: Atom<PassmanagerMotionIntent>

  constructor(name = 'passmanager.motion.intent') {
    this.intent = atom<PassmanagerMotionIntent>(PASSMANAGER_NO_MOTION_INTENT, name)
  }

  setIntent(intent: PassmanagerMotionIntent): void {
    this.intent.set(intent)
  }

  reset(): void {
    this.intent.set(PASSMANAGER_NO_MOTION_INTENT)
  }
}

export const pmMotionModel = new PMMotionModel()
