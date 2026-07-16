import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

export function useRoomName(roomId?: string) {
  const [room, setRoom] = useState({ id: '', name: '' })

  useEffect(() => {
    if (!roomId) return

    return onSnapshot(doc(db, 'rooms', roomId), snapshot => {
      const name = snapshot.data()?.name

      setRoom({ id: roomId, name: typeof name === 'string' ? name : '' })
    })
  }, [roomId])

  return room.id === roomId ? room.name : ''
}
