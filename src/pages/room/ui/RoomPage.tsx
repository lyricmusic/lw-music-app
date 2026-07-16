import { useParams } from 'react-router-dom'

import { useRoomPresence } from '@/entities/room'
import { SyncedYouTubePlayer } from '@/widgets/synced-youtube-player'

export function RoomPage() {
  const { roomId = 'demo-room' } = useParams<{ roomId: string }>()
  useRoomPresence(roomId)

  return (
    <div className="h-full overflow-hidden">
      <main className="h-full w-full overflow-y-auto rounded-[20px] bg-[#ECEDF2] p-4">
        <SyncedYouTubePlayer key={roomId} roomId={roomId} />
      </main>
    </div>
  )
}
