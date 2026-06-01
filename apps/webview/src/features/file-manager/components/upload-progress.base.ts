import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import type {PropertyValues} from 'lit'

import type {UploadProgressModel} from './upload-progress.model'

export class UploadProgressBase extends ReatomLitElement {
  static get properties() {
    return {
      model: {type: Object},
    }
  }

  declare model: UploadProgressModel

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    this.model?.syncPrimaryDisplay()
  }
}
