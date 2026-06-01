import {describe, expect, it} from 'vitest'

import {
  decodeNavigationSnapshotFromUrl,
  encodeNavigationSnapshotToUrl,
} from '../../src/app/navigation/navigation-url-codec'

describe('navigation preview URL codec', () => {
  it('encodes and decodes preview overlays', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {path: '/Docs'},
        overlay: {kind: 'preview', fileId: 17},
      },
      'https://example.test/dashboard?surface=files&path=%2F',
    )

    expect(url).toContain('overlay=preview')
    expect(url).toContain('file=17')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'files',
      files: {path: '/Docs'},
      overlay: {kind: 'preview', fileId: 17},
    })
  })

  it('encodes and decodes Markdown document routes', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {
          path: '/Docs',
          document: {kind: 'markdown', fileId: 17},
        },
        overlay: {kind: 'none'},
      },
      'https://example.test/dashboard?surface=files&path=%2F',
    )

    expect(url).toContain('document=markdown')
    expect(url).toContain('file=17')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'files',
      files: {path: '/Docs', document: {kind: 'markdown', fileId: 17}},
      overlay: {kind: 'none'},
    })
  })

  it('preserves the Notes origin for Markdown document routes', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {
          path: '/Notes',
          document: {kind: 'markdown', fileId: 17, originSurface: 'notes'},
        },
        overlay: {kind: 'none'},
      },
      'https://example.test/dashboard?surface=notes',
    )

    expect(url).toContain('document=markdown')
    expect(url).toContain('file=17')
    expect(url).toContain('from=notes')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'files',
      files: {
        path: '/Notes',
        document: {kind: 'markdown', fileId: 17, originSurface: 'notes'},
      },
      overlay: {kind: 'none'},
    })
  })

  it('encodes and decodes Markdown document source metadata', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {
          path: '/',
          document: {
            kind: 'markdown',
            fileId: 17,
            originSurface: 'notes',
            source: {
              path: '/Docs/Plan.md',
              fileName: 'Plan.md',
              size: 512,
              mimeType: 'text/markdown',
              lastModified: 1_717_171_717,
              sourceRevision: 9,
            },
          },
        },
        overlay: {kind: 'none'},
      },
      'https://example.test/dashboard?surface=notes',
    )

    expect(url).toContain('docPath=%2FDocs%2FPlan.md')
    expect(url).toContain('docName=Plan.md')
    expect(url).toContain('docSize=512')
    expect(url).toContain('docMime=text%2Fmarkdown')
    expect(url).toContain('docModified=1717171717')
    expect(url).toContain('docRevision=9')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'files',
      files: {
        path: '/',
        document: {
          kind: 'markdown',
          fileId: 17,
          originSurface: 'notes',
          source: {
            path: '/Docs/Plan.md',
            fileName: 'Plan.md',
            size: 512,
            mimeType: 'text/markdown',
            lastModified: 1_717_171_717,
            sourceRevision: 9,
          },
        },
      },
      overlay: {kind: 'none'},
    })
  })

  it('prefers Markdown document routes over overlay query params when both are present', () => {
    expect(
      decodeNavigationSnapshotFromUrl(
        'https://example.test/dashboard?surface=files&path=%2FDocs&document=markdown&overlay=preview&file=17',
      ),
    ).toEqual({
      surface: 'files',
      files: {path: '/Docs', document: {kind: 'markdown', fileId: 17}},
      overlay: {kind: 'none'},
    })
  })

  it('encodes and decodes audio overlays', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'files',
        files: {path: '/Music'},
        overlay: {kind: 'audio', fileId: 29},
      },
      'https://example.test/dashboard?surface=files&path=%2F',
    )

    expect(url).toContain('overlay=audio')
    expect(url).toContain('file=29')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'files',
      files: {path: '/Music'},
      overlay: {kind: 'audio', fileId: 29},
    })
  })

  it('normalizes legacy entry-edit URLs to the durable entry route', () => {
    expect(
      decodeNavigationSnapshotFromUrl(
        'https://example.test/dashboard?surface=passwords&pm=entry-edit&entry=entry-a&group=Group+A',
      ),
    ).toEqual({
      surface: 'passwords',
      passwords: {
        kind: 'entry',
        entryId: 'entry-a',
        groupPath: 'Group A',
      },
      overlay: {kind: 'none'},
    })
  })

  it('encodes and decodes the OTP quick view passwords route', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'passwords',
        passwords: {kind: 'otp-view'},
        overlay: {kind: 'none'},
      },
      'https://example.test/dashboard?surface=files&path=%2FDocs&overlay=details&file=12',
    )

    expect(url).toContain('surface=passwords')
    expect(url).toContain('pm=otp')
    expect(url).not.toContain('overlay=')
    expect(url).not.toContain('file=')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'passwords',
      passwords: {kind: 'otp-view'},
      overlay: {kind: 'none'},
    })
  })

  it('encodes and decodes the Notes surface', () => {
    const url = encodeNavigationSnapshotToUrl(
      {
        surface: 'notes',
        overlay: {kind: 'none'},
      },
      'https://example.test/dashboard?surface=files&path=%2FDocs&overlay=details&file=12',
    )

    expect(url).toContain('surface=notes')
    expect(url).not.toContain('path=')
    expect(url).not.toContain('overlay=')
    expect(url).not.toContain('file=')
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'notes',
      overlay: {kind: 'none'},
    })
  })
})
