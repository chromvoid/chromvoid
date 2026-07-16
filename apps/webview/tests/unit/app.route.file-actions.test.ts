import {afterEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {ChromVoidApp} from '../../src/routes/app.route.impl'
import {getFileManagerModel} from '../../src/features/file-manager/file-manager.model'

const FILE_ID = 9

describe('ChromVoidApp file overlay actions', () => {
  afterEach(() => {
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('executes overlay file actions directly through FileManagerModel', () => {
    const ctx = createMockAppContext({})
    initAppContext(ctx)
    const actionSpy = vi.spyOn(getFileManagerModel(ctx), 'executeFileActionById').mockReturnValue(true)
    const app = new ChromVoidApp()

    ;(app as unknown as {onDetailsPanelAction: (event: CustomEvent) => void}).onDetailsPanelAction(
      new CustomEvent('action', {
        detail: {action: 'save-to-gallery', fileId: FILE_ID},
      }),
    )

    expect(actionSpy).toHaveBeenCalledOnce()
    expect(actionSpy).toHaveBeenCalledWith('save-to-gallery', FILE_ID)
  })
})
