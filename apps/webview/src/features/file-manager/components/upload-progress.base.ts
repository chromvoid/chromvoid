import {XLitElement} from '@statx/lit'

import type {UploadProgressModel} from './upload-progress.model'

export class UploadProgressBase extends XLitElement {
  static get properties() {
    return {
      model: {type: Object},
    }
  }

  declare model: UploadProgressModel
}
