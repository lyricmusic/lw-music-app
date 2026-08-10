import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleVitePreloadError } from './chunkRecovery'
import { isRouteChunkLoadError } from './lazyRoute'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('prevents a Vite preload error and reloads the current URL only once', () => {
    const storage = new Map<string, string>()
    const reload = vi.fn()
    vi.stubGlobal('window', {
      location: {
        href: 'https://syncly.lyricweb.ru/room/example',
        reload,
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })

    const firstEvent = new Event('vite:preloadError', { cancelable: true })
    expect(handleVitePreloadError(firstEvent)).toBe(true)
    expect(firstEvent.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledOnce()

    const repeatedEvent = new Event('vite:preloadError', {
      cancelable: true,
    })
    expect(handleVitePreloadError(repeatedEvent)).toBe(false)
    expect(repeatedEvent.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })
})
