import type {TextDirection} from './consts'

export type BidiIsolationDirection = TextDirection | 'auto'

const FIRST_STRONG_ISOLATE = '\u2068'
const LEFT_TO_RIGHT_ISOLATE = '\u2066'
const RIGHT_TO_LEFT_ISOLATE = '\u2067'
const POP_DIRECTIONAL_ISOLATE = '\u2069'
const BIDI_CONTROL_PATTERN = /\p{Bidi_Control}/gu

const isolationStart = (direction: BidiIsolationDirection): string => {
  if (direction === 'ltr') return LEFT_TO_RIGHT_ISOLATE
  if (direction === 'rtl') return RIGHT_TO_LEFT_ISOLATE
  return FIRST_STRONG_ISOLATE
}

/**
 * Isolates plain display text when markup such as `<bdi>` cannot be used.
 * Keep copied/raw values unchanged and call this only at a rendering boundary.
 */
export const isolateBidiText = (value: string, direction: BidiIsolationDirection = 'auto'): string =>
  `${isolationStart(direction)}${value}${POP_DIRECTIONAL_ISOLATE}`

export const isolateLtrText = (value: string): string => isolateBidiText(value, 'ltr')
export const isolateRtlText = (value: string): string => isolateBidiText(value, 'rtl')

/**
 * Removes locale-generated direction marks when markup provides the isolation.
 * Do not use this on stored, copied, or security-sensitive raw values.
 */
export const stripBidiControls = (value: string): string => value.replace(BIDI_CONTROL_PATTERN, '')
