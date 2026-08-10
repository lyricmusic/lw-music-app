interface GuardUser {
  isAnonymous: boolean
}

interface GuardSession {
  loading: boolean
  user: GuardUser | null
}

export type DirectRoomRouteDecision = 'allow' | 'error' | 'loading'
export type GuestOnlyRouteDecision = 'allow' | 'redirect-rooms' | 'loading'
export type ProtectedRouteDecision = 'allow' | 'redirect-sign-in' | 'loading'

export function getProtectedRouteDecision({
  loading,
  user,
}: GuardSession): ProtectedRouteDecision {
  if (loading) return 'loading'
  return user && !user.isAnonymous ? 'allow' : 'redirect-sign-in'
}

export function getDirectRoomRouteDecision(
  { loading, user }: GuardSession,
  error: string | null,
): DirectRoomRouteDecision {
  if (loading || (!user && !error)) return 'loading'
  return error ? 'error' : 'allow'
}

export function getGuestOnlyRouteDecision({
  loading,
  user,
}: GuardSession): GuestOnlyRouteDecision {
  if (loading) return 'loading'
  return user && !user.isAnonymous ? 'redirect-rooms' : 'allow'
}
