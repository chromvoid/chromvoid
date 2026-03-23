/**
 * Remove obsolete localStorage keys from earlier UI-mode experiments.
 */
export const removeLegacyUIFlagStorage = () => {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('persist-local-storage-ui-mode')
  localStorage.removeItem('ui-mode')
}
