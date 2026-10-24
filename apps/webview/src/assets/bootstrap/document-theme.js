;(function applyPersistedDocumentTheme() {
  'use strict'

  try {
    var storedTheme = window.localStorage.getItem('theme-state')
    if (!storedTheme) return

    // Match store.theme's withLocalStorage record version and expiration contract.
    var record = JSON.parse(storedTheme)
    if (record.to < Date.now()) {
      window.localStorage.removeItem('theme-state')
      return
    }
    if (record.version !== 0 || (record.data !== 'light' && record.data !== 'dark')) return

    document.documentElement.setAttribute('data-theme', record.data)
    document.documentElement.setAttribute('theme', record.data)
  } catch (_error) {
    // Missing or unavailable storage leaves the initial CSS on the system theme.
  }
})()
