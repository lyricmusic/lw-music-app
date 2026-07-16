import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useRoomExists, useRoomPresence } from '@/entities/room'
import { routes } from '@/shared/config/routes'
import { RoomChat } from '@/widgets/room-chat'
import { SyncedYouTubePlayer } from '@/widgets/synced-youtube-player'
import { Box } from '@mui/material'

export function RoomPage() {
  const navigate = useNavigate()
  const { roomId = 'demo-room' } = useParams<{ roomId: string }>()
  const roomExists = useRoomExists(roomId)
  useRoomPresence(roomExists ? roomId : '')

  useEffect(() => {
    if (roomExists === false) navigate(routes.rooms, { replace: true })
  }, [navigate, roomExists])

  if (roomExists === false) return null

  return (
    <Box
      className="h-full min-h-0 overflow-hidden bg-[#3F3F59] px-1"
      component="main"
    >
      <Box className="room-content-grid">
        <Box className="room-player-column">
          <SyncedYouTubePlayer key={roomId} roomId={roomId} />
        </Box>
        <Box className="room-chat-column">
          <RoomChat key={roomId} roomId={roomId} />
        </Box>
      </Box>
    </Box>
  )
}
