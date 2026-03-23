# cv-carousel

Slideshow component that cycles through a set of slides with navigation controls, indicators, and optional autoplay.

**Headless:** [`createCarousel`](../../../headless/specs/components/carousel.md)

## Anatomy

```
<cv-carousel> (host)
└── <section part="base" role="region" aria-roledescription="carousel">
    ├── <div part="controls">
    │   ├── <button part="control prev" aria-label="Previous slide">
    │   ├── <button part="control next" aria-label="Next slide">
    │   └── <button part="control play-pause" aria-label="Stop/Start slide rotation">
    ├── <div part="slides" role="group">
    │   └── <slot>                         ← cv-carousel-slide elements
    └── <div part="indicators">
        └── <button part="indicator">      ← one per slide
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Identifier of the active slide (matches `cv-carousel-slide[value]`) |
| `active-index` | Number | `0` | Zero-based index of the active slide |
| `autoplay` | Boolean | `false` | Enables automatic slide rotation |
| `autoplay-interval` | Number | `5000` | Autoplay interval in milliseconds |
| `visible-slides` | Number | `1` | Number of slides visible at once |
| `paused` | Boolean | `false` | Whether autoplay is paused |
| `aria-label` | String | `""` | Accessible name for the carousel region |
| `aria-labelledby` | String | `""` | ID of the element that labels the carousel |

`value` and `active-index` are synchronized: setting one updates the other. When both are set, `value` takes precedence.

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | `cv-carousel-slide` elements |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<section>` | Root wrapper with `role="region"` and `aria-roledescription="carousel"` |
| `controls` | `<div>` | Container for navigation and play/pause buttons |
| `slides` | `<div>` | Slide container with `role="group"` |
| `indicators` | `<div>` | Container for indicator buttons |
| `control` | `<button>` | Shared part on all control buttons (prev, next, play-pause) |
| `prev` | `<button>` | Previous slide button (also has `control` part) |
| `next` | `<button>` | Next slide button (also has `control` part) |
| `play-pause` | `<button>` | Play/pause toggle button (also has `control` part) |
| `indicator` | `<button>` | Individual indicator button; `[data-active="true"]` when its slide is active |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-carousel-gap` | `var(--cv-space-2, 8px)` | Gap between base layout sections (controls, slides, indicators) |
| `--cv-carousel-control-size` | `32px` | Min block/inline size of control and indicator buttons |
| `--cv-carousel-control-radius` | `var(--cv-radius-sm, 6px)` | Border radius of control and indicator buttons |
| `--cv-carousel-slide-min-height` | `120px` | Minimum block size of each slide |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([autoplay])` | Autoplay is enabled |
| `:host([paused])` | Autoplay is paused (user-initiated or focus/hover-induced) |
| `:host([active-index])` | Reflects the current active slide index |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `cv-input` | `{activeIndex: number, activeValue: string \| null, paused: boolean}` | Fires on any state change (active index or paused state) |
| `cv-change` | `{activeIndex: number, activeValue: string \| null, paused: boolean}` | Fires when the active slide index changes |

Both events bubble and are composed. `cv-input` fires on every state change (index or pause). `cv-change` fires only when the active index changes.

## Reactive State Mapping

`cv-carousel` is a visual adapter over headless `createCarousel`.

| UIKit Property | Direction | Headless Binding |
|----------------|-----------|------------------|
| `active-index` | attr -> action | `actions.moveTo(value)` |
| `value` | attr -> action | resolved to index via slide records, then `actions.moveTo(index)` |
| `paused` | attr -> action | `actions.pause()` / `actions.play()` |
| `autoplay` | attr -> option | passed as `autoplay` in `createCarousel(options)` |
| `autoplay-interval` | attr -> option | passed as `autoplayIntervalMs` in `createCarousel(options)` |
| `visible-slides` | attr -> option | passed as `visibleSlides` in `createCarousel(options)` |
| `aria-label` | attr -> option | passed as `ariaLabel` in `createCarousel(options)` |
| `aria-labelledby` | attr -> option | passed as `ariaLabelledBy` in `createCarousel(options)` |

| Headless State | Direction | DOM Reflection |
|----------------|-----------|----------------|
| `state.activeSlideIndex()` | state -> attr | `[active-index]` host attribute |
| `state.isPaused()` | state -> attr | `[paused]` host attribute |
| `state.slideCount()` | state -> render | determines number of indicator buttons |
| `state.visibleSlideIndices()` | state -> render | determines `aria-hidden` and `data-active` on slides |

**Contract spreading:**

