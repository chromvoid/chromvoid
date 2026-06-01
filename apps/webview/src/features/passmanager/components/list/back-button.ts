import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'

import {ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerShowElement} from '../../models/pm-root.adapter'
import {pmModel} from '../../password-manager.model'

export class ButtonBack extends ReatomLitElement {
  static define() {
    if (!customElements.get('back-button')) {
      customElements.define('back-button', this)
    }
  }
  static styles = css`
    :host {
      --back-button-radius: var(--cv-radius-2);
      --back-button-color: var(--cv-color-primary);
      --back-button-hover-bg: var(--cv-color-primary-surface-strong);
      --back-button-hover-border-color: var(--cv-color-primary);
      --back-button-hover-color: var(--back-button-color);
    }

    cv-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--back-button-size, 48px);
      block-size: var(--back-button-size, 48px);
      padding: 0;
      border: 1px solid
        var(
          --back-button-border-color,
          var(--cv-color-border-strong)
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
          var(--cv-color-primary-surface-strong)
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
    if (getPassmanagerShowElement() instanceof ManagerRoot) {
      this.classList.add('hidden')
      return nothing
    }
    this.classList.remove('hidden')
    return html`<cv-button unstyled @click=${this.handleClick} aria-label=${i18n('button:back')}>
      <cv-icon name="arrow-left"></cv-icon>
    </cv-button>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'back-button': ButtonBack
    'cv-icon': CVIcon
  }
}
