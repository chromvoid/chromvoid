import {connectLogger, log} from '@reatom/core'

const isDevHost =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

const REATOM_LOG_PREFIXES = ['passmanager.mobileSelection', 'passmanager.mobileLongPress']

if (window.env === 'dev' || isDevHost) {
  connectLogger({
    match(name) {
      return REATOM_LOG_PREFIXES.some((prefix) => name.startsWith(prefix))
    },
  })
}

globalThis.LOG = log
