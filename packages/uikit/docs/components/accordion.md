# cv-accordion

Vertically stacked set of interactive sections that expand or collapse to reveal content.

**Headless:** [`createAccordion`](../../../headless/specs/components/accordion.md)

```html
<cv-accordion aria-label="Example accordion">
  <cv-accordion-item value="about" expanded>
    <span slot="trigger">About</span>
    <p>ChromVoid UIKit provides accessible, customizable web components built on a headless architecture.</p>
  </cv-accordion-item>
  <cv-accordion-item value="features">
    <span slot="trigger">Features</span>
    <p>Keyboard navigation, ARIA attributes, smooth animations, and full CSS customization out of the box.</p>
  </cv-accordion-item>
  <cv-accordion-item value="usage">
    <span slot="trigger">Getting Started</span>
    <p>Import the component and use it directly in your HTML — no framework required.</p>
  </cv-accordion-item>
</cv-accordion>
```

<!--@include: ../../specs/components/accordion.md{7,}-->
