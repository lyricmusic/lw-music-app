import { Suspense } from 'react'
import { Routes } from 'react-router'

import { routes } from '@/shared/config/routes'
import { CircularProgress } from '@mui/material'

import { DirectRoomRoute, GuestOnlyRoute, ProtectedRoute } from './RouteGuards'
import { lazyRoute } from './lazyRoute'
import { createAppRouteElements } from './routeDefinitions'

type DevSmokeComponent = (typeof import('./DevSmokePage'))['default']

const AuthenticatedLayout = lazyRoute(() =>
  import('./AuthenticatedLayout').then(module => ({
    default: module.AuthenticatedLayout,
  })),
)
const NotFoundPage = lazyRoute(() =>
  import('@/pages/not-found').then(module => ({
    default: module.NotFoundPage,
  })),
)
const JoinPage = lazyRoute(() =>
  import('@/pages/join').then(module => ({ default: module.JoinPage })),
)
const RoomPage = lazyRoute(() =>
  import('@/pages/room').then(module => ({ default: module.RoomPage })),
)
const RoomsPage = lazyRoute(() =>
  import('@/pages/rooms').then(module => ({ default: module.RoomsPage })),
)
const SignInPage = lazyRoute(() =>
  import('@/pages/sign-in').then(module => ({ default: module.SignInPage })),
)
const SignUpPage = lazyRoute(() =>
  import('@/pages/sign-up').then(module => ({ default: module.SignUpPage })),
)
const DevSmokePage = import.meta.env.DEV
  ? lazyRoute<DevSmokeComponent>(() => import('./DevSmokePage'))
  : null

function PageLoadingFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-color">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

function getDevSmokeRoutes() {
  if (!DevSmokePage) return []

  return [
    {
      element: <DevSmokePage page="character-editor" />,
      path: routes.characterEditorSmokeTest,
    },
    {
      element: <DevSmokePage page="player" />,
      path: routes.playerSmokeTest,
    },
    {
      element: <DevSmokePage page="profile-onboarding" />,
      path: routes.profileOnboardingSmokeTest,
    },
    {
      element: <DevSmokePage page="rooms" />,
      path: routes.roomsSmokeTest,
    },
    {
      element: <DevSmokePage page="leave-room" />,
      path: routes.leaveRoomSmokeTest,
    },
  ]
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {createAppRouteElements(
          {
            authenticatedLayout: <AuthenticatedLayout />,
            directRoomRoute: <DirectRoomRoute />,
            guestOnlyRoute: <GuestOnlyRoute />,
            joinPage: <JoinPage />,
            notFoundPage: <NotFoundPage />,
            protectedRoute: <ProtectedRoute />,
            roomPage: <RoomPage />,
            roomsPage: <RoomsPage />,
            signInPage: <SignInPage />,
            signUpPage: <SignUpPage />,
          },
          getDevSmokeRoutes(),
        )}
      </Routes>
    </Suspense>
  )
}
