import {atom} from '@reatom/core'

import type {FullChromVoidState} from '@chromvoid/scheme'

export class ChromVoidState {
  data = atom<Partial<FullChromVoidState>>({})

  update(data: Partial<FullChromVoidState>) {
    this.data.set({...this.data(), ...data})
  }
}