- `contracts.getRootProps()` is spread onto `[part="base"]` (`role`, `aria-roledescription`, `aria-label`, `aria-labelledby`, `aria-live`, focus/pointer handlers).
- `contracts.getSlideGroupProps()` is spread onto `[part="slides"]` (`role`, `aria-label`).
- `contracts.getSlideProps(index)` is spread onto each `cv-carousel-slide` element (`role`, `aria-roledescription`, `aria-label`, `aria-hidden`, `data-active`).
- `contracts.getPrevButtonProps()` is spread onto `[part="prev"]` (`aria-controls`, `aria-label`, `onClick`).
- `contracts.getNextButtonProps()` is spread onto `[part="next"]` (`aria-controls`, `aria-label`, `onClick`).
- `contracts.getPlayPauseButtonProps()` is spread onto `[part="play-pause"]` (`aria-controls`, `aria-label`, `onClick`). Returns `aria-label` only, no `aria-pressed` per W3C APG guidance.
- `contracts.getIndicatorProps(index)` is spread onto each `[part="indicator"]` (`aria-controls`, `aria-label`, `aria-current`, `data-active`, `onClick`).

**UIKit does NOT own:**

- Navigation logic (wrapping, clamping) -- headless `moveNext`/`movePrev`/`moveTo`.
- Autoplay timer lifecycle -- headless manages start/stop/resume.
- `aria-live` toggling -- headless sets `off` during autoplay, `polite` on manual navigation.
- Pause-on-focus / pause-on-hover -- headless focus/pointer handlers.

## Keyboard Interaction

Keyboard events are delegated to `actions.handleKeyDown()`. The UIKit layer only prevents default on carousel-relevant keys.

| Key | Action |
|-----|--------|
| `ArrowRight` | Move to next slide |
| `ArrowLeft` | Move to previous slide |
| `Home` | Move to first slide |
| `End` | Move to last slide |

## Swipe Gesture

The UIKit adapter provides basic horizontal swipe detection on the `[part="slides"]` area:

- A horizontal swipe right-to-left triggers `actions.moveNext()`.
- A horizontal swipe left-to-right triggers `actions.movePrev()`.
- Swipe detection uses `pointerdown` / `pointermove` / `pointerup` with a minimum distance threshold.
- Vertical scrolling is not intercepted; the gesture must be predominantly horizontal to trigger navigation.

This is a UIKit-only concern; the headless model does not handle touch/swipe.

## Imperative API

| Method | Description |
|--------|-------------|
| `next()` | Advance to the next slide |
| `prev()` | Go to the previous slide |
| `play()` | Resume autoplay |
| `pause()` | Pause autoplay |

## Usage

```html
<!-- Basic carousel -->
<cv-carousel aria-label="Product gallery">
  <cv-carousel-slide value="slide-1">Slide 1 content</cv-carousel-slide>
  <cv-carousel-slide value="slide-2">Slide 2 content</cv-carousel-slide>
  <cv-carousel-slide value="slide-3">Slide 3 content</cv-carousel-slide>
</cv-carousel>

<!-- Autoplay carousel -->
<cv-carousel aria-label="News feed" autoplay autoplay-interval="3000">
  <cv-carousel-slide value="news-1">Breaking news</cv-carousel-slide>
  <cv-carousel-slide value="news-2">Sports update</cv-carousel-slide>
</cv-carousel>

<!-- Multiple visible slides -->
<cv-carousel aria-label="Team members" visible-slides="3">
  <cv-carousel-slide value="member-1">Alice</cv-carousel-slide>
  <cv-carousel-slide value="member-2">Bob</cv-carousel-slide>
  <cv-carousel-slide value="member-3">Charlie</cv-carousel-slide>
  <cv-carousel-slide value="member-4">Diana</cv-carousel-slide>
</cv-carousel>

<!-- Controlled by value -->
<cv-carousel aria-label="Steps" value="step-2">
  <cv-carousel-slide value="step-1">Step 1</cv-carousel-slide>
  <cv-carousel-slide value="step-2">Step 2</cv-carousel-slide>
  <cv-carousel-slide value="step-3">Step 3</cv-carousel-slide>
</cv-carousel>
```

## Child Elements

### cv-carousel-slide

Individual slide within a carousel. The parent `cv-carousel` manages all ARIA attributes on this element via headless contracts.

#### Anatomy

```
<cv-carousel-slide> (host)
└── <div part="base">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Unique identifier for this slide. Auto-generated as `slide-{n}` if omitted. |
| `label` | String | `""` | Accessible label for the slide. Falls back to `textContent` if omitted. |
| `active` | Boolean | `false` | Whether this slide is currently active. Managed by parent. |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Slide content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | `<div>` | Root wrapper for the slide content |

#### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-carousel-slide-min-height` | `120px` | Minimum block size of the slide |
| `--cv-carousel-slide-padding` | `var(--cv-space-4, 16px)` | Padding inside the slide |
| `--cv-carousel-slide-radius` | `var(--cv-radius-md, 10px)` | Border radius of the slide |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([active])` | Slide is currently active; border uses `--cv-color-primary` |
| `:host([hidden])` | Slide is not visible; `display: none` |
