import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { RoomListItem, useRooms } from '@/entities/room'
import type { Room } from '@/entities/room'
import { CreateRoomDialog } from '@/features/create-room'
import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

export function RoomsPage() {
  const navigate = useNavigate()
  const { error, loading, rooms } = useRooms()
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenRoom = (room: Room) => {
    navigate(routes.room(room.id))
  }

  return (
    <div className="flex-1 rounded-[20px] bg-[#ECEDF2] px-10 py-7">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[38px] font-ultrabold">Комнаты</h2>
        <Button
          className="font-neue"
          onClick={() => setIsOpen(true)}
          variant="outlined"
        >
          Создать комнату
        </Button>
      </div>

      <div className="flex flex-col gap-y-[2px]">
        {loading && <span>Загружаем...</span>}
        {error && <span className="text-[#8B2635]">{error}</span>}
        {!loading && !error && rooms.length === 0 && (
          <span className="text-secondary-text">Комнат пока нет.</span>
        )}

        {rooms.map(room => (
          <RoomListItem
            key={room.id}
            onClick={() => handleOpenRoom(room)}
            room={room}
          />
        ))}
      </div>

      <CreateRoomDialog onClose={() => setIsOpen(false)} open={isOpen} />
    </div>
  )
}
