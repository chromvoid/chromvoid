import {state} from '@statx/core'

import type {FullChromVoidState} from '@chromvoid/scheme'

export class ChromVoidState {
  data = state<Partial<FullChromVoidState>>({})

  update(data: Partial<FullChromVoidState>) {
    this.data.set({...this.data(), ...data})
  }
}
