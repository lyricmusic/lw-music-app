import { useEffect, useMemo, useState } from 'react'

import { db, realtimeDb } from '@/shared/api/firebase'
import { onValue, ref } from 'firebase/database'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

import {
  parseRoomSettings,
  parseRoomStatus,
  parseRoomVisibility,
} from '../model/roomAccess'
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
    const publicRoomsQuery = query(
      collection(db, 'rooms'),
      where('visibility', '==', 'public'),
      where('status', '==', 'active'),
    )
    const unsubscribeRooms = onSnapshot(
      publicRoomsQuery,
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
            settings: parseRoomSettings(data.settings),
            status: parseRoomStatus(data.status),
            updatedAt: data.updatedAt,
            visibility: parseRoomVisibility(data.visibility),
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

    return unsubscribeRooms
  }, [])

  useEffect(() => {
    setPresenceCounts(previousCounts =>
      Object.fromEntries(
        roomDocuments.map(room => [room.id, previousCounts[room.id] ?? 0]),
      ),
    )

    const unsubscribers = roomDocuments.map(room =>
      onValue(
        ref(realtimeDb, `roomPresence/${room.id}`),
        snapshot => {
          let participantCount = 0
          snapshot.forEach(userSnapshot => {
            if (userSnapshot.hasChildren()) participantCount += 1
          })
          setPresenceCounts(previousCounts => ({
            ...previousCounts,
            [room.id]: participantCount,
          }))
        },
        reason => {
          console.error(
            `Не удалось загрузить присутствие в комнате ${room.id}:`,
            reason,
          )
        },
      ),
    )

    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [roomDocuments])

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
