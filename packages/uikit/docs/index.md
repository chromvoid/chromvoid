---
layout: home

hero:
  name: ChromVoid UIKit
  text: Headless behavior, sharp visual layer
  tagline: Lit web components with accessible interactions and token-driven theming.
  actions:
    - theme: brand
      text: Start Building
      link: /guide/getting-started
    - theme: alt
      text: Browse Components
      link: /components/

features:
  - title: Composable by default
    details: Built on top of @chromvoid/headless-ui so interaction logic stays reusable and easy to test.
  - title: Theme as data
    details: Use "--cv-*" tokens and the theme engine API to swap visual identity without rewriting components.
  - title: Production oriented
    details: Small, focused component set with keyboard support, state semantics, and deterministic behavior.
---

<section class="uikit-intro">
  <p>
    UIKit is the UI skin for ChromVoid products. It keeps behavior in headless models and ships
    a thin component layer for consistent interaction and visual language.
  </p>
</section>

<ClientOnly>
  <section class="uikit-live">
    <h2>Live Preview</h2>
    <p>Core controls previewed directly in docs.</p>
    <div class="uikit-shell component-grid">
      <section class="component-card">
        <h3>Action</h3>
        <div class="example-row">
          <cv-button>Continue</cv-button>
          <cv-button disabled>Disabled</cv-button>
        </div>
      </section>
      <section class="component-card">
        <h3>Selection</h3>
        <div class="example-row">
          <cv-checkbox checked>Receive updates</cv-checkbox>
          <cv-switch checked></cv-switch>
        </div>
      </section>
      <section class="component-card">
        <h3>Progress</h3>
        <cv-progress value="55" max="100"></cv-progress>
      </section>
    </div>
  </section>
</ClientOnly>
