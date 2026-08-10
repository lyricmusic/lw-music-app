import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { RoomListItem, useMyRooms, useRooms } from '@/entities/room'
import type { MyRoom, Room, RoomMemberRole } from '@/entities/room'
import { CreateRoomDialog } from '@/features/create-room'
import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

const ROLE_LABELS: Record<RoomMemberRole, string> = {
  host: 'Ведущий',
  member: 'Участник',
  moderator: 'Модератор',
  owner: 'Владелец',
}

interface RoomsPageProps {
  previewRooms?: MyRoom[]
}

export function RoomsPage({ previewRooms }: RoomsPageProps = {}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'mine' ? 'mine' : 'all'
  const preview = previewRooms !== undefined
  const publicRooms = useRooms(!preview && view === 'all')
  const myRooms = useMyRooms(!preview && view === 'mine')
  const [isOpen, setIsOpen] = useState(false)
  const rooms = preview
    ? view === 'mine'
      ? previewRooms
      : previewRooms.filter(
          room => room.status === 'active' && room.visibility === 'public',
        )
    : view === 'mine'
      ? myRooms.rooms
      : publicRooms.rooms
  const error = preview
    ? null
    : view === 'mine'
      ? myRooms.error
      : publicRooms.error
  const loading = preview
    ? false
    : view === 'mine'
      ? myRooms.loading
      : publicRooms.loading

  const handleOpenRoom = (room: Room) => {
    navigate(routes.room(room.id), { state: { roomEntrySource: 'catalog' } })
  }

  const selectView = (nextView: 'all' | 'mine') => {
    setSearchParams(nextView === 'mine' ? { view: 'mine' } : {}, {
      replace: true,
    })
  }

  const roomBadges = (room: Room) => {
    if (view !== 'mine') return []

    const myRoom = room as MyRoom
    return [
      ROLE_LABELS[myRoom.membershipRole],
      ...(myRoom.status === 'archived' ? ['В архиве'] : []),
    ]
  }

  return (
    <main className="min-h-full flex-1 rounded-[18px] border border-[#3D2759] bg-[#1B0C32] px-4 py-5 text-[#F8F3FF] sm:rounded-[20px] sm:px-6 sm:py-6 lg:px-10 lg:py-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h1 className="text-3xl leading-none sm:text-[38px]">Комнаты</h1>
        <Button
          disabled={preview}
          onClick={() => setIsOpen(true)}
          sx={{ minHeight: { xs: 44, sm: 48 }, paddingX: { xs: 2, sm: 3 } }}
          variant="contained"
        >
          Создать комнату
        </Button>
      </div>

      <div
        aria-label="Раздел комнат"
        className="mb-5 grid w-full grid-cols-2 gap-1 rounded-2xl border border-[#4A2B6D] bg-[#24143D] p-1 sm:mb-6 sm:max-w-[420px]"
        role="tablist"
      >
        <button
          aria-selected={view === 'all'}
          className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition sm:text-base ${
            view === 'all'
              ? 'bg-[#6F4AA1] text-white'
              : 'bg-[#24143D] text-[#CDBCE2] hover:bg-[#32204B] hover:text-white'
          }`}
          onClick={() => selectView('all')}
          role="tab"
          type="button"
        >
          Все комнаты
        </button>
        <button
          aria-selected={view === 'mine'}
          className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition sm:text-base ${
            view === 'mine'
              ? 'bg-[#6F4AA1] text-white'
              : 'bg-[#24143D] text-[#CDBCE2] hover:bg-[#32204B] hover:text-white'
          }`}
          onClick={() => selectView('mine')}
          role="tab"
          type="button"
        >
          Мои комнаты
        </button>
      </div>

      <div
        aria-label={view === 'mine' ? 'Мои комнаты' : 'Все комнаты'}
        className="flex flex-col gap-2 sm:gap-3"
        role="tabpanel"
      >
        {loading && <span className="text-[#CDBCE2]">Загружаем...</span>}
        {error && <span className="text-[#FF9BAD]">{error}</span>}
        {!loading && !error && rooms.length === 0 && (
          <span className="rounded-2xl border border-dashed border-[#5D3A82] bg-[#24143D] px-4 py-8 text-center text-[#CDBCE2]">
            {view === 'mine'
              ? 'У вас пока нет своих комнат и активных участий.'
              : 'Комнат пока нет. Создайте первую музыкальную комнату.'}
          </span>
        )}

        {rooms.map(room => (
          <RoomListItem
            badges={roomBadges(room)}
            key={room.id}
            onClick={() => handleOpenRoom(room)}
            room={room}
          />
        ))}

        {!preview && view === 'all' && !loading && publicRooms.hasMore && (
          <Button
            disabled={publicRooms.loadingMore}
            onClick={() => void publicRooms.loadMore()}
            sx={{ alignSelf: 'center', marginTop: 2 }}
            variant="outlined"
          >
            {publicRooms.loadingMore ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        )}
      </div>

      {!preview && (
        <CreateRoomDialog
          existingRoomNames={rooms.map(room => room.name)}
          onClose={() => setIsOpen(false)}
          onCreated={roomId =>
            navigate(routes.room(roomId), {
              state: { roomEntrySource: 'created' },
            })
          }
          open={isOpen}
        />
      )}
    </main>
  )
}
