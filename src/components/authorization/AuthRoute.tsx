import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/authContext'
import { CircularProgress } from '@mui/material'

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-brand-color">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const { loading, user } = useAuth()

  if (loading) return <AuthLoadingScreen />

  return user ? (
    <Outlet />
  ) : (
    <Navigate replace state={{ from: location }} to="/" />
  )
}

export function GuestOnlyRoute() {
  const { loading, user } = useAuth()

  if (loading) return <AuthLoadingScreen />

  return user ? <Navigate replace to="/rooms" /> : <Outlet />
}
