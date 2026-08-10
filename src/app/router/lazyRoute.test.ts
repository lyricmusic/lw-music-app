import { describe, expect, it } from 'vitest'

import { isRouteChunkLoadError } from './lazyRoute'

describe('stale route chunk detection', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/room-old.js',
    'Importing a module script failed.',
    'Error loading dynamically imported module',
    'Unable to preload CSS for /assets/room-old.css',
  ])('recognizes a stale-deployment chunk error: %s', message => {
    expect(isRouteChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('does not reload for application errors', () => {
    expect(isRouteChunkLoadError(new Error('Room permission denied'))).toBe(
      false,
    )
    expect(isRouteChunkLoadError('network error')).toBe(false)
  })
})
