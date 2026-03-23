import {describe, expect, it} from 'vitest'

import {entrySharedStyles} from '../../src/features/passmanager/components/card/entry/entry.styles'
import {PMEntryEditMobile} from '../../src/features/passmanager/components/card/entry-edit/entry-edit-mobile'
import {pmEntryEditSharedStyles} from '../../src/features/passmanager/components/card/entry-edit/entry-edit.styles'

describe('pmEntryEditSharedStyles', () => {
  it('reserves gutter for the vertical scrollbar', () => {
    const cssText = pmEntryEditSharedStyles.map((style) => style.cssText).join('\n')

    expect(cssText).toContain('scrollbar-gutter: stable;')
  })

  it('lets mobile entry edit fill the parent card height', () => {
    expect(entrySharedStyles.cssText).toContain('pm-entry-edit-mobile')
  })

  it('includes mobile OTP footer and accordion seam fixes', () => {
    const cssText = PMEntryEditMobile.styles.map((style) => style.cssText).join('\n')

    expect(cssText).toContain('block-size: 100%;')
    expect(cssText).toContain('scroll-padding-block-end')
    expect(cssText).toContain('otp-create-screen-footer')
    expect(cssText).toContain('position: static;')
    expect(cssText).toContain('cv-accordion-item::part(header)')
    expect(cssText).toContain('margin: 0;')
  })
})
