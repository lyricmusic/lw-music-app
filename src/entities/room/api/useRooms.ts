import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { db, realtimeDb } from '@/shared/api/firebase'
import { onValue, ref } from 'firebase/database'
import {
  collection,
  type DocumentData,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  startAfter,
  where,
} from 'firebase/firestore'

import {
  parseRoomSettings,
  parseRoomStatus,
  parseRoomVisibility,
} from '../model/roomAccess'
import type { Category, Room } from '../model/types'

const ROOMS_PAGE_SIZE = 20

type RoomWithoutPresence = Omit<Room, 'participantCount'>

function parseRoomDocument(
  roomSnapshot: QueryDocumentSnapshot<DocumentData>,
): RoomWithoutPresence {
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
  }
}

function publicRoomsQuery(cursor?: QueryDocumentSnapshot<DocumentData>) {
  const baseConstraints = [
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
  ]

  return query(
    collection(db, 'rooms'),
    ...baseConstraints,
    ...(cursor ? [startAfter(cursor)] : []),
    limit(ROOMS_PAGE_SIZE),
  )
}

export function useRooms() {
  const [roomDocuments, setRoomDocuments] = useState<RoomWithoutPresence[]>([])
  const [presenceCounts, setPresenceCounts] = useState<Record<string, number>>(
    {},
  )
  const [lastDocument, setLastDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let disposed = false

    setLoading(true)
    setError(null)
    void getDocs(publicRoomsQuery())
      .then(snapshot => {
        if (disposed) return

        setRoomDocuments(snapshot.docs.map(parseRoomDocument))
        setLastDocument(snapshot.docs[snapshot.docs.length - 1] ?? null)
        setHasMore(snapshot.size === ROOMS_PAGE_SIZE)
        setLoading(false)
      })
      .catch(reason => {
        if (disposed) return

        console.error('Не удалось загрузить список комнат:', reason)
        setError('Не удалось загрузить список комнат.')
        setLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || !lastDocument || loadingMoreRef.current) return

    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const snapshot = await getDocs(publicRoomsQuery(lastDocument))
      const nextRooms = snapshot.docs.map(parseRoomDocument)

      setRoomDocuments(currentRooms => {
        const loadedIds = new Set(currentRooms.map(room => room.id))
        return [
          ...currentRooms,
          ...nextRooms.filter(room => !loadedIds.has(room.id)),
        ]
      })
      setLastDocument(snapshot.docs[snapshot.docs.length - 1] ?? lastDocument)
      setHasMore(snapshot.size === ROOMS_PAGE_SIZE)
      setError(null)
    } catch (reason) {
      console.error('Не удалось загрузить следующую страницу комнат:', reason)
      setError('Не удалось загрузить следующую страницу комнат.')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore, lastDocument])

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

  return { error, hasMore, loadMore, loading, loadingMore, rooms }
}
