import { useParams } from 'react-router-dom'

import { useRoomPresence } from '@/entities/room'
import { RoomChat } from '@/widgets/room-chat'
import { SyncedYouTubePlayer } from '@/widgets/synced-youtube-player'
import { Box } from '@mui/material'

export function RoomPage() {
  const { roomId = 'demo-room' } = useParams<{ roomId: string }>()
  useRoomPresence(roomId)

  return (
    <Box
      className="h-full min-h-0 overflow-hidden bg-[#3F3F59] p-1"
      component="main"
    >
      <Box className="room-content-grid">
        <SyncedYouTubePlayer key={roomId} roomId={roomId} />
        <RoomChat key={roomId} roomId={roomId} />
      </Box>
    </Box>
  )
}
