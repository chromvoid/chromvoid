import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type BadgeVariant = 'primary' | 'success' | 'neutral' | 'warning' | 'danger'
export type BadgeSize = 'small' | 'medium' | 'large'

const VALID_VARIANTS: ReadonlySet<BadgeVariant> = new Set(['primary', 'success', 'neutral', 'warning', 'danger'])
const VALID_SIZES: ReadonlySet<BadgeSize> = new Set(['small', 'medium', 'large'])

export interface CreateBadgeOptions {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  pulse?: boolean
  pill?: boolean
  isDynamic?: boolean
  isDecorative?: boolean
  ariaLabel?: string
}

export interface BadgeState {
  variant: Atom<BadgeVariant>
  size: Atom<BadgeSize>
  dot: Atom<boolean>
  pulse: Atom<boolean>
  pill: Atom<boolean>
  isDynamic: Atom<boolean>
  isDecorative: Atom<boolean>
  isEmpty: Computed<boolean>
}

export interface BadgeActions {
  setVariant(value: BadgeVariant): void
  setSize(value: BadgeSize): void
  setDot(value: boolean): void
  setPulse(value: boolean): void
  setPill(value: boolean): void
  setDynamic(value: boolean): void
  setDecorative(value: boolean): void
}

export type BadgeProps = {
  role?: 'status' | 'presentation'
  'aria-live'?: 'polite'
  'aria-atomic'?: 'true'
  'aria-hidden'?: 'true'
  'aria-label'?: string
}

export interface BadgeContracts {
  getBadgeProps(): BadgeProps
}

export interface BadgeModel {
  readonly state: BadgeState
  readonly actions: BadgeActions
  readonly contracts: BadgeContracts
}

export function createBadge(options: CreateBadgeOptions = {}): BadgeModel {
  const initialVariant = VALID_VARIANTS.has(options.variant as BadgeVariant) ? options.variant! : 'neutral'
  const initialSize = VALID_SIZES.has(options.size as BadgeSize) ? options.size! : 'medium'

  const variantAtom = atom<BadgeVariant>(initialVariant, 'badge.variant')
  const sizeAtom = atom<BadgeSize>(initialSize, 'badge.size')
  const dotAtom = atom<boolean>(options.dot ?? false, 'badge.dot')
  const pulseAtom = atom<boolean>(options.pulse ?? false, 'badge.pulse')
  const pillAtom = atom<boolean>(options.pill ?? false, 'badge.pill')
  const isDynamicAtom = atom<boolean>(options.isDynamic ?? false, 'badge.isDynamic')
  const isDecorativeAtom = atom<boolean>(options.isDecorative ?? false, 'badge.isDecorative')

  const isEmptyAtom = computed(() => dotAtom(), 'badge.isEmpty')

  const actions: BadgeActions = {
    setVariant: action((value: BadgeVariant) => {
      if (VALID_VARIANTS.has(value)) {
        variantAtom.set(value)
      }
    }, 'badge.setVariant'),

    setSize: action((value: BadgeSize) => {
      if (VALID_SIZES.has(value)) {
        sizeAtom.set(value)
      }
    }, 'badge.setSize'),

    setDot: action((value: boolean) => {
      dotAtom.set(value)
    }, 'badge.setDot'),

    setPulse: action((value: boolean) => {
      pulseAtom.set(value)
    }, 'badge.setPulse'),

    setPill: action((value: boolean) => {
      pillAtom.set(value)
    }, 'badge.setPill'),

    setDynamic: action((value: boolean) => {
      isDynamicAtom.set(value)
    }, 'badge.setDynamic'),

    setDecorative: action((value: boolean) => {
      isDecorativeAtom.set(value)
    }, 'badge.setDecorative'),
  }

  const contracts: BadgeContracts = {
    getBadgeProps(): BadgeProps {
      if (isDecorativeAtom()) {
        return {
          role: 'presentation',
          'aria-hidden': 'true',
        }
      }

      if (isDynamicAtom()) {
        const props: BadgeProps = {
          role: 'status',
          'aria-live': 'polite',
          'aria-atomic': 'true',
        }
        if (options.ariaLabel != null) {
          props['aria-label'] = options.ariaLabel
        }
        return props
      }

      // Static, non-decorative
      const props: BadgeProps = {}
      if (options.ariaLabel != null) {
        props['aria-label'] = options.ariaLabel
      }
      return props
    },
  }

  const state: BadgeState = {
    variant: variantAtom,
    size: sizeAtom,
    dot: dotAtom,
    pulse: pulseAtom,
    pill: pillAtom,
    isDynamic: isDynamicAtom,
    isDecorative: isDecorativeAtom,
    isEmpty: isEmptyAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
