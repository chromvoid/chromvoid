# cv-landmark

Semantic wrapper that identifies a page region as an ARIA landmark for assistive technology navigation.

**Headless:** [`createLandmark`](../../../headless/specs/components/landmarks.md)

## Anatomy

```
<cv-landmark> (host)
└── <section part="base" role="…">
    └── <slot>
```

## Attributes

| Attribute  | Type   | Default    | Description |
|------------|--------|------------|-------------|
| `type`     | String | `"region"` | Landmark role: `banner` \| `main` \| `navigation` \| `complementary` \| `contentinfo` \| `search` \| `form` \| `region` |
| `label`    | String | `""`       | Accessible label applied via `aria-label` |
| `label-id` | String | `""`      | ID of the external labelling element, applied via `aria-labelledby` (takes precedence over `label`) |

## Slots

| Slot        | Description |
|-------------|-------------|
| `(default)` | Landmark content |

## CSS Parts

| Part   | Element     | Description |
|--------|-------------|-------------|
| `base` | `<section>` | Root landmark element with ARIA role |

## CSS Custom Properties

None. `cv-landmark` is a pure semantic wrapper with `display: block` only.

## Visual States

| Host selector            | Description |
|--------------------------|-------------|
| `:host`                  | `display: block`; no additional visual styling |

## Events

None. Landmark has no user-driven interactions.

## Reactive State Mapping

`cv-landmark` is a visual adapter over headless `createLandmark`.

| UIKit Property | Direction    | Headless Binding |
|----------------|-------------|------------------|
| `type`         | attr → option | passed as `type` in `createLandmark(options)` |
| `label`        | attr → option | passed as `label` in `createLandmark(options)` |
| `label-id`     | attr → option | passed as `labelId` in `createLandmark(options)` |

| Headless State    | Direction    | DOM Reflection |
|-------------------|-------------|----------------|
| `state.type()`    | state → attr | `[type]` host attribute |
| `state.label()`   | state → attr | `[label]` host attribute |
| `state.labelId()` | state → attr | `[label-id]` host attribute |

- `contracts.getLandmarkProps()` is spread onto the inner `[part="base"]` element to apply `role`, `aria-label`, and `aria-labelledby`.
- When any of `type`, `label`, or `label-id` attributes change, the headless model is recreated with updated options.
- UIKit does not own labeling precedence logic; headless `getLandmarkProps()` determines whether `aria-label` or `aria-labelledby` is emitted.

## Usage

```html
<cv-landmark type="navigation" label="Main navigation">
  <nav-links></nav-links>
</cv-landmark>

<cv-landmark type="main">
  <page-content></page-content>
</cv-landmark>

<cv-landmark type="complementary" label="Related articles">
  <aside-content></aside-content>
</cv-landmark>

<cv-landmark type="search" label="Site search">
  <search-form></search-form>
</cv-landmark>

<cv-landmark type="region" label-id="section-heading">
  <h2 id="section-heading">Latest News</h2>
  <article-list></article-list>
</cv-landmark>
```
