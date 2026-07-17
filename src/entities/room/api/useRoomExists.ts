import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

interface RoomExistenceState {
  error: null | 'forbidden' | 'unknown'
  exists: boolean | null
  roomId: string
}

export function useRoomExists(roomId: string, retryKey: unknown = null) {
  const [state, setState] = useState<RoomExistenceState>({
    error: null,
    exists: null,
    roomId: '',
  })

  useEffect(() => {
    if (!roomId) return

    setState({ error: null, exists: null, roomId })

    return onSnapshot(
      doc(db, 'rooms', roomId),
      { includeMetadataChanges: true },
      snapshot => {
        if (!snapshot.exists() && snapshot.metadata.fromCache) return

        setState({ error: null, exists: snapshot.exists(), roomId })
      },
      reason => {
        console.error('Не удалось проверить существование комнаты:', reason)
        setState({
          error: reason.code === 'permission-denied' ? 'forbidden' : 'unknown',
          exists: null,
          roomId,
        })
      },
    )
  }, [retryKey, roomId])

  return state.roomId === roomId
    ? { error: state.error, exists: state.exists }
    : { error: null, exists: null }
}
