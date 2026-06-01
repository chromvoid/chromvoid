import {action, atom} from '@reatom/core'

export class PMCardHeaderModel {
  private readonly hasAvatarSlotState = atom(true, 'passmanager.cardHeader.hasAvatarSlot')

  readonly state = {
    hasAvatarSlot: this.hasAvatarSlotState,
  }

  readonly actions = {
    setHasAvatarSlot: action((value: boolean) => {
      this.hasAvatarSlotState.set(value)
    }, 'passmanager.cardHeader.setHasAvatarSlot'),
  }
}
