import {addOnInstalledListener, addOnStartupListener, setActionBadgeText} from './runtime/webextension-api'

const clearBadge = () => {
  void setActionBadgeText('')
}

addOnInstalledListener(() => {
  clearBadge()
})

addOnStartupListener(() => {
  clearBadge()
})
