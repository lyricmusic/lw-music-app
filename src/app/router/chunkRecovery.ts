const CHUNK_RELOAD_KEY = 'syncly:route-chunk-reload'

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false

  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(
    error.message,
  )
}

export function clearChunkReloadMarker() {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export function reloadCurrentPageOnce() {
  try {
    const currentUrl = window.location.href
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === currentUrl) {
      return false
    }

    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, currentUrl)
    window.location.reload()
    return true
  } catch {
    return false
  }
}

export function handleVitePreloadError(event: Event) {
  if (!reloadCurrentPageOnce()) return false

  event.preventDefault()
  return true
}
