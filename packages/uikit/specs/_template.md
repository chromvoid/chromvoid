# cv-{name}

One-sentence description of the component's purpose.

**Headless:** [`create{Name}`](../../headless/specs/components/{name}.md)

## Anatomy

```
<cv-{name}> (host)
└── <div part="base">
    └── <slot>
```

## Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `example` | Boolean | `false` | Description |

## Variants

> _Include only if the component has visual variants (e.g. solid, outline, ghost)._

| Variant | Description |
|---------|-------------|
| `solid` | Default filled style |

## Sizes

> _Include only if the component has size options._

| Size | Description |
|------|-------------|
| `md` | Default size |

## Slots

| Slot | Description |
|------|-------------|
| `(default)` | Main content |

## CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | Root wrapper | Outermost interactive/layout element |

## CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--cv-{name}-*` | `…` | Description |

## Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([state])` | Description |

## Events

| Event | Detail | Description |
|-------|--------|-------------|
| `input` | `{…}` | Fires on interaction |
| `change` | `{…}` | Fires when value commits |

## Usage

```html
<cv-{name}>Content</cv-{name}>
```

## Child Elements

> _Include only for composite components (parent + child). Each child element gets its own Anatomy, Attributes, Slots, CSS Parts, and Visual States subsections._

### cv-{child-name}

#### Anatomy

```
<cv-{child-name}> (host)
└── <div part="base">
    └── <slot>
```

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | String | `""` | Identifier |

#### Slots

| Slot | Description |
|------|-------------|
| `(default)` | Content |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `base` | Root wrapper | Outermost element |

#### Visual States

| Host selector | Description |
|---------------|-------------|
| `:host([state])` | Description |
