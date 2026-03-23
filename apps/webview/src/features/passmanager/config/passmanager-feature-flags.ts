export const PASSMANAGER_FEATURE_FLAGS = {
  icons: false,
} as const

export function isPassmanagerIconsEnabled(): boolean {
  return PASSMANAGER_FEATURE_FLAGS.icons
}
