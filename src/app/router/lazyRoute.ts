import { lazy, type ComponentType } from 'react'

import {
  clearChunkReloadMarker,
  isChunkLoadError,
  reloadCurrentPageOnce,
} from './chunkRecovery'

export { isChunkLoadError as isRouteChunkLoadError } from './chunkRecovery'

// React's own lazy() constraint uses any so components with required props remain
// assignable while preserving their exact component type in the return value.
export function lazyRoute<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async (): Promise<{ default: T }> => {
    try {
      const routeModule = await importer()
      clearChunkReloadMarker()
      return routeModule
    } catch (error) {
      if (isChunkLoadError(error) && reloadCurrentPageOnce()) {
        return new Promise<never>(() => undefined)
      }

      throw error
    }
  })
}
