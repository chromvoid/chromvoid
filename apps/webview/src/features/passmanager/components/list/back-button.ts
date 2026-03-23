import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import type {CVIcon} from '@chromvoid/uikit'

import {ManagerRoot, i18n} from '@project/passmanager'
import {pmModel} from '../../password-manager.model'

export class ButtonBack extends XLitElement {
  static define() {
    customElements.define('back-button', this)
  }
  static styles = css`
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--back-button-size, 48px);
      block-size: var(--back-button-size, 48px);
      padding: 0;
      border: 1px solid
        var(
          --back-button-border-color,
          color-mix(in oklch, var(--cv-color-border) 100%, var(--cv-color-text) 20%)
        );
      border-radius: var(--back-button-radius, var(--cv-radius-2));
      background: var(--back-button-bg, var(--cv-color-surface-2));
      color: var(--back-button-color, var(--cv-color-primary));
      cursor: pointer;
      transition:
        background-color 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease,
        transform 0.2s ease;

      &:hover {
        background: var(
          --back-button-hover-bg,
          color-mix(in oklch, var(--cv-color-primary) 15%, var(--cv-color-surface-2))
        );
        border-color: var(--back-button-hover-border-color, var(--cv-color-primary));
        color: var(--back-button-hover-color, var(--back-button-color, var(--cv-color-primary)));
      }

      &:active {
        transform: scale(0.95);
      }
    }

    cv-icon {
      inline-size: var(--back-button-icon-size, 22px);
      block-size: var(--back-button-icon-size, 22px);
    }
  `
  handleClick() {
    pmModel.goBackFromCurrent()
  }

  render() {
    if (window.passmanager?.showElement() instanceof ManagerRoot) {
      this.classList.add('hidden')
      return nothing
    }
    this.classList.remove('hidden')
    return html`<button @click=${this.handleClick} aria-label=${i18n('button:back')}>
      <cv-icon name="arrow-left"></cv-icon>
    </button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'back-button': ButtonBack
    'cv-icon': CVIcon
  }
}
