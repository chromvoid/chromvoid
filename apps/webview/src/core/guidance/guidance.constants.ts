import {SURFACE_IDS} from 'root/app/navigation/navigation.types'
import {ROUTE_IDS} from 'root/app/router/router'

export const GUIDANCE_SURFACE_IDS = [...SURFACE_IDS, 'welcome'] as const

export const GUIDANCE_TRIGGER_IDS = [
  'first_run',
  'empty_state',
  'blocked_action',
  'feature_discovery',
  'manual_help',
] as const

export const GUIDANCE_PRESENTATION_IDS = [
  'tooltip',
  'popover',
  'bottom_sheet',
  'inline_hint',
] as const

export const GUIDANCE_PLATFORM_IDS = [
  'desktop',
  'mobile',
  'android',
  'ios',
  'macos',
  'windows',
  'linux',
  'web',
] as const

export const GUIDANCE_ANCHOR_REGISTER_EVENT = 'guidance-anchor-register'
export const GUIDANCE_ANCHOR_UNREGISTER_EVENT = 'guidance-anchor-unregister'

export {ROUTE_IDS, SURFACE_IDS}
