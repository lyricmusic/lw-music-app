import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { RoomListItem, useRooms } from '@/entities/room'
import type { Room } from '@/entities/room'
import { CreateRoomDialog } from '@/features/create-room'
import { routes } from '@/shared/config/routes'
import { Button } from '@mui/material'

export function RoomsPage() {
  const navigate = useNavigate()
  const { error, fetchRooms, loading, rooms } = useRooms()

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const handleClose = () => setIsOpen(false)

  const handleOpenCreateRoom = () => {
    setIsOpen(true)
  }

  const handleRoomCreated = () => {
    void fetchRooms()
  }

  const handleOpenRoom = (room: Room) => {
    navigate(routes.room(room.id))
  }

  return (
    <div className="bg-[#ECEDF2] flex-1 rounded-[20px] px-10 py-7">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[38px] font-ultrabold">Комнаты</h2>
        <Button
          className="font-neue"
          onClick={handleOpenCreateRoom}
          variant="outlined"
        >
          Создать комнату
        </Button>
      </div>

      <div className="flex flex-col gap-y-[2px]">
        {loading && <span>Загружаем...</span>}
        {error && <span className="text-[#8B2635]">{error}</span>}

        {rooms.map(room => (
          <RoomListItem
            key={room.id}
            onClick={() => handleOpenRoom(room)}
            room={room}
          />
        ))}
      </div>

      <CreateRoomDialog
        onClose={handleClose}
        onRoomCreated={handleRoomCreated}
        open={isOpen}
      />
    </div>
  )
}
