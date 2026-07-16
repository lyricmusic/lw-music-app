import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

interface RoomExistenceState {
  exists: boolean | null
  roomId: string
}

export function useRoomExists(roomId: string) {
  const [state, setState] = useState<RoomExistenceState>({
    exists: null,
    roomId: '',
  })

  useEffect(() => {
    if (!roomId) return

    return onSnapshot(
      doc(db, 'rooms', roomId),
      { includeMetadataChanges: true },
      snapshot => {
        if (!snapshot.exists() && snapshot.metadata.fromCache) return

        setState({ exists: snapshot.exists(), roomId })
      },
      reason => {
        console.error('Не удалось проверить существование комнаты:', reason)
      },
    )
  }, [roomId])

  return state.roomId === roomId ? state.exists : null
}
