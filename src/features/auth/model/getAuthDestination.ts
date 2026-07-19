import { routes } from '@/shared/config/routes'

interface AuthLocationState {
  from?: {
    hash?: string
    pathname?: string
    search?: string
  }
}

export function getAuthDestination(state: unknown) {
  const from = (state as AuthLocationState | null)?.from
  const pathname = from?.pathname

  if (!pathname?.startsWith('/') || pathname.startsWith('//')) {
    return routes.rooms
  }

  return `${pathname}${from?.search ?? ''}${from?.hash ?? ''}`
}
