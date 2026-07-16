import {describe, expect, it} from 'vitest'

import {redactMediaTelemetryPayload} from '../../src/features/media/models/media-telemetry'

describe('media telemetry', () => {
  it('redacts string identifiers while preserving boolean evidence fields', () => {
    expect(
      redactMediaTelemetryPayload({
        sourceToken: 'secret-token',
        nativeSourceTokenPresent: true,
        fetchUrl: 'http://127.0.0.1:49152/media/source',
        fileName: 'private-video.mp4',
        provider: 'local-catalog',
        nested: {
          path: '/private/video.mp4',
          hasToken: true,
        },
      }),
    ).toEqual({
      sourceToken: '[redacted]',
      nativeSourceTokenPresent: true,
      fetchUrl: '[redacted]',
      fileName: '[redacted]',
      provider: 'local-catalog',
      nested: {
        path: '[redacted]',
        hasToken: true,
      },
    })
  })
})
