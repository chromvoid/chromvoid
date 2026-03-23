# Signals Integration Blueprint for Headless + Lit

## Goal

Make `@chromvoid/headless-ui` reactive out of the box for UI libraries (Lit included),
without requiring manual subscriptions or imperative sync glue.

The key idea is simple:

- headless models expose **signals as first-class state**
- UI layer reads signals in render
- updates propagate automatically

## Why this matters

If headless returns plain mutable objects, UI adapters must re-render manually.
That causes drift and duplicate wiring.

If headless returns signals/derived signals, UI becomes declarative:

- read state in template
- call actions in handlers
- done

## Product Principle (Pre-v1)

The package currently has no external production consumers.

Therefore, pre-v1 API design should optimize for **best consumer ergonomics**,
not backward compatibility with interim internal shapes.

Rule:

- API redesign is allowed when it produces a cleaner and more consistent consumer DX.

## Design Principles

1. **Signal-first state**

- expose atoms/computed values, not snapshots
- never require `requestUpdate`-style manual sync in consumers

2. **Intent-first actions**

- keyboard/pointer handlers call model actions
- model owns state transitions and APG semantics

3. **Contract-first props**

- `get*Props` returns ARIA/role/tabindex contracts from current signal state
- no visual decisions in headless contracts

4. **Adapter-thinness**

- Lit adapter maps state and handlers only
- no business logic in adapters

## Recommended Public Shape per Component

Each component model should follow this structure:

```ts
type XModel = {
  state: {
    // atoms/computed signals
    activeId: Atom<string | null>
    selectedIds: Atom<string[]>
    isOpen: Atom<boolean>
  }
  actions: {
    moveNext(): void
    movePrev(): void
    select(id: string): void
    handleKeyDown(event: KeyboardEvent): void
  }
  contracts: {
    getRootProps(): RootProps
    getItemProps(id: string): ItemProps
  }
}
```

Important:

- `state` must be signal references
- `contracts` must derive from signals
- `actions` must be the only mutation path

## Reatom Implementation Pattern

Use Reatom for headless model internals:

- `atom` for mutable state
- `computed` for derived state and props-ready values
- `action` for transitions

Example (simplified):

```ts
import {atom, action, computed} from '@reatom/core'

export const createListbox = () => {
  const activeId = atom<string | null>(null, 'listbox.activeId')
  const selectedIds = atom<string[]>([], 'listbox.selectedIds')

  const isSelectionEmpty = computed(() => selectedIds().length === 0, 'listbox.isSelectionEmpty')

  const moveNext = action(() => {
    // transition logic
  }, 'listbox.moveNext')

  const select = action((id: string) => {
    selectedIds.set([id])
    activeId.set(id)
  }, 'listbox.select')

  const getRootProps = () => ({
    role: 'listbox' as const,
    tabindex: '0' as const,
    'aria-activedescendant': activeId() ?? undefined,
  })

  return {
    state: {activeId, selectedIds, isSelectionEmpty},
    actions: {moveNext, select},
    contracts: {getRootProps},
  }
}
```

## Lit Consumption Pattern

For Lit-based UI library, the adapter should read signals directly in `render`.

If you use a signal-aware base element (for example an XLit-style base),
this gives automatic dependency tracking.

```ts
class ListboxView extends XLitElement {
  model = createListbox()

  render() {
    const rootProps = this.model.contracts.getRootProps()
    return html`
      <div
        role=${rootProps.role}
        tabindex=${rootProps.tabindex}
        aria-activedescendant=${rootProps['aria-activedescendant'] ?? nothing}
        @keydown=${this.model.actions.handleKeyDown}
      >
        Active: ${this.model.state.activeId() ?? 'none'}
      </div>
    `
  }
}
```

## Packaging Strategy

Use two-layer package strategy:

1. `@chromvoid/headless-ui`

- pure headless contracts and Reatom models
- no Lit dependency

2. `@chromvoid/ui` (optional UI kit package)

- tiny wrappers/helpers for Lit ergonomics
- no business logic

This keeps core portable and gives Lit users first-class DX.

## Migration Path from Current Signal Models

Current models already use Reatom signals internally.
Migration should focus on API and adapter ergonomics:

1. keep public `state` fields explicitly typed as signal references (`Atom`/`Computed`)
2. keep contract derivation inside model (`contracts.get*Props`) only
3. ensure adapter-level reactive rendering coverage stays green
4. publish migration notes for any pre-v1 contract reshaping

## Testing Requirements for Signal Integration

For each component, add tests for:

1. signal updates after actions
2. computed contract consistency
3. keyboard action -> signal transition mapping
4. adapter-level reactive rendering behavior (Lit integration tests)

## Anti-Patterns to Avoid

- returning only snapshot objects from `state`
- deriving ARIA props outside the model
- mixing UI logic into model actions
- exposing mutable arrays/objects without signal wrappers
- requiring manual re-render calls from component consumers

## Practical Next Step

Start with one component migration end-to-end:

1. redesign `listbox` to a signal-first consumer API
2. align naming and return shape for future components
3. add one Lit integration demo proving out-of-box reactivity
4. use this as template for `combobox`, `menu`, `tabs`, `treeview`
