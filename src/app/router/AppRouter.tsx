import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { routes } from '@/shared/config/routes'
import { AppHeader } from '@/widgets/app-header'
import { SyncedYouTubePlayer } from '@/widgets/synced-youtube-player'
import { CircularProgress } from '@mui/material'

import { GuestOnlyRoute, ProtectedRoute } from './RouteGuards'

const NotFoundPage = lazy(() =>
  import('@/pages/not-found').then(module => ({
    default: module.NotFoundPage,
  })),
)
const RoomPage = lazy(() =>
  import('@/pages/room').then(module => ({ default: module.RoomPage })),
)
const RoomsPage = lazy(() =>
  import('@/pages/rooms').then(module => ({ default: module.RoomsPage })),
)
const SignInPage = lazy(() =>
  import('@/pages/sign-in').then(module => ({ default: module.SignInPage })),
)
const SignUpPage = lazy(() =>
  import('@/pages/sign-up').then(module => ({ default: module.SignUpPage })),
)

function PageLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-brand-color">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

function AuthenticatedLayout() {
  return (
    <div className="grid h-screen grid-rows-[84px_minmax(0,1fr)] gap-y-1 bg-brand-color pb-1">
      <AppHeader />
      <div className="h-full min-h-0">
        <Outlet />
      </div>
    </div>
  )
}

function PlayerSmokeTestPage() {
  return (
    <main className="min-h-screen bg-[#ECEDF2] p-4">
      <SyncedYouTubePlayer roomId="browser-smoke-test" syncEnabled={false} />
    </main>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {import.meta.env.DEV && (
          <Route
            element={<PlayerSmokeTestPage />}
            path={routes.playerSmokeTest}
          />
        )}

        <Route element={<GuestOnlyRoute />}>
          <Route element={<SignInPage />} path={routes.signIn} />
          <Route element={<SignUpPage />} path={routes.signUp} />
          <Route
            element={<Navigate replace to={routes.signUp} />}
            path={routes.legacySignUp}
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AuthenticatedLayout />}>
            <Route element={<RoomsPage />} path={routes.rooms} />
            <Route element={<RoomPage />} path={routes.roomPattern} />
          </Route>
        </Route>

        <Route
          element={<Navigate replace to={routes.signIn} />}
          path={routes.home}
        />
        <Route element={<NotFoundPage />} path="*" />
      </Routes>
    </Suspense>
  )
}
