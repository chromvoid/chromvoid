import {html} from 'lit'

import {i18n} from 'root/i18n'
import {dialogService} from 'root/shared/services/dialog-service'
import type {
  AndroidSharePartialImportChoice,
  AndroidSharePartialImportDecision,
} from '../models/android-share-import.model'

const PREVIEW_NAME_LIMIT = 3

export function showAndroidSharePartialImportDialog(
  decision: AndroidSharePartialImportDecision,
): Promise<AndroidSharePartialImportChoice | null> {
  const previewNames = decision.completed.slice(0, PREVIEW_NAME_LIMIT)
  const extraCount = Math.max(0, decision.completed.length - PREVIEW_NAME_LIMIT)

  const content = html`
    <div class="android-share-partial-import">
      <p>
        ${i18n('dialogs:android-share-partial-message', {
          imported: String(decision.completed.length),
          failed: String(decision.failedCount),
        })}
      </p>
      <ul>
        ${previewNames.map((file) => html`<li>${file.name}</li>`)}
        ${extraCount > 0
          ? html`<li>${i18n('dialogs:android-share-partial-extra', {count: String(extraCount)})}</li>`
          : null}
      </ul>
    </div>
  `

  const footer = html`
    <cv-button variant="danger" data-android-share-partial-action="delete">
      ${i18n('button:delete-imported-files')}
    </cv-button>
    <cv-button variant="primary" data-android-share-partial-action="keep">
      ${i18n('button:keep-imported-files')}
    </cv-button>
  `

  return dialogService.showCustomDialog<AndroidSharePartialImportChoice>(
    {
      title: i18n('dialogs:android-share-partial-title'),
      content,
      footer,
      variant: 'warning',
      size: 'm',
      closable: false,
      dialogClass: 'android-share-partial-import-dialog',
    },
    (dialog, resolve) => {
      dialog.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return

        const actionButton = target.closest<HTMLElement>('[data-android-share-partial-action]')
        const action = actionButton?.dataset['androidSharePartialAction']
        if (action === 'keep' || action === 'delete') {
          resolve(action)
        }
      })
    },
  )
}
