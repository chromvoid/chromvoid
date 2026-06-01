import {atom} from '@reatom/core'

export const timer = atom(0, 'passmanager.timer')

setInterval(() => timer.set(timer() + 1), 1000)
