import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { RoomListItem, useRooms } from '@/entities/room'
import type { Room } from '@/entities/room'
import { CreateRoomDialog } from '@/features/create-room'
import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

export function RoomsPage() {
  const navigate = useNavigate()
  const { error, hasMore, loadMore, loading, loadingMore, rooms } = useRooms()
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenRoom = (room: Room) => {
    navigate(routes.room(room.id))
  }

  return (
    <main className="min-h-full flex-1 rounded-[18px] border border-[#3D2759] bg-[#1B0C32] px-4 py-5 text-[#F8F3FF] sm:rounded-[20px] sm:px-6 sm:py-6 lg:px-10 lg:py-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h1 className="text-3xl leading-none sm:text-[38px]">Комнаты</h1>
        <Button
          onClick={() => setIsOpen(true)}
          sx={{ minHeight: { xs: 44, sm: 48 }, paddingX: { xs: 2, sm: 3 } }}
          variant="contained"
        >
          Создать комнату
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3">
        {loading && <span className="text-[#CDBCE2]">Загружаем...</span>}
        {error && <span className="text-[#FF9BAD]">{error}</span>}
        {!loading && !error && rooms.length === 0 && (
          <span className="rounded-2xl border border-dashed border-[#5D3A82] bg-[#24143D] px-4 py-8 text-center text-[#CDBCE2]">
            Комнат пока нет. Создайте первую музыкальную комнату.
          </span>
        )}

        {rooms.map(room => (
          <RoomListItem
            key={room.id}
            onClick={() => handleOpenRoom(room)}
            room={room}
          />
        ))}

        {!loading && hasMore && (
          <Button
            disabled={loadingMore}
            onClick={() => void loadMore()}
            sx={{ alignSelf: 'center', marginTop: 2 }}
            variant="outlined"
          >
            {loadingMore ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        )}
      </div>

      <CreateRoomDialog
        existingRoomNames={rooms.map(room => room.name)}
        onClose={() => setIsOpen(false)}
        open={isOpen}
      />
    </main>
  )
}
