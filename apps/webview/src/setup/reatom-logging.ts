import {connectLogger, log} from '@reatom/core'

const REATOM_LOG_PREFIXES = ['passmanager.mobileSelection', 'passmanager.mobileLongPress']

if (window.env === 'dev') {
  connectLogger({
    match(name) {
      return REATOM_LOG_PREFIXES.some((prefix) => name.startsWith(prefix))
    },
  })
  globalThis.LOG = log
} else {
  delete (globalThis as {LOG?: typeof log}).LOG
}
