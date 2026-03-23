import {css} from 'lit'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'

export const welcomeStyles = [
  sharedStyles,
  pageTransitionStyles,
  pageFadeInStyles,
  hostLayoutPaintContainStyles,
  css`
    :host {
      display: grid;
      min-height: 100%;
      place-items: center;
      padding: var(--app-spacing-7) var(--app-spacing-6);
      background: var(--cv-color-hover);
      box-sizing: border-box;
      --meter-score-0: var(--cv-color-danger);
      --meter-score-1: var(--cv-color-warning-dark);
      --meter-score-2: var(--cv-color-warning);
      --meter-score-3: var(--cv-color-success-dark);
      --meter-score-4: var(--cv-color-success);
    }

    .container {
      display: grid;
      gap: var(--app-spacing-7);
      width: min(820px, 100%);
      grid-template-columns: 1fr;
    }

    @media (min-width: 768px) {
      .container {
        grid-template-columns: 1fr 320px;
        align-items: start;
      }
    }

    .main-card {
      background: var(--cv-color-surface);
      border-radius: 16px;
      padding: var(--app-spacing-7);
      box-shadow: var(--cv-shadow-2);
      display: grid;
      gap: var(--app-spacing-6);
    }

    .sidebar {
      display: grid;
      gap: var(--app-spacing-5);
    }

    .hero {
      display: grid;
      gap: var(--app-spacing-3);
      align-items: center;
      text-align: center;
      justify-items: center;
    }

    .hero-mark {
      display: grid;
      justify-items: center;
      gap: var(--app-spacing-3);
    }

    .hero-kicker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: 28px;
      padding: 0 12px;
      border-radius: var(--cv-radius-pill);
      border: 1px solid color-mix(in oklch, var(--cv-color-border-accent) 68%, transparent);
      background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      color: color-mix(in oklch, var(--cv-color-brand) 86%, white);
      font-family: var(--cv-font-family-code);
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .hero-icon-shell {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 76px;
      block-size: 76px;
      border-radius: 22px;
      border: 1px solid color-mix(in oklch, var(--cv-color-border-accent) 74%, transparent);
      background: linear-gradient(
        180deg,
        color-mix(in oklch, var(--cv-color-surface) 52%, black) 0%,
        var(--cv-color-bg) 100%
      );
      box-shadow:
        inset 0 1px 0 color-mix(in oklch, white 5%, transparent),
        0 14px 28px color-mix(in oklch, black 28%, transparent);
      overflow: hidden;
    }

    .hero-icon-shell::before {
      content: '';
      position: absolute;
      inset: -20%;
      background:
        radial-gradient(circle at center, color-mix(in oklch, var(--cv-color-brand) 20%, transparent), transparent 60%);
      opacity: 0.38;
      filter: blur(18px);
    }

    .hero-art {
      width: 100%;
      height: 100%;
      position: relative;
      z-index: 1;
      display: block;
      object-fit: cover;
      border-radius: inherit;
      filter: none;
    }

    .hero-art.locked {
      opacity: 0.9;
      filter: saturate(0.92) brightness(0.94);
    }

    .hero-art.unlocked {
      opacity: 1;
      transform: scale(1.02);
      filter: saturate(1.02) brightness(1.01);
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

    @keyframes bounce-open {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.2);
      }
      100% {
        transform: scale(1);
      }
    }

    .animate-shake {
      animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      color: var(--cv-color-danger);
    }

    .animate-bounce {
      animation: bounce-open 0.5s ease-out both;
    }

    .hero-title {
      font-family: var(--cv-font-family-display);
      font-size: 1.85rem;
      font-weight: 700;
      line-height: 1.12;
      color: var(--cv-color-text);
    }

    .hero-desc {
      color: var(--cv-color-text-muted);
      font-size: 1rem;
      line-height: 1.5;
    }

    .hero-copy {
      display: grid;
      gap: var(--app-spacing-2);
      justify-items: center;
      text-align: center;
      max-inline-size: 31ch;
      margin-inline: auto;
    }

    .hero-proof {
      display: grid;
      gap: var(--app-spacing-2);
      color: var(--cv-color-text-subtle);
      font-size: 0.8125rem;
      line-height: 1.5;
      text-align: center;
      max-inline-size: 34ch;
      margin-inline: auto;
      padding-top: var(--app-spacing-3);
      border-top: 1px solid color-mix(in oklch, var(--cv-color-border) 78%, transparent);
    }

    .step {
      display: grid;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-4);
      background: var(--cv-color-surface-3);
      border-radius: 12px;
      border: 1px solid transparent;
    }

    .step.active {
      background: var(--cv-color-surface);
      border-color: var(--cv-color-brand);
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--cv-color-brand) 20%, transparent);
    }

    .step-title {
      font-weight: 600;
      font-size: 1rem;
      color: var(--cv-color-text);
    }

    .step-desc {
      font-size: 0.875rem;
      color: var(--cv-color-text-muted);
    }

    cv-callout {
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .tool-card {
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border);
      border-radius: 12px;
      padding: var(--app-spacing-5);
      display: grid;
      gap: var(--app-spacing-4);
    }

    .tool-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--cv-color-text-muted);
      border-bottom: 1px solid var(--cv-color-border-muted);
      padding-bottom: var(--app-spacing-2);
    }

    .tool-actions {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .meta-info {
      font-family: var(--cv-font-family-code);
      font-size: 0.75rem;
      color: var(--cv-color-text-muted);
      word-break: break-all;
      background: var(--cv-color-surface-3);
      padding: var(--app-spacing-2);
      border-radius: 6px;
    }

    .privacy-blur {
      filter: blur(4px);
    }

    .privacy-blur:hover {
      filter: blur(0);
    }

    .location-actions {
      display: flex;
      align-items: stretch;
      gap: var(--app-spacing-2);
    }

    .location-change-button {
      flex: 1 1 auto;
      min-inline-size: 0;
    }

    .location-reset-button {
      flex: 0 0 auto;
      width: auto;
    }

    .location-reset-button::part(base) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 30px;
      block-size: 30px;
      min-inline-size: 30px;
      padding: 0;
    }

    .location-reset-button svg {
      flex: 0 0 auto;
    }

    .privacy-toggle {
      cursor: pointer;
      color: var(--cv-color-text-muted);
      transition: color 0.2s;
    }

    .privacy-toggle:hover {
      color: var(--cv-color-text);
    }

    .remote-actions cv-button,
    .remote-peer-actions cv-button {
      width: auto;
      flex: 0 0 auto;
    }

    .entropy-meter {
      display: flex;
      flex-direction: column;
      gap: var(--app-spacing-1);
      margin-top: var(--app-spacing-2);
    }

    .entropy-bar {
      display: flex;
      gap: var(--app-spacing-1);
      height: 4px;
    }

    .entropy-segment {
      flex: 1;
      background: var(--cv-color-surface-3);
      border-radius: 2px;
      transition: background-color 0.3s ease;
    }

    .entropy-text {
      font-size: 0.75rem;
      text-align: right;
      font-weight: 500;
    }

    .entropy-warning {
      opacity: 0.7;
      font-weight: 400;
    }

    .score-0 .entropy-segment:nth-child(1) {
      background: var(--meter-score-0);
    }
    .score-1 .entropy-segment:nth-child(1),
    .score-1 .entropy-segment:nth-child(2) {
      background: var(--meter-score-1);
    }
    .score-2 .entropy-segment:nth-child(1),
    .score-2 .entropy-segment:nth-child(2),
    .score-2 .entropy-segment:nth-child(3) {
      background: var(--meter-score-2);
    }
    .score-3 .entropy-segment:nth-child(-n + 3) {
      background: var(--meter-score-3);
    }
    .score-3 .entropy-segment:nth-child(4) {
      background: var(--meter-score-3);
    }
    .score-4 .entropy-segment {
      background: var(--meter-score-4);
    }

    .score-0 .entropy-score {
      color: var(--meter-score-0);
    }

    .score-1 .entropy-score {
      color: var(--meter-score-1);
    }

    .score-2 .entropy-score {
      color: var(--meter-score-2);
    }

    .score-3 .entropy-score {
      color: var(--meter-score-3);
    }

    .score-4 .entropy-score {
      color: var(--meter-score-4);
    }

    .mode-cards {
      display: grid;
      gap: var(--app-spacing-4);
    }

    .mode-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--app-spacing-4);
      padding: var(--app-spacing-5);
      background: linear-gradient(
        180deg,
        color-mix(in oklch, var(--cv-color-surface-2) 88%, transparent) 0%,
        color-mix(in oklch, var(--cv-color-surface-3) 96%, black) 100%
      );
      border: 1px solid var(--cv-color-border);
      border-radius: 14px;
      cursor: pointer;
      align-items: center;
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .mode-card:hover {
      border-color: var(--cv-color-border-accent);
      background: color-mix(in oklch, var(--cv-color-surface-2) 86%, var(--cv-color-brand));
      box-shadow:
        0 0 0 1px color-mix(in oklch, var(--cv-color-brand) 16%, transparent),
        0 14px 28px color-mix(in oklch, black 20%, transparent);
      transform: translateY(-1px);
    }

    .mode-card.disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .mode-card.disabled:hover {
      border-color: transparent;
      background: var(--cv-color-surface-3);
      box-shadow: none;
    }

    .mode-icon {
      inline-size: 48px;
      block-size: 48px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      border: 1px solid color-mix(in oklch, var(--cv-color-border-accent) 65%, transparent);
      background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      color: var(--cv-color-brand);
      box-shadow: inset 0 1px 0 color-mix(in oklch, white 5%, transparent);
    }

    .mode-card-remote .mode-icon {
      color: var(--cv-color-accent);
      background: color-mix(in oklch, var(--cv-color-accent) 12%, transparent);
    }

    .mode-icon svg {
      inline-size: 24px;
      block-size: 24px;
    }

    .mode-content {
      display: grid;
      gap: 6px;
    }

    .mode-title {
      font-weight: 600;
      font-size: 1rem;
      color: var(--cv-color-text);
    }

    .mode-desc {
      font-size: 0.875rem;
      color: var(--cv-color-text-muted);
    }

    .mode-badge {
      font-size: 0.7rem;
      font-family: var(--cv-font-family-code);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px var(--app-spacing-2);
      background: color-mix(in oklch, var(--cv-color-surface-3) 88%, black);
      border-radius: var(--cv-radius-pill);
      color: var(--cv-color-text-subtle);
      justify-self: start;
      margin-top: var(--app-spacing-1);
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.875rem;
      color: var(--cv-color-text-muted);
      cursor: pointer;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: var(--cv-color-brand);
    }

    .welcome-actions {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .password-form-grid {
      display: grid;
      gap: var(--app-spacing-3);
      margin-top: var(--app-spacing-3);
    }

    .master-warning {
      margin-top: var(--app-spacing-3);
      font-size: 0.8rem;
    }

    .remote-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-3);
    }

    .remote-peer-list {
      display: grid;
      gap: var(--app-spacing-3);
      margin-top: var(--app-spacing-3);
    }

    .remote-peer {
      display: grid;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-4);
      border: 1px solid var(--cv-color-border);
      border-radius: 12px;
      background: var(--cv-color-surface);
    }

    .remote-peer-main {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .remote-peer-title {
      font-weight: 600;
      color: var(--cv-color-text);
    }

    .remote-peer-meta {
      font-size: 0.8125rem;
      color: var(--cv-color-text-muted);
      word-break: break-all;
    }

    .remote-peer-badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
    }

    .remote-peer-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
    }

    .status-success {
      background: color-mix(in oklch, var(--cv-color-success, #16a34a) 18%, transparent);
      color: var(--cv-color-success, #16a34a);
    }

    .status-warning {
      background: color-mix(in oklch, var(--cv-color-warning) 18%, transparent);
      color: var(--cv-color-warning-text, #b45309);
    }

    .status-danger {
      background: color-mix(in oklch, var(--cv-color-danger) 18%, transparent);
      color: var(--cv-color-danger-text, #b91c1c);
    }

    .status-neutral {
      background: var(--cv-color-surface-3);
      color: var(--cv-color-text-muted);
    }

    .empty-remote-state {
      display: grid;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-5);
      border-radius: 12px;
      background: var(--cv-color-surface);
      border: 1px dashed var(--cv-color-border);
      text-align: left;
      margin-top: var(--app-spacing-3);
    }

    .remote-form-grid {
      display: grid;
      gap: var(--app-spacing-4);
      margin-top: var(--app-spacing-3);
    }

    .remote-field {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .remote-field-label {
      font-size: 0.8125rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--cv-color-text-muted);
    }

    .remote-textarea {
      min-height: 160px;
    }

    cv-textarea::part(textarea) {
      min-height: 160px;
    }

    .hint-block {
      padding: var(--app-spacing-3) var(--app-spacing-4);
      background: var(--cv-color-surface-3);
      border-radius: 8px;
      margin-top: var(--app-spacing-3);
    }

    .hint-text {
      font-size: 0.875rem;
      color: var(--cv-color-text-muted);
      line-height: 1.5;
    }

    .tool-section-divider {
      margin-top: var(--app-spacing-3);
      padding-top: var(--app-spacing-3);
      border-top: 1px solid var(--cv-color-border-muted);
    }

    .step-footer {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .print-kit {
      display: none;
    }

    @media print {
      :host {
        display: block;
        background: white;
        color: black;
        padding: 0;
        height: auto;
        min-height: auto;
      }
      .container {
        display: none;
      }
      .print-kit {
        display: block !important;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        z-index: 9999;
        padding: 40px;
        box-sizing: border-box;
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          'Helvetica Neue',
          Arial,
          sans-serif;
      }
      .kit-header {
        display: flex;
        align-items: center;
        gap: 15px;
        border-bottom: 3px solid black;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      .kit-logo {
        width: 40px;
        height: 40px;
        border: 2px solid black;
        border-radius: 8px;
        display: grid;
        place-items: center;
      }
      .kit-title {
        font-size: 28px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .kit-intro {
        font-size: 14px;
        line-height: 1.5;
        margin-bottom: 40px;
        color: var(--cv-color-text-subtle);
        border: 1px solid var(--cv-color-border);
        padding: 15px;
        background: var(--cv-color-surface);
        border-radius: 6px;
      }
      .kit-section {
        margin-bottom: 35px;
        page-break-inside: avoid;
      }
      .kit-label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
        color: var(--cv-color-text-subtle);
      }
      .kit-box {
        border: 2px solid var(--cv-color-border);
        border-radius: 8px;
        padding: 15px;
        background: white;
      }
      .kit-box.filled {
        background: var(--cv-color-surface);
        font-family: ui-monospace, monospace;
        font-size: 14px;
        word-break: break-all;
      }
      .kit-lines {
        height: 40px;
        border-bottom: 1px dashed var(--cv-color-border);
        margin-bottom: 20px;
      }
      .kit-lines:last-child {
        margin-bottom: 0;
        border-bottom: none;
      }
      .kit-help {
        margin-top: 8px;
        font-size: 11px;
        color: var(--cv-color-text-muted);
        font-style: italic;
      }
      .kit-footer {
        position: fixed;
        bottom: 40px;
        left: 40px;
        right: 40px;
        text-align: center;
        font-size: 11px;
        color: var(--cv-color-text-muted);
        border-top: 1px solid var(--cv-color-border);
        padding-top: 15px;
      }
    }
  `,
]
