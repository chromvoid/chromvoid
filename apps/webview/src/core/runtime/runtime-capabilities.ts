export type RuntimeCapabilities = {
  platform: string
  desktop: boolean
  mobile: boolean
  supports_native_path_io: boolean
  supports_open_external: boolean
  supports_volume: boolean
  supports_gateway: boolean
  supports_usb_remote: boolean
  supports_network_remote: boolean
  supports_biometric: boolean
  supports_autofill: boolean
}

const FALLBACK_CAPABILITIES: RuntimeCapabilities = {
  platform: 'web',
  desktop: false,
  mobile: false,
  supports_native_path_io: false,
  supports_open_external: false,
  supports_volume: false,
  supports_gateway: false,
  supports_usb_remote: false,
  supports_network_remote: true,
  supports_biometric: false,
  supports_autofill: false,
}

let currentCapabilities: RuntimeCapabilities = {...FALLBACK_CAPABILITIES}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return currentCapabilities
}

export function setRuntimeCapabilities(next: Partial<RuntimeCapabilities> | null | undefined): RuntimeCapabilities {
  if (!next || typeof next !== 'object') {
    currentCapabilities = {...FALLBACK_CAPABILITIES}
    return currentCapabilities
  }

  currentCapabilities = {
    ...FALLBACK_CAPABILITIES,
    ...next,
  }
  return currentCapabilities
}

export function isCapabilityEnabled(capability: keyof Omit<RuntimeCapabilities, 'platform' | 'desktop' | 'mobile'>): boolean {
  return Boolean(currentCapabilities[capability])
}

export function resetRuntimeCapabilities(): void {
  currentCapabilities = {...FALLBACK_CAPABILITIES}
}
