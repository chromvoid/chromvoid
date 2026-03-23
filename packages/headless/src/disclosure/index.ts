import {action, atom, type Atom} from '@reatom/core'

export interface CreateDisclosureOptions {
  idBase?: string
  isOpen?: boolean
  isDisabled?: boolean
  name?: string
  onOpenChange?: (isOpen: boolean) => void
}

export interface DisclosureState {
  isOpen: Atom<boolean>
  isDisabled: Atom<boolean>
  name: Atom<string | null>
}

export interface DisclosureActions {
  open(): void
  close(): void
  toggle(): void
  setDisabled(value: boolean): void
  setName(value: string | null): void
  handleClick(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
  destroy(): void
}

export interface DisclosureTriggerProps {
  id: string
  role: 'button'
  tabindex: '0' | '-1'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-disabled'?: 'true'
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => void
}

export interface DisclosurePanelProps {
  id: string
  'aria-labelledby': string
  hidden: boolean
}

export interface DisclosureContracts {
  getTriggerProps(): DisclosureTriggerProps
  getPanelProps(): DisclosurePanelProps
}

export interface DisclosureModel {
  readonly state: DisclosureState
  readonly actions: DisclosureActions
  readonly contracts: DisclosureContracts
}

// Module-level registry — not exported, internal implementation detail
const groupRegistry = new Map<string, Set<DisclosureModel>>()

function registerInGroup(name: string, model: DisclosureModel) {
  let group = groupRegistry.get(name)
  if (!group) {
    group = new Set()
    groupRegistry.set(name, group)
  }
  group.add(model)
}

function unregisterFromGroup(name: string, model: DisclosureModel) {
  const group = groupRegistry.get(name)
  if (!group) return
  group.delete(model)
  if (group.size === 0) {
    groupRegistry.delete(name)
  }
}

function closeOthersInGroup(name: string, self: DisclosureModel) {
  const group = groupRegistry.get(name)
  if (!group) return
  for (const member of group) {
    if (member !== self) {
      member.actions.close()
    }
  }
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createDisclosure(options: CreateDisclosureOptions = {}): DisclosureModel {
  const idBase = options.idBase ?? 'disclosure'

  const isOpenAtom = atom(options.isOpen ?? false, `${idBase}.isOpen`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)
  const nameAtom = atom<string | null>(options.name ?? null, `${idBase}.name`)

  const notifyOpenChange = (next: boolean) => {
    if (isOpenAtom() === next) return
    isOpenAtom.set(next)
    options.onOpenChange?.(next)
  }

  // We need a reference to `model` for registry operations, but it's not
  // created yet. Use a late-binding variable that gets assigned after model creation.
  let self: DisclosureModel

  const open = action(() => {
    if (isDisabledAtom()) return
    notifyOpenChange(true)
    const currentName = nameAtom()
    if (currentName != null) {
      closeOthersInGroup(currentName, self)
    }
  }, `${idBase}.open`)

  const close = action(() => {
    if (isDisabledAtom()) return
    notifyOpenChange(false)
  }, `${idBase}.close`)

  const toggle = action(() => {
    if (isDisabledAtom()) return
    if (isOpenAtom()) {
      close()
    } else {
      open()
    }
  }, `${idBase}.toggle`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const setName = action((value: string | null) => {
    const oldName = nameAtom()
    if (oldName === value) return
    if (oldName != null) {
      unregisterFromGroup(oldName, self)
    }
    nameAtom.set(value)
    if (value != null) {
      registerInGroup(value, self)
    }
  }, `${idBase}.setName`)

  const handleClick = action(() => {
    toggle()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
    if (isDisabledAtom()) return

    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      event.preventDefault?.()
      toggle()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault?.()
      open()
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault?.()
      close()
      return
    }
  }, `${idBase}.handleKeyDown`)

  const destroy = action(() => {
    const currentName = nameAtom()
    if (currentName != null) {
      unregisterFromGroup(currentName, self)
    }
  }, `${idBase}.destroy`)

  const triggerId = `${idBase}-trigger`
  const panelId = `${idBase}-panel`

  const actions: DisclosureActions = {
    open,
    close,
    toggle,
    setDisabled,
    setName,
    handleClick,
    handleKeyDown,
    destroy,
  }

  const contracts: DisclosureContracts = {
    getTriggerProps() {
      return {
        id: triggerId,
        role: 'button',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-expanded': isOpenAtom() ? 'true' : 'false',
        'aria-controls': panelId,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      }
    },
    getPanelProps() {
      return {
        id: panelId,
        'aria-labelledby': triggerId,
        hidden: !isOpenAtom(),
      }
    },
  }

  const state: DisclosureState = {
    isOpen: isOpenAtom,
    isDisabled: isDisabledAtom,
    name: nameAtom,
  }

  const model: DisclosureModel = {
    state,
    actions,
    contracts,
  }

  // Late-bind self for registry operations
  self = model

  // Register in group if name is provided
  const initialName = nameAtom()
  if (initialName != null) {
    registerInGroup(initialName, model)
  }

  return model
}
