import { useEffect, useRef, useState } from 'react'
import {
  Link as RouterLink,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'

import { useSession } from '@/entities/session'
import { auth } from '@/shared/api/firebase'
import { routes } from '@/shared/config/routes'
import { Button, CircularProgress, Typography } from '@mui/material'
import { signInAnonymously } from 'firebase/auth'

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

  return user && !user.isAnonymous ? (
    <Outlet />
  ) : (
    <Navigate replace state={{ from: location }} to={routes.signIn} />
  )
}

export function DirectRoomRoute() {
  const location = useLocation()
  const { loading, user } = useSession()
  const attemptedSignIn = useRef(false)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    if (loading || user || attemptedSignIn.current) return

    attemptedSignIn.current = true
    void signInAnonymously(auth).catch(reason => {
      console.error('Не удалось войти в комнату как гость:', reason)
      setError(
        'Гостевой вход сейчас недоступен. Войдите в аккаунт и попробуйте снова.',
      )
    })
  }, [loading, user])

  if (loading || (!user && !error)) return <SessionLoadingScreen />

  if (error) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-5 bg-brand-color px-6 text-center">
        <Typography sx={{ color: '#FFFFFF', maxWidth: 520 }} variant="h5">
          {error}
        </Typography>
        <Button
          component={RouterLink}
          state={{ from: location }}
          to={routes.signIn}
          variant="contained"
        >
          Войти в аккаунт
        </Button>
      </main>
    )
  }

  return <Outlet />
}

export function GuestOnlyRoute() {
  const { loading, user } = useSession()

  if (loading) return <SessionLoadingScreen />

  return user && !user.isAnonymous ? (
    <Navigate replace to={routes.rooms} />
  ) : (
    <Outlet />
  )
}
