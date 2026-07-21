import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'

import type { RoomQueueItem } from '../model/types'

export const ROOM_QUEUE_LIMIT = 50

export function useRoomQueue(roomId: string) {
  const [items, setItems] = useState<RoomQueueItem[]>([])
  const [loading, setLoading] = useState(Boolean(roomId))
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    setItems([])
    setError(null)

    if (!roomId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const queueQuery = query(
      collection(db, 'rooms', roomId, 'queue'),
      orderBy('position', 'asc'),
      limit(ROOM_QUEUE_LIMIT),
    )

    return onSnapshot(
      queueQuery,
      snapshot => {
        const nextItems = snapshot.docs
          .map(itemSnapshot => {
            const data = itemSnapshot.data({ serverTimestamps: 'estimate' })

            return {
              createdAt:
                data.createdAt instanceof Timestamp ? data.createdAt : null,
              displayName:
                typeof data.displayName === 'string' ? data.displayName : '',
              id: itemSnapshot.id,
              pending: itemSnapshot.metadata.hasPendingWrites,
              photoURL:
                typeof data.photoURL === 'string' ? data.photoURL : null,
              position: typeof data.position === 'number' ? data.position : 0,
              userId: typeof data.userId === 'string' ? data.userId : '',
              videoId: typeof data.videoId === 'string' ? data.videoId : '',
            } satisfies RoomQueueItem
          })
          .filter(
            item =>
              item.displayName &&
              item.position > 0 &&
              item.userId &&
              /^([-_A-Za-z0-9]{11}|[a-f\d]{32})$/.test(item.videoId),
          )

        setItems(nextItems)
        setError(null)
        setLoading(false)
      },
      reason => {
        console.error('Не удалось загрузить очередь комнаты:', reason)
        setError(
          'Не удалось загрузить очередь. Проверьте правила доступа Firestore.',
        )
        setLoading(false)
      },
    )
  }, [roomId])

  return { error, items, loading }
}
