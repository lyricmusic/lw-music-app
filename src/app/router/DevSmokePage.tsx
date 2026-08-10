import { Timestamp } from 'firebase/firestore'

import { LeaveRoomDialog } from '@/features/manage-room'
import { CharacterEditorDialog } from '@/features/edit-character'
import { ProfileOnboardingDialog } from '@/features/profile-onboarding'
import { RoomsPage } from '@/pages/rooms'
import { AppHeader } from '@/widgets/app-header'
import { SyncedRutubePlayer } from '@/widgets/synced-rutube-player'

type DevSmokePageName =
  'character-editor' | 'leave-room' | 'player' | 'profile-onboarding' | 'rooms'

function CharacterEditorSmokeTestPage() {
  return (
    <main className="min-h-dvh bg-[#12071F]">
      <CharacterEditorDialog onClose={() => undefined} open />
    </main>
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

export default function DevSmokePage({ page }: { page: DevSmokePageName }) {
  switch (page) {
    case 'character-editor':
      return <CharacterEditorSmokeTestPage />
    case 'leave-room':
      return <LeaveRoomSmokeTestPage />
    case 'player':
      return <PlayerSmokeTestPage />
    case 'profile-onboarding':
      return <ProfileOnboardingSmokeTestPage />
    case 'rooms':
      return <RoomsSmokeTestPage />
  }
}
