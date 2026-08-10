import { Suspense } from 'react'
import { Outlet, Routes } from 'react-router'

import { routes } from '@/shared/config/routes'
import { CharacterEditorDialog } from '@/features/edit-character'
import { LeaveRoomDialog } from '@/features/manage-room'
import { ProfileOnboardingDialog } from '@/features/profile-onboarding'
import { AppHeader } from '@/widgets/app-header'
import { SyncedRutubePlayer } from '@/widgets/synced-rutube-player'
import { CircularProgress } from '@mui/material'
import { Timestamp } from 'firebase/firestore'

import { DirectRoomRoute, GuestOnlyRoute, ProtectedRoute } from './RouteGuards'
import { lazyRoute } from './lazyRoute'
import { createAppRouteElements } from './routeDefinitions'

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

function PageLoadingFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-color">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

function AuthenticatedLayout() {
  return (
    <>
      <div className="flex min-h-dvh flex-col bg-[#12071F] xl:h-dvh xl:overflow-hidden">
        <AppHeader />
        <div className="min-h-0 flex-1 p-1 sm:p-2 xl:overflow-hidden">
          <Outlet />
        </div>
      </div>
      <ProfileOnboardingDialog />
    </>
  )
}

function PlayerSmokeTestPage() {
  return (
    <main className="min-h-dvh bg-[#12071F] p-2 sm:p-4">
      <SyncedRutubePlayer
        previewVideoId="fc4bcb2d34a23875d0896ea966df9945"
        queueEnabled={false}
        roomId="browser-smoke-test"
        syncEnabled={false}
      />
    </main>
  )
}

function CharacterEditorSmokeTestPage() {
  return (
    <main className="min-h-dvh bg-[#12071F]">
      <CharacterEditorDialog onClose={() => undefined} open />
    </main>
  )
}

function ProfileOnboardingSmokeTestPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#12071F]">
      <AppHeader />
      <div className="min-h-0 flex-1 p-1 sm:p-2">
        <main className="h-full rounded-[20px] bg-[#24143D] px-4 py-5 text-[#F8F3FF] sm:px-8 sm:py-7">
          <h1 className="text-3xl sm:text-[38px]">Комнаты</h1>
        </main>
      </div>
      <ProfileOnboardingDialog preview />
    </div>
  )
}

function RoomsSmokeTestPage() {
  const timestamp = Timestamp.fromMillis(Date.UTC(2026, 7, 5))
  return (
    <div className="flex min-h-dvh flex-col bg-[#12071F]">
      <AppHeader />
      <div className="min-h-0 flex-1 p-1 sm:p-2">
        <RoomsPage
          previewRooms={[
            {
              categories: [{ id: 1, title: 'Поп' }],
              createdAt: timestamp,
              id: 'preview-owned-room',
              imagePath: '',
              imageUrl: '/avatars/pulse.svg',
              membershipRole: 'owner',
              name: 'Моя музыкальная комната',
              ownerId: 'preview-user',
              participantCount: null,
              settings: {
                allowGuestChat: true,
                allowGuestQueue: true,
                slowModeSeconds: 0,
              },
              status: 'active',
              updatedAt: timestamp,
              visibility: 'public',
            },
            {
              categories: [
                { id: 4, title: 'Электронная музыка' },
                { id: 13, title: 'Лоу-фай и чилл' },
              ],
              createdAt: timestamp,
              id: 'preview-archived-room',
              imagePath: '',
              imageUrl: '/avatars/night.svg',
              membershipRole: 'moderator',
              name: 'Ночной архив',
              ownerId: 'another-user',
              participantCount: null,
              settings: {
                allowGuestChat: false,
                allowGuestQueue: false,
                slowModeSeconds: 30,
              },
              status: 'archived',
              updatedAt: timestamp,
              visibility: 'private',
            },
          ]}
        />
      </div>
    </div>
  )
}

function LeaveRoomSmokeTestPage() {
  return (
    <main className="min-h-dvh bg-[#12071F]">
      <LeaveRoomDialog
        onClose={() => undefined}
        onConfirm={() => undefined}
        open
        pending={false}
        role="member"
      />
    </main>
  )
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
          import.meta.env.DEV
            ? [
                {
                  element: <CharacterEditorSmokeTestPage />,
                  path: routes.characterEditorSmokeTest,
                },
                {
                  element: <PlayerSmokeTestPage />,
                  path: routes.playerSmokeTest,
                },
                {
                  element: <ProfileOnboardingSmokeTestPage />,
                  path: routes.profileOnboardingSmokeTest,
                },
                {
                  element: <RoomsSmokeTestPage />,
                  path: routes.roomsSmokeTest,
                },
                {
                  element: <LeaveRoomSmokeTestPage />,
                  path: routes.leaveRoomSmokeTest,
                },
              ]
            : [],
        )}
      </Routes>
    </Suspense>
  )
}
