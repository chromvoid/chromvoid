import type {ChromVoidState} from './app-state'
import type {TransportLike} from '../transport/transport'

export class ChromVoidActions {
  ws: TransportLike
  state: ChromVoidState

  constructor(ws: TransportLike, state: ChromVoidState) {
    this.ws = ws
    this.state = state
  }
}
