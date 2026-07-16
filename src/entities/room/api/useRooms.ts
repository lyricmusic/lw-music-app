import { useEffect, useMemo, useState } from 'react'

import { db, realtimeDb } from '@/shared/api/firebase'
import { onValue, ref } from 'firebase/database'
import { collection, onSnapshot } from 'firebase/firestore'

import type { Category, Room } from '../model/types'

type RoomWithoutPresence = Omit<Room, 'participantCount'>

export function useRooms() {
  const [roomDocuments, setRoomDocuments] = useState<RoomWithoutPresence[]>([])
  const [presenceCounts, setPresenceCounts] = useState<Record<string, number>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    const unsubscribeRooms = onSnapshot(
      collection(db, 'rooms'),
      snapshot => {
        const nextRooms = snapshot.docs.map(roomSnapshot => {
          const data = roomSnapshot.data()

          return {
            categories: Array.isArray(data.categories)
              ? (data.categories as Category[])
              : [],
            createdAt: data.createdAt,
            id: roomSnapshot.id,
            imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
            name: typeof data.name === 'string' ? data.name : '',
            ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
            updatedAt: data.updatedAt,
          } satisfies RoomWithoutPresence
        })

        setRoomDocuments(nextRooms)
        setError(null)
        setLoading(false)
      },
      reason => {
        console.error('Не удалось загрузить список комнат:', reason)
        setError('Не удалось загрузить список комнат.')
        setLoading(false)
      },
    )

    const unsubscribePresence = onValue(
      ref(realtimeDb, 'roomPresence'),
      snapshot => {
        const nextCounts: Record<string, number> = {}

        snapshot.forEach(roomSnapshot => {
          let participantCount = 0
          roomSnapshot.forEach(userSnapshot => {
            if (userSnapshot.hasChildren()) participantCount += 1
          })
          nextCounts[roomSnapshot.key ?? ''] = participantCount
        })

        setPresenceCounts(nextCounts)
      },
      reason => {
        console.error('Не удалось загрузить присутствие в комнатах:', reason)
      },
    )

    return () => {
      unsubscribeRooms()
      unsubscribePresence()
    }
  }, [])

  const rooms = useMemo(
    () =>
      roomDocuments.map(room => ({
        ...room,
        participantCount: presenceCounts[room.id] ?? 0,
      })),
    [presenceCounts, roomDocuments],
  )

  return { error, loading, rooms }
}
