import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/entities/session'
import { routes } from '@/shared/config/routes'
import { CircularProgress } from '@mui/material'

function SessionLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-brand-color">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const { loading, user } = useSession()

  if (loading) return <SessionLoadingScreen />

  return user ? (
    <Outlet />
  ) : (
    <Navigate replace state={{ from: location }} to={routes.signIn} />
  )
}

export function GuestOnlyRoute() {
  const { loading, user } = useSession()

  if (loading) return <SessionLoadingScreen />

  return user ? <Navigate replace to={routes.rooms} /> : <Outlet />
}
