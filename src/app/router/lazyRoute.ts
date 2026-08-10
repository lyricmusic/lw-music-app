import { lazy, type ComponentType } from 'react'

const ROUTE_CHUNK_RELOAD_KEY = 'syncly:route-chunk-reload'

export function isRouteChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false

  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(
    error.message,
  )
}

function clearRouteChunkReloadMarker() {
  try {
    window.sessionStorage.removeItem(ROUTE_CHUNK_RELOAD_KEY)
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

function reloadCurrentRouteOnce() {
  try {
    const currentUrl = window.location.href
    if (window.sessionStorage.getItem(ROUTE_CHUNK_RELOAD_KEY) === currentUrl) {
      return false
    }

    window.sessionStorage.setItem(ROUTE_CHUNK_RELOAD_KEY, currentUrl)
    window.location.reload()
    return true
  } catch {
    return false
  }
}

export function lazyRoute<T extends ComponentType>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const routeModule = await importer()
      clearRouteChunkReloadMarker()
      return routeModule
    } catch (error) {
      if (isRouteChunkLoadError(error) && reloadCurrentRouteOnce()) {
        return new Promise<never>(() => undefined)
      }

      throw error
    }
  })
}
