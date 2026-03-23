import {type CSSResult, css} from 'lit'

// Базовые общие стили для всех компонентов (Shadow DOM scope)
// - Ресеты box-sizing
// - Минимальные CSS‑переменные темы/токенов
// - Утилиты (visually-hidden, text-ellipsis)
export const sharedStyles: CSSResult[] = [
  css`
    /* ========== БАЗОВЫЕ УТИЛИТЫ ========== */
    * {
      box-sizing: border-box;
    }
    /* Флекс-контейнеры */
    .flex {
      display: flex;
    }

    .flex-col {
      flex-direction: column;
    }

    .flex-row {
      flex-direction: row;
    }

    .flex-wrap {
      flex-wrap: wrap;
    }

    .flex-nowrap {
      flex-wrap: nowrap;
    }

    .items-center {
      align-items: center;
    }

    .items-start {
      align-items: flex-start;
    }

    .items-end {
      align-items: flex-end;
    }

    .justify-center {
      justify-content: center;
    }

    .justify-between {
      justify-content: space-between;
    }

    .justify-end {
      justify-content: flex-end;
    }

    /* Грид-контейнеры */
    .grid {
      display: grid;
    }

    .grid-cols-1 {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
    .grid-cols-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .gap-1 {
      gap: var(--app-spacing-1);
    }
    .gap-2 {
      gap: var(--app-spacing-2);
    }
    .gap-3 {
      gap: var(--app-spacing-3);
    }
    .gap-4 {
      gap: var(--app-spacing-4);
    }

    /* Прокрутка */
    .scrollable {
      overflow-y: auto;
      overflow-x: hidden;
      contain: layout style;
      scrollbar-gutter: stable both-edges;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: var(--cv-color-border) transparent;
    }

    .scrollable::-webkit-scrollbar {
      width: 6px;
    }

    .scrollable::-webkit-scrollbar-track {
      background: transparent;
    }

    .scrollable::-webkit-scrollbar-thumb {
      background: var(--cv-color-border);
      border-radius: 3px;
    }

    .scrollable::-webkit-scrollbar-thumb:hover {
      background: var(--cv-color-border-strong);
    }

    /* ========== ТИПОГРАФИКА ========== */

    .text-xs {
      font-size: var(--cv-font-size-xs);
    }
    .text-sm {
      font-size: var(--cv-font-size-sm);
    }
    .text-base {
      font-size: var(--cv-font-size-base);
    }
    .text-lg {
      font-size: var(--cv-font-size-lg);
    }
    .text-xl {
      font-size: var(--cv-font-size-xl);
    }
    .text-2xl {
      font-size: var(--cv-font-size-2xl);
    }

    .font-light {
      font-weight: var(--cv-font-weight-light);
    }
    .font-normal {
      font-weight: var(--cv-font-weight-regular);
    }
    .font-medium {
      font-weight: var(--cv-font-weight-medium);
    }
    .font-semibold {
      font-weight: var(--cv-font-weight-semibold);
    }
    .font-bold {
      font-weight: var(--cv-font-weight-bold);
    }

    .text-muted {
      color: var(--cv-color-text-muted);
    }
    .text-subtle {
      color: var(--cv-color-text-subtle);
    }

    .text-left {
      text-align: left;
    }
    .text-center {
      text-align: center;
    }
    .text-right {
      text-align: right;
    }

    /* ========== АНИМАЦИИ ========== */

    /* Базовые keyframes */
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    @keyframes slideInFromLeft {
      from {
        transform: translateX(-100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideInFromRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes zoomIn {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.05);
      }
    }

    @keyframes shake {
      0%,
      100% {
        transform: translateX(0);
      }
      10%,
      30%,
      50%,
      70%,
      90% {
        transform: translateX(-4px);
      }
      20%,
      40%,
      60%,
      80% {
        transform: translateX(4px);
      }
    }

    @keyframes shimmer {
      0% {
        background-position: -200px 0;
      }
      100% {
        background-position: calc(200px + 100%) 0;
      }
    }

    /* Анимационные классы */
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
      will-change: opacity;
      backface-visibility: hidden;
    }

    .animate-fade-out {
      animation: fadeOut 0.2s ease-in;
      will-change: opacity;
      backface-visibility: hidden;
    }

    .animate-slide-in-left {
      animation: slideInFromLeft 0.4s ease-out;
      will-change: opacity, transform;
      backface-visibility: hidden;
    }

    .animate-slide-in-right {
      animation: slideInFromRight 0.4s ease-out;
      will-change: opacity, transform;
      backface-visibility: hidden;
    }

    .animate-zoom-in {
      animation: zoomIn 0.3s ease-out;
      will-change: opacity, transform;
      backface-visibility: hidden;
    }

    .animate-spin {
      animation: spin 1s linear infinite;
      will-change: transform;
      backface-visibility: hidden;
      transform-style: preserve-3d;
    }

    .animate-pulse {
      animation: pulse 2s ease-in-out infinite;
    }

    .animate-shake {
      animation: shake 0.5s ease-in-out;
    }

    /* Скелетон загрузки */
    .shimmer {
      background: linear-gradient(
        90deg,
        var(--cv-color-border) 25%,
        var(--cv-color-border-strong) 50%,
        var(--cv-color-border) 75%
      );
      background-size: 200px 100%;
      animation: shimmer 1.5s infinite;
      border-radius: var(--cv-radius-1);
    }

    /* ========== ДОСТУПНОСТЬ ========== */

    /* Экранный ридер только */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Кастомные фокус-ринги */
    .focus-ring {
      outline: none;
    }

    .focus-ring:focus-visible {
      outline: 2px solid var(--cv-color-focus, #3b82f6);
      outline-offset: 2px;
    }

    /* ========== ПЕРЕХОДЫ ========== */

    .transition-fast {
      transition: all var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .transition-normal {
      transition: all var(--cv-duration-normal) var(--cv-easing-standard);
    }

    .transition-slow {
      transition: all var(--cv-duration-slow) var(--cv-easing-standard);
    }

    .transition-colors {
      transition:
        color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .transition-transform {
      transition: transform var(--cv-duration-normal) var(--cv-easing-spring);
    }

    .transition-opacity {
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    /* ========== HOVER ЭФФЕКТЫ ========== */

    .hover-lift {
      transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
    }

    .hover-lift:hover {
      transform: translateY(-2px);
    }

    .hover-scale {
      transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
    }

    .hover-scale:hover {
      transform: scale(1.05);
    }

    .hover-glow {
      transition: box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .hover-glow:hover {
      box-shadow: 0 0 20px color-mix(in oklch, var(--cv-color-info) 50%, transparent);
    }

    /* ========== ЗАГРУЗКИ ========== */

    .loading {
      position: relative;
      pointer-events: none;
      opacity: 0.7;
    }

    .loading::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--cv-color-surface);
      opacity: 0.8;
      z-index: 1;
    }

    .loading::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      margin: -10px 0 0 -10px;
      border: 2px solid var(--cv-color-primary);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      z-index: 2;
    }

    /* ========== MEDIA QUERIES ========== */

    /* Снижение движения для пользователей, предпочитающих минимум анимаций */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
        transform: none !important;
      }

      .animate-fade-in,
      .animate-fade-out,
      .animate-slide-in-left,
      .animate-slide-in-right,
      .animate-zoom-in,
      .hover-lift:hover,
      .hover-scale:hover {
        transform: none !important;
      }

      .shimmer {
        background: var(--cv-color-surface) !important;
        animation: none !important;
      }

      .loading {
        opacity: 1 !important;
      }

      .loading::before,
      .loading::after {
        display: none !important;
      }
    }

    /* Улучшенный контраст для пользователей с плохим зрением */
    @media (prefers-contrast: high) {
      .animate-fade-in,
      .animate-fade-out {
        opacity: 1 !important;
      }
    }
  `,
  css`
    /* ========== ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ АНИМАЦИЙ ========== */
    .will-animate {
      will-change: transform, opacity;
    }
    .will-animate-transform {
      will-change: transform;
    }
    .will-animate-opacity {
      will-change: opacity;
    }
    .will-animate-colors {
      will-change: color, background-color, border-color, box-shadow;
    }

    .interactive,
    .hover-lift,
    .hover-scale,
    .hover-glow {
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .interactive:hover,
    .interactive:focus-visible,
    .hover-lift:hover,
    .hover-scale:hover,
    .hover-glow:hover {
      will-change: transform, box-shadow, background-color;
    }

    .will-change-transform {
      will-change: transform;
    }
    .will-change-opacity {
      will-change: opacity;
    }
    .will-change-colors {
      will-change: color, background-color, border-color;
    }
    .will-change-shadows {
      will-change: box-shadow;
    }
    .will-change-composite {
      will-change: transform, opacity, box-shadow;
    }
    .will-change-temporary {
      will-change: auto;
    }
    .will-change-temporary.animating {
      will-change: transform, opacity;
    }

    .animate-container {
      contain: layout style paint;
    }
    .animate-container-strict {
      contain: strict;
    }
    .header-container {
      contain: layout paint style;
    }
    .scrollable-container {
      contain: layout paint;
      will-change: scroll-position;
    }
    .interactive-list-item {
      contain: layout style;
      content-visibility: auto;
    }
    .static-content {
      contain: paint style;
    }
    .performance-critical {
      contain: strict;
      content-visibility: auto;
    }
    .card,
    .panel {
      contain: layout style;
    }
    .card[data-interactive='true'],
    .panel[data-interactive='true'] {
      will-change: auto;
    }
    .card[data-interactive='true']:hover,
    .panel[data-interactive='true']:hover {
      will-change: transform, box-shadow;
    }
    .card-large {
      contain: layout style paint;
      content-visibility: auto;
      contain-intrinsic-size: 300px 200px;
    }
    .card-interactive-heavy {
      contain: layout style;
      will-change: auto;
    }
    .card-interactive-heavy:is(:hover, :focus) {
      will-change: transform, box-shadow, background-color;
    }
    .card-static {
      contain: paint style;
    }

    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
      will-change: opacity;
      backface-visibility: hidden;
    }

    .animate-fade-out {
      animation: fadeOut 0.2s ease-in;
      will-change: opacity;
      backface-visibility: hidden;
    }

    /* Остальные анимации (упрощены для оптимизации) */
    .animate-fade-in-up,
    .animate-fade-in-down,
    .animate-slide-in-left,
    .animate-slide-in-right,
    .animate-zoom-in,
    .animate-fade-out-up,
    .animate-slide-out-left,
    .animate-zoom-out {
      will-change: opacity, transform;
      backface-visibility: hidden;
    }

    /* ===== KEYFRAMES АНИМАЦИЙ ===== */

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.05);
      }
    }

    @keyframes shimmer {
      0% {
        background-position: -200px 0;
      }
      100% {
        background-position: calc(200px + 100%) 0;
      }
    }

    .animate-spin {
      animation: spin 1s linear infinite;
      will-change: transform;
      backface-visibility: hidden;
      transform-style: preserve-3d;
    }

    .animate-pulse {
      animation: pulse 2s ease-in-out infinite;
    }

    .animate-shake {
      animation: shake 0.5s ease-in-out;
    }

    /* ===== Минимизация reflow/repaint ===== */
    .no-reflow,
    .no-paint,
    .composite-only {
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .isolate-layout {
      position: relative;
      z-index: 0;
      contain: layout;
    }
    .isolate-paint {
      contain: paint;
      will-change: auto;
    }
    .isolate-size {
      contain: size;
      overflow: hidden;
    }
    .slide-transform {
      transform: translateX(0);
      transition: transform var(--cv-duration-normal) var(--cv-easing-standard);
    }
    .slide-transform.left {
      transform: translateX(-100%);
    }
    .slide-transform.right {
      transform: translateX(100%);
    }
    .scale-transform {
      transform: scale(1);
      transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .scale-transform.small {
      transform: scale(0.95);
    }
    .scale-transform.large {
      transform: scale(1.05);
    }
    .fade-opacity {
      opacity: 1;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .fade-opacity.hidden {
      opacity: 0;
    }
    .visibility-hidden {
      visibility: hidden;
    }
    .visibility-visible {
      visibility: visible;
    }
    .show-hide-transform {
      transform: scale(1);
      opacity: 1;
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .show-hide-transform.hidden {
      transform: scale(0.95);
      opacity: 0;
      pointer-events: none;
    }
    .expand-height {
      overflow: hidden;
      transition: max-height var(--cv-duration-normal) var(--cv-easing-standard);
    }
    .expand-height.collapsed {
      max-height: 0;
    }
    .expand-height.expanded {
      max-height: 1000px;
    }
    .gpu-layer,
    .gpu-layer-opacity,
    .gpu-layer-transform {
      transform: translateZ(0);
      backface-visibility: hidden;
    }
    .gpu-layer-opacity {
      will-change: opacity;
    }
    .gpu-layer-transform {
      will-change: transform;
    }
    .prevent-layout-shift {
      contain: layout style;
      min-height: fit-content;
    }
    .stable-baseline {
      font-size: inherit;
      line-height: inherit;
      vertical-align: baseline;
    }
    .resize-observer-target {
      contain: size layout;
      resize: none;
    }
    .batch-changes {
      contain: layout style;
      will-change: auto;
    }
    .batch-changes.updating {
      will-change: contents;
      contain: none;
    }
    .scroll-optimized {
      overflow: auto;
      contain: layout paint;
      will-change: scroll-position;
      -webkit-overflow-scrolling: touch;
    }
    .virtualized-content {
      contain: strict;
      content-visibility: auto;
      contain-intrinsic-size: auto 50px;
    }
    .virtualized-content.large {
      contain-intrinsic-size: auto 100px;
    }
    .dynamic-content {
      contain: layout style;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .stable-image {
      aspect-ratio: var(--image-aspect-ratio, 16/9);
      object-fit: cover;
      display: block;
    }

    .responsive-no-reflow {
      container-type: inline-size;
    }
    @container (min-width: 768px) {
      .responsive-no-reflow .desktop-only {
        display: block;
      }
    }
    @container (max-width: 767px) {
      .responsive-no-reflow .mobile-only {
        display: block;
      }
      .responsive-no-reflow .desktop-only {
        display: none;
      }
    }

    .multi-change-container {
      contain: layout style;
      will-change: auto;
    }
    .multi-change-container.batch-updating {
      contain: none;
      will-change: contents, transform;
    }
    .multi-change-container:not(.batch-updating) {
      transition: all var(--cv-duration-fast) var(--cv-easing-standard);
    }

    /* ===== Оптимизация CSS custom properties ===== */
    /* Удалены неиспользуемые --local-* переменные */
    .optimized-transitions {
      --composite-transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard);
      transition: var(--composite-transition);
    }
    /* Удалены неиспользуемые --static-* переменные */
    .shallow-cascade {
      color: var(--cv-color-text, #1f2937);
      background: var(--cv-color-surface, #ffffff);
      border: 1px solid var(--cv-color-border, var(--cv-alpha-black-10));
    }
    /* Удалены неиспользуемые --theme-* переменные */
    .animation-optimized {
      --anim-transform: translateY(0);
      --anim-opacity: 1;
      --anim-scale: scale(1);
      transform: var(--anim-transform) var(--anim-scale);
      opacity: var(--anim-opacity);
      transition: var(--composite-transition);
    }
    .animation-optimized.hover {
      --anim-transform: translateY(-2px);
      --anim-scale: scale(1.02);
    }
    .animation-optimized.hidden {
      --anim-opacity: 0;
      --anim-transform: translateY(8px);
      --anim-scale: scale(0.95);
    }
    @media (prefers-reduced-motion: reduce) {
      .animation-optimized {
        --anim-transform: translateY(0) !important;
        --anim-scale: scale(1) !important;
        transition: none;
      }
    }
    .viewport-optimized {
      --responsive-spacing: var(--app-spacing-4);
      --responsive-font-size: var(--cv-font-size-base);
      --responsive-line-height: var(--line-height-normal);
    }
    @media (max-width: 768px) {
      .viewport-optimized {
        --responsive-spacing: var(--app-spacing-3);
        --responsive-font-size: var(--cv-font-size-sm);
        --responsive-line-height: var(--line-height-snug);
      }
    }
    @media (min-width: 1024px) {
      .viewport-optimized {
        --responsive-spacing: var(--app-spacing-5);
        --responsive-font-size: var(--cv-font-size-lg);
        --responsive-line-height: var(--line-height-relaxed);
      }
    }
    .layout-optimized {
      --layout-gap: var(--app-spacing-4);
      --layout-padding: var(--app-spacing-6) var(--app-spacing-4);
      --layout-max-width: 1200px;
      --layout-min-height: 100dvh;
    }
    @container (max-width: 600px) {
      .layout-optimized {
        --layout-gap: var(--app-spacing-2);
        --layout-padding: var(--app-spacing-3) var(--app-spacing-2);
      }
    }
    .critical-path {
      --critical-bg: var(--cv-color-surface, #ffffff);
      --critical-text: var(--cv-color-text, #1f2937);
      --critical-font: var(--cv-font-family-sans, system-ui);
      --critical-size: var(--cv-font-size-base, 1rem);
      background: var(--critical-bg);
      color: var(--critical-text);
      font-family: var(--critical-font);
      font-size: var(--critical-size);
    }
    .efficient-colors {
      --hover-bg: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      --active-bg: color-mix(in oklch, var(--cv-color-primary) 15%, transparent);
      --border-subtle: color-mix(in oklch, var(--cv-color-border) 50%, transparent);
      --text-muted: color-mix(in oklch, var(--cv-color-text) 70%, transparent);
    }
    .inherit-optimized {
      color: inherit;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
    }
    .robust-fallbacks {
      color: var(--cv-color-text, var(--fallback-text, #1f2937));
      background: var(--cv-color-surface, var(--fallback-surface, #ffffff));
      font-family: var(--cv-font-family-sans, var(--fallback-font, system-ui));
      border-radius: var(--cv-radius-2, var(--fallback-radius, 8px));
    }

    /* ===== GPU optimizations ===== */
    .gpu-accelerated {
      transform: translateZ(0);
      backface-visibility: hidden;
      will-change: transform;
    }
    .gpu-layer-critical {
      transform: translateZ(0);
      backface-visibility: hidden;
      perspective: 1000px;
      will-change: auto;
    }
    .gpu-layer-critical.animating {
      will-change: transform, opacity;
    }
    .gpu-scroll-optimized {
      transform: translateZ(0);
      -webkit-overflow-scrolling: touch;
      overflow-scrolling: touch;
      will-change: scroll-position;
      contain: layout paint;
    }
    /* Убрано избыточное will-change: auto */
    .composite-layer-advanced {
      position: relative;
      z-index: 0;
      isolation: isolate;
      transform: translateZ(0);
      backface-visibility: hidden;
    }
    .gpu-hover-effects {
      transform: translateZ(0);
      backface-visibility: hidden;
      transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
      will-change: auto;
    }
    .gpu-hover-effects:hover {
      transform: translateZ(0) translateY(-2px);
      will-change: transform;
    }
    .gpu-interactive-light,
    .gpu-interactive-heavy {
      transform: translateZ(0);
      will-change: auto;
    }
    .gpu-interactive-light {
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .gpu-interactive-light:hover {
      will-change: opacity;
    }
    .gpu-interactive-heavy {
      backface-visibility: hidden;
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        filter var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .gpu-interactive-heavy:is(:hover, :focus-visible) {
      will-change: transform, opacity, filter;
    }
    .gpu-isolated-animations {
      position: relative;
      z-index: 0;
      transform: translateZ(0);
      backface-visibility: hidden;
      contain: layout style paint;
      isolation: isolate;
    }
    .gpu-batch-container {
      transform: translateZ(0);
      contain: strict;
      will-change: auto;
    }
    .gpu-batch-container.batch-animating {
      will-change: contents;
      contain: none;
    }
    .gpu-batch-container:not(.batch-animating) {
      contain: strict;
    }
    .gpu-transform-frequent {
      transform: translateZ(0) translateX(var(--transform-x, 0)) translateY(var(--transform-y, 0))
        scale(var(--transform-scale, 1));
      backface-visibility: hidden;
      will-change: auto;
    }
    .gpu-transform-frequent.active {
      will-change: transform;
    }
    .gpu-fade-layer {
      transform: translateZ(0);
      opacity: var(--fade-opacity, 1);
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
      will-change: auto;
    }
    .gpu-fade-layer.fading {
      will-change: opacity;
    }
    .gpu-slide-layer {
      transform: translateZ(0) translateX(var(--slide-x, 0)) translateY(var(--slide-y, 0));
      transition: transform var(--cv-duration-normal) var(--cv-easing-standard);
      will-change: auto;
    }
    .gpu-slide-layer.sliding {
      will-change: transform;
    }
    .gpu-scale-layer {
      transform: translateZ(0) scale(var(--scale-factor, 1));
      transform-origin: var(--scale-origin, center);
      transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
      will-change: auto;
    }
    .gpu-scale-layer.scaling {
      will-change: transform;
    }
    .gpu-3d-optimized {
      transform-style: preserve-3d;
      backface-visibility: hidden;
      perspective: 1000px;
      will-change: auto;
    }
    .gpu-3d-optimized.transforming-3d {
      will-change: transform;
    }
    .gpu-smooth-edges {
      transform: translateZ(0) translate3d(0.5px, 0.5px, 0);
      backface-visibility: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .gpu-memory-efficient {
      transform: translateZ(0);
      contain: strict;
      content-visibility: auto;
    }
    .gpu-memory-efficient:is(:hover, .visible) {
      will-change: transform;
    }
    @media (max-width: 768px) {
      .gpu-mobile-optimized {
        transform: translateZ(0);
        will-change: auto;
      }
      .gpu-mobile-optimized:active {
        will-change: transform;
      }
      .gpu-mobile-optimized:not(:active) {
        will-change: auto;
      }
    }
    @media (min-width: 1024px) {
      .gpu-desktop-enhanced {
        transform: translateZ(0);
        backface-visibility: hidden;
        perspective: 1000px;
        will-change: auto;
      }
      .gpu-desktop-enhanced:hover {
        will-change: transform, filter, opacity;
      }
    }
    @supports (transform: translateZ(0)) {
      .gpu-supported {
        transform: translateZ(0);
        backface-visibility: hidden;
      }
    }
    @supports not (transform: translateZ(0)) {
      .gpu-fallback {
        transition: none !important;
        transform: none !important;
        will-change: auto !important;
      }
    }

    /* ===== Расширенная поддержка reduced motion ===== */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      .gpu-layer-critical,
      .gpu-scroll-optimized,
      .composite-layer-advanced,
      .gpu-hover-effects,
      .gpu-interactive-light,
      .gpu-interactive-heavy,
      .gpu-isolated-animations,
      .gpu-transform-frequent,
      .gpu-fade-layer,
      .gpu-slide-layer,
      .gpu-scale-layer,
      .gpu-3d-optimized {
        transform: none !important;
        will-change: auto !important;
        animation: none !important;
        transition: none !important;
      }
      .animate-fade-in,
      .animate-fade-in-up,
      .animate-fade-in-down,
      .animate-slide-in-left,
      .animate-slide-in-right,
      .animate-zoom-in,
      .animate-fade-out,
      .animate-fade-out-up,
      .animate-slide-out-left,
      .animate-zoom-out,
      .animate-spin,
      .animate-pulse,
      .animate-bounce,
      .animate-shake,
      .animate-heartbeat {
        animation: none !important;
        transform: none !important;
        opacity: 1 !important;
      }
      .hover-lift,
      .hover-scale,
      .hover-glow,
      .interactive {
        transition: none !important;
        transform: none !important;
      }
      .hover-lift:hover,
      .hover-scale:hover,
      .hover-glow:hover,
      .interactive:hover {
        transform: none !important;
        box-shadow: none !important;
      }
      :focus-visible {
        outline: 3px solid var(--cv-color-focus) !important;
        outline-offset: 2px !important;
        transition: none !important;
      }
      .loading,
      .loading::before,
      .loading::after {
        animation: none !important;
      }
      .loading::after {
        content: 'Loading...' !important;
        position: static !important;
        display: block !important;
        text-align: center !important;
        color: var(--cv-color-text-muted) !important;
      }
      .shimmer,
      .skeleton {
        background: var(--cv-color-surface-2) !important;
        animation: none !important;
      }
      .shimmer::before,
      .skeleton::before {
        display: none !important;
      }
      .progress-fill {
        transition: none !important;
      }
      .modal-container,
      .overlay-container,
      .backdrop,
      .dialog {
        transition: none !important;
        animation: none !important;
        transform: none !important;
        opacity: 1 !important;
      }
      [data-tooltip] {
        transition: none !important;
      }
      .dropdown,
      .menu {
        transition: none !important;
        animation: none !important;
      }
      .page-transition,
      .route-animation {
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
      .tab-panel,
      .tab-content {
        transition: none !important;
        animation: none !important;
      }
      .accordion-content,
      .collapsible {
        transition: none !important;
        max-height: none !important;
      }
      .chart-animation,
      .graph-transition {
        animation: none !important;
        transition: none !important;
      }
      .parallax,
      .parallax-container {
        transform: none !important;
        transition: none !important;
      }
      html {
        scroll-behavior: auto !important;
      }
      video[autoplay] {
        animation-play-state: paused !important;
      }
      .marquee,
      .scrolling-text {
        animation: none !important;
      }
      /* Performance benefits */
      * {
        will-change: auto !important;
      }
      .animate-container,
      .animate-container-strict,
      .gpu-isolated-animations {
        contain: layout !important;
      }
      .gpu-layer,
      .gpu-layer-opacity,
      .gpu-layer-transform,
      .gpu-accelerated {
        transform: none !important;
        backface-visibility: visible !important;
      }
      .gpu-layer-critical,
      .composite-layer-advanced {
        transform: none !important;
        perspective: none !important;
        backface-visibility: visible !important;
      }
    }

    /* ===== Альтернативные Accessibility стратегии ===== */
    @media (prefers-reduced-motion: reduce) {
      .status-indicator.animated::after {
        content: ' (Active)';
        font-size: 0.8em;
        margin-left: 0.5em;
      }
      .loading-indicator.animated::after {
        content: ' (Loading...)';
        font-size: 0.8em;
      }
      .progress-animated::after {
        content: ' (' attr(data-progress) '% complete)';
        font-size: 0.8em;
        margin-left: 0.5em;
      }
      .attention-animation {
        background-color: var(--cv-color-warning) !important;
        color: var(--cv-color-text) !important;
        border: 2px solid var(--cv-color-warning-dark) !important;
      }
      .state-transition {
        border-left: 4px solid var(--cv-color-primary) !important;
        background: color-mix(in oklch, var(--cv-color-primary), transparent 90%) !important;
      }
    }

    /* ===== Пользовательские настройки анимаций ===== */
    :root {
      --user-animation-speed: 1;
      --user-animation-enabled: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .respectful-animation {
        transition-duration: calc(var(--cv-duration-fast) * var(--user-animation-speed, 1));
        animation-duration: calc(var(--cv-duration-normal) * var(--user-animation-speed, 1));
      }
      .respectful-animation.user-disabled {
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
    }

    /* ===== A11y-first индикаторы ===== */
    .sr-status-update {
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    @media (prefers-reduced-motion: reduce) {
      .sr-status-update {
        position: static !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        padding: var(--app-spacing-2);
        background: var(--cv-color-surface-2);
        border-radius: var(--cv-radius-1);
        font-size: var(--cv-font-size-sm);
        margin: var(--app-spacing-2) 0;
      }
    }

    /* ========== РАСШИРЕННАЯ MOBILE-FIRST АДАПТИВНОСТЬ ========== */
    .show-mobile-only {
      display: block;
    }
    .hide-mobile {
      display: none;
    }
    .show-tablet-up {
      display: none;
    }
    .show-desktop-up {
      display: none;
    }
    .mobile-padding {
      padding: var(--app-spacing-3);
    }
    .mobile-margin {
      margin: var(--app-spacing-2) 0;
    }
    .mobile-gap {
      gap: var(--touch-spacing);
    }
    @media (min-width: 480px) {
      .responsive-sm-up {
        display: initial;
      }
      .responsive-sm-down {
        display: none;
      }
      .show-sm-up {
        display: block;
      }
      .hide-sm-up {
        display: none;
      }
      .mobile-padding {
        padding: var(--app-spacing-4);
      }
      .mobile-gap {
        gap: calc(var(--touch-spacing) * 1.2);
      }
    }
    @media (min-width: 768px) {
      .responsive-md-up {
        display: initial;
      }
      .responsive-md-down {
        display: none;
      }
      .show-tablet-up {
        display: block;
      }
      .hide-mobile {
        display: block;
      }
      .show-mobile-only {
        display: none;
      }
      .touch-target {
        min-height: var(--touch-target-comfortable);
        min-width: var(--touch-target-comfortable);
      }
      .mobile-padding {
        padding: var(--app-spacing-5);
      }
      .mobile-gap {
        gap: var(--finger-friendly-gap);
      }
      .dual-pane-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--app-spacing-4);
      }
      .tablet-stack {
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-3);
      }
    }
    @media (min-width: 1024px) {
      .responsive-lg-up {
        display: initial;
      }
      .responsive-lg-down {
        display: none;
      }
      .show-desktop-up {
        display: block;
      }
      .touch-target {
        min-height: auto;
        min-width: auto;
      }
      .mobile-padding {
        padding: var(--app-spacing-6);
      }
      .mobile-gap {
        gap: var(--app-spacing-4);
      }
      .triple-pane-container {
        display: grid;
        grid-template-columns: 280px 1fr 360px;
        gap: var(--app-spacing-4);
      }
    }
    @media (min-width: 1280px) {
      .responsive-xl-up {
        display: initial;
      }
      .responsive-xl-down {
        display: none;
      }
      .mobile-padding {
        padding: var(--app-spacing-7);
      }
      .mobile-gap {
        gap: var(--app-spacing-5);
      }
    }

    /* ===== Swipe области и навигация ===== */
    .swipe-area {
      touch-action: pan-x;
      user-select: none;
      -webkit-user-select: none;
      min-height: var(--swipe-area-height);
      position: relative;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .swipe-area::-webkit-scrollbar {
      display: none;
    }
    .swipe-vertical {
      touch-action: pan-y;
    }
    .swipe-both {
      touch-action: pan-x pan-y;
    }
    .swipe-indicator {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 4px;
      background: var(--cv-color-text-muted);
      border-radius: 2px;
      opacity: 0.3;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }
    .swipe-indicator.left {
      left: var(--app-spacing-2);
    }
    .swipe-indicator.right {
      right: var(--app-spacing-2);
    }
    .swipe-active .swipe-indicator {
      opacity: 0.7;
    }
    @media (hover: none) and (pointer: coarse) {
      .interactive {
        margin: var(--touch-spacing) 0;
        padding: var(--app-spacing-2) var(--app-spacing-3);
      }
      .interactive:active,
      button:active,
      [role='button']:active {
        transform: scale(0.98);
        transition: transform var(--cv-duration-fast) var(--cv-easing-accelerate);
      }
      .touch-list-item {
        min-height: var(--touch-target-comfortable);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-bottom: 1px solid var(--cv-color-border);
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      .touch-list-item:active {
        background-color: var(--cv-color-active);
      }
      .drag-handle {
        min-width: var(--touch-target-large);
        min-height: var(--touch-target-large);
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
      }
    }
  `,

  // ========== WEB AWESOME THEME OVERRIDES ==========
  // Import Web Awesome theme to map WA tokens to ChromVoid design tokens
  // This ensures WA components match ChromVoid's visual style
  css`
    @import url('./themes/web-awesome-theme.css');
  `,
]
