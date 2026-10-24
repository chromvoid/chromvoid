import {html} from 'lit'

import {i18n} from 'root/i18n'
import {dialogService} from 'root/shared/services/dialog-service'
import type {
  SharePartialImportChoice,
  SharePartialImportDecision,
} from '../models/share-import.model'

const PREVIEW_NAME_LIMIT = 3

export function showSharePartialImportDialog(
  decision: SharePartialImportDecision,
): Promise<SharePartialImportChoice | null> {
  const previewNames = decision.completed.slice(0, PREVIEW_NAME_LIMIT)
  const extraCount = Math.max(0, decision.completed.length - PREVIEW_NAME_LIMIT)

  const content = html`
    <div class="share-partial-import">
      <p>
        ${i18n('dialogs:share-partial-message', {
          imported: String(decision.completed.length),
          failed: String(decision.failedCount),
        })}
      </p>
      <ul>
        ${previewNames.map((file) => html`<li>${file.name}</li>`)}
        ${extraCount > 0
          ? html`<li>${i18n('dialogs:share-partial-extra', {count: String(extraCount)})}</li>`
          : null}
      </ul>
    </div>
  `

  const footer = html`
    <cv-button variant="danger" data-share-partial-action="delete">
      ${i18n('button:delete-imported-files')}
    </cv-button>
    <cv-button variant="primary" data-share-partial-action="keep">
      ${i18n('button:keep-imported-files')}
    </cv-button>
  `

  return dialogService.showCustomDialog<SharePartialImportChoice>(
    {
      title: i18n('dialogs:share-partial-title'),
      content,
      footer,
      variant: 'warning',
      size: 'm',
      closable: false,
      dialogClass: 'share-partial-import-dialog',
    },
    (dialog, resolve) => {
      dialog.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return

        const actionButton = target.closest<HTMLElement>('[data-share-partial-action]')
        const action = actionButton?.dataset['sharePartialAction']
        if (action === 'keep' || action === 'delete') {
          resolve(action)
        }
      })
    },
  )
}
