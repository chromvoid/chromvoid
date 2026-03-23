import {state} from '@statx/core'

export class PMCardHeaderModel {
  readonly hasAvatarSlot = state(true)

  setHasAvatarSlot(value: boolean): void {
    this.hasAvatarSlot.set(value)
  }
}
