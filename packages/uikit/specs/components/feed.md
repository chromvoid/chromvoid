# cv-feed

Bidirectional infinite-scrolling feed container that dynamically loads articles as the user scrolls, with APG-compliant keyboard navigation and focus management.

**Headless:** [`createFeed`](../../../headless/specs/components/feed.md)

## Cross-Spec Consistency

This document is the UIKit surface contract for Feed.

- Headless `createFeed` is the source of truth for state, transitions, and invariants.
- UIKit mirrors headless contracts through DOM attributes and events.
- Any intentional divergence between UIKit and headless MUST be documented in both specs.

## Anatomy

```
<cv-feed> (host)
└── <div part="base" role="feed">
    ├── <div part="sentinel-top">                ← IntersectionObserver target for loading newer
    ├── <div part="loading-indicator" aria-hidden="true">  ← only when [loading]
    │   └── <slot name="loading">
    ├── <slot name="empty">                      ← only when [empty]
    ├── <slot name="error">                      ← only when [error]
    ├── <slot>                                   ← accepts <cv-feed-article> children
    └── <div part="sentinel-bottom">             ← IntersectionObserver target for loading more
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | String | `""` | Accessible name for the feed (`aria-label`) |
| `busy` | Boolean | `false` | Reflects `aria-busy` during load operations |
| `loading` | Boolean | `false` | Shows loading indicator |
| `empty` | Boolean | `false` | Indicates no articles are loaded (read-only, reflected from headless) |
| `error` | Boolean | `false` | Indicates an error state is present (read-only, reflected from headless) |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | One or more `<cv-feed-article>` children |
| `empty` | Content shown when the feed has no articles |
| `error` | Content shown when the feed is in an error state |
| `loading` | Custom loading indicator content |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper with `role="feed"` |
| `sentinel-top` | `<div>` | Top intersection sentinel for loading newer content |
| `sentinel-bottom` | `<div>` | Bottom intersection sentinel for loading more content |
| `empty` | `<slot>` | Empty state slot wrapper |
| `error` | `<slot>` | Error state slot wrapper |
| `loading-indicator` | `<div>` | Loading indicator wrapper |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-feed-gap` | `var(--cv-space-3, 12px)` | Spacing between articles |
| `--cv-feed-padding-block` | `var(--cv-space-3, 12px)` | Vertical padding of the feed container |
| `--cv-feed-padding-inline` | `0` | Horizontal padding of the feed container |
| `--cv-feed-sentinel-height` | `1px` | Height of sentinel elements (should remain minimal) |
| `--cv-feed-loading-min-height` | `48px` | Minimum height of the loading indicator area |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([busy])` | Feed is busy loading content; `aria-busy="true"` on the feed root |
| `:host([loading])` | Loading indicator is visible |
| `:host([empty])` | Feed has no articles; empty slot is rendered |
| `:host([error])` | Feed has an error; error slot is rendered |

## ARIA Contract

- Root element has `role="feed"`
- Root element exposes `aria-label` (from `label` attribute) and `aria-busy` (from `busy` attribute)
- The feed container itself is NOT focusable
- Articles are focusable via roving tabindex managed by headless
- `Ctrl+End` and `Ctrl+Home` move focus outside the feed (adapter responsibility)

All ARIA attributes on the feed root are derived from `contracts.getFeedProps()`. UIKit does not compute ARIA state independently.

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-load-more` | `{}` | Fired when the bottom sentinel enters the viewport (IntersectionObserver) |
| `cv-load-newer` | `{}` | Fired when the top sentinel enters the viewport (IntersectionObserver) |
| `cv-exit-after` | `{}` | Fired on `Ctrl+End`; consumer should move focus after the feed |
| `cv-exit-before` | `{}` | Fired on `Ctrl+Home`; consumer should move focus before the feed |

These events are output-only signals. The feed does not use `input` or `change` events because it has no user-modifiable value state.

## Reactive State Mapping

`cv-feed` is a visual adapter over headless `createFeed`.

### Attribute to Headless (UIKit -> Headless)

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `label` | attr -> option | passed as `ariaLabel` in `createFeed(options)` |
| `busy` | attr -> action | `actions.setBusy(value)` |

