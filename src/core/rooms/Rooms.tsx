import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CreateRoomModal } from '@/core/rooms/CreateRoomModal.tsx'
import { RoomItem } from '@/core/rooms/RoomItem.tsx'
import { useRooms } from '@/core/rooms/hooks/useRooms.ts'
import { Room } from '@/core/rooms/types/Room.ts'
import { Button } from '@mui/material'

export function Rooms() {
  const navigate = useNavigate()
  const { fetchRooms, loading, rooms } = useRooms()

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const handleClose = () => setIsOpen(false)

  const handleOpenCreateRoom = () => {
    setIsOpen(true)
  }

  // TODO возможно прикольно было бы запрашивать конкретную комнату и просто добавлять в массив, чтобы заново не тянуть все
  const handleRoomCreated = () => {
    fetchRooms()
  }

  const handleOpenRoom = (room: Room) => {
    console.log('room', room)
    navigate(`/rooms/${room.id}`)
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

        {rooms.map((room: Room, index) => (
          <RoomItem
            key={index}
            onClick={() => handleOpenRoom(room)}
            room={room}
          />
        ))}
      </div>

      <CreateRoomModal
        handleClose={handleClose}
        isOpen={isOpen}
        onRoomCreated={handleRoomCreated}
      />
    </div>
  )
}
