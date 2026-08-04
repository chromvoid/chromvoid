export function createAndroidDevConfigOverlay(baseConfig, devConfig) {
  const identifier = baseConfig.identifier?.trim()
  if (!identifier) {
    throw new Error('base Tauri config must define an identifier for Android dev builds')
  }

  return {
    ...devConfig,
    identifier,
  }
}