### Headless to DOM (Headless -> UIKit)

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.isBusy()` | state -> attr | `[busy]` host attribute |
| `state.isLoading()` | state -> attr | `[loading]` host attribute |
| `state.isEmpty()` | state -> attr | `[empty]` host attribute |
| `state.hasError()` | state -> attr | `[error]` host attribute |
| `state.error()` | state -> render | error message available for the error slot |
| `state.canLoadMore()` | state -> render | bottom sentinel visibility / observer activation |
| `state.canLoadNewer()` | state -> render | top sentinel visibility / observer activation |
| `state.articleIds()` | state -> render | ordered list for rendering articles |
| `state.activeArticleId()` | state -> render | focus management on child articles |

### Contract Spreading

- `contracts.getFeedProps()` is spread onto `[part="base"]` -- applies `role`, `aria-label`, `aria-busy`
- `contracts.getArticleProps(articleId)` is spread onto each `cv-feed-article` child -- applies `role`, `tabindex`, `aria-posinset`, `aria-setsize`, `aria-disabled`, `data-active`, `onFocus`

### UIKit-Only Concerns (NOT in headless)

- IntersectionObserver setup on `[part="sentinel-top"]` and `[part="sentinel-bottom"]`
- DOM focus transfer for `Ctrl+End` / `Ctrl+Home` (dispatches `cv-exit-after` / `cv-exit-before` events)
- Empty state and error state conditional slot rendering
- Loading indicator rendering
- `cv-load-more` and `cv-load-newer` event dispatch

## Behavioral Contract

### Bidirectional Loading

- The bottom sentinel `[part="sentinel-bottom"]` is observed via IntersectionObserver. When it intersects the viewport and `state.canLoadMore()` is `true`, `actions.loadMore()` is called and `cv-load-more` is dispatched.
- The top sentinel `[part="sentinel-top"]` is observed via IntersectionObserver. When it intersects the viewport and `state.canLoadNewer()` is `true`, `actions.loadNewer()` is called and `cv-load-newer` is dispatched.
- Concurrent load operations are guarded by headless (second call is a no-op while loading).

### Keyboard Navigation

Per W3C APG Feed Pattern:

- `PageDown`: move focus to the next article (headless `focusNextArticle`)
- `PageUp`: move focus to the previous article (headless `focusPrevArticle`)
- `Ctrl+End`: dispatch `cv-exit-after` event; consumer moves focus after the feed
- `Ctrl+Home`: dispatch `cv-exit-before` event; consumer moves focus before the feed

Keyboard events are forwarded to `actions.handleKeyDown(event)`. The return value determines adapter behavior:
- `'next'` / `'prev'`: headless handled focus movement
- `'exit-after'`: UIKit dispatches `cv-exit-after`
- `'exit-before'`: UIKit dispatches `cv-exit-before`
- `null`: key not handled, no action

### Conditional Rendering

- When `state.isEmpty()` is `true`, the `empty` named slot is rendered and the default slot is hidden.
- When `state.hasError()` is `true`, the `error` named slot is rendered.
- When `state.isLoading()` is `true`, the `loading` named slot / default loading indicator is rendered.
- Empty and error states are not mutually exclusive with loading; the feed may show a loading indicator alongside an error slot.

## Usage

```html
<!-- Basic feed -->
<cv-feed label="Latest posts">
  <cv-feed-article article-id="post-1">
    <h3>First Post</h3>
    <p>Content of the first post.</p>
  </cv-feed-article>
  <cv-feed-article article-id="post-2">
    <h3>Second Post</h3>
    <p>Content of the second post.</p>
  </cv-feed-article>
</cv-feed>

<!-- Feed with empty and error states -->
<cv-feed label="Activity feed">
  <div slot="empty">No activity yet.</div>
  <div slot="error">Failed to load. Please try again.</div>
  <div slot="loading">Loading articles...</div>
</cv-feed>

<!-- Feed with event handling for infinite scroll -->
<cv-feed
  label="News feed"
  @cv-load-more=${handleLoadMore}
  @cv-load-newer=${handleLoadNewer}
  @cv-exit-after=${handleExitAfter}
  @cv-exit-before=${handleExitBefore}
>
  <cv-feed-article article-id="news-1">
    <h3>Breaking News</h3>
    <p>Details here.</p>
  </cv-feed-article>
</cv-feed>
```

## Child Elements

### cv-feed-article

Individual article within a feed. The parent `cv-feed` manages all ARIA attributes on this element via headless contracts.

#### Anatomy

```
<cv-feed-article> (host)
└── <div part="base" role="article">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `article-id` | String | `""` | Required unique identifier for this article within the feed |
| `active` | Boolean | `false` | Whether this article is the currently focused article. Managed by parent. |
| `disabled` | Boolean | `false` | Whether this article is disabled (skipped during keyboard navigation) |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Article content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper with `role="article"` |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-feed-article-padding` | `var(--cv-space-3, 12px)` | Padding inside the article |
| `--cv-feed-article-border-radius` | `var(--cv-radius-sm, 6px)` | Border radius of the article |
| `--cv-feed-article-focus-ring` | `2px solid var(--cv-color-primary, #65d7ff)` | Focus ring style for the active article |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Article is the currently focused/active article in the feed |
| `:host([disabled])` | Article is disabled and skipped during keyboard navigation |

#### Reactive State Mapping

`cv-feed-article` receives its ARIA props from the parent `cv-feed` via `contracts.getArticleProps(articleId)`:

| Contract Prop | DOM Reflection |
|---------------|----------------|
| `role` | `role="article"` on `[part="base"]` |
| `tabindex` | `tabindex="0"` (active) or `tabindex="-1"` (inactive) on host |
| `aria-posinset` | Position within the feed (1-based) |
| `aria-setsize` | Total article count or `-1` if unknown |
| `aria-disabled` | `"true"` when article is disabled |
| `data-active` | `"true"` or `"false"` reflecting active state |
| `onFocus` | Sets this article as active in headless state |
