import { Suspense } from 'react'
import { Outlet } from 'react-router'

import { useSession } from '@/entities/session'
import { AppHeader } from '@/widgets/app-header'
import { CircularProgress } from '@mui/material'

import { lazyRoute } from './lazyRoute'

const ProfileOnboardingDialog = lazyRoute(() =>
  import('@/features/profile-onboarding').then(module => ({
    default: module.ProfileOnboardingDialog,
  })),
)

function OnboardingLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[1390] flex items-center justify-center bg-[#12071F]/90">
      <CircularProgress sx={{ color: '#B79EFF' }} />
    </div>
  )
}

export function AuthenticatedLayout() {
  const { loading, profile, user } = useSession()
  const needsProfile = Boolean(
    user && !loading && (!profile || profile.onboardingCompleted === false),
  )

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-[#12071F] xl:h-dvh xl:overflow-hidden">
        <AppHeader />
        <div className="min-h-0 flex-1 p-1 sm:p-2 xl:overflow-hidden">
          <Outlet />
        </div>
      </div>
      {needsProfile && (
        <Suspense fallback={<OnboardingLoadingFallback />}>
          <ProfileOnboardingDialog />
        </Suspense>
      )}
    </>
  )
}
