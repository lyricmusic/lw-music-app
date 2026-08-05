import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { db } from '@/shared/api/firebase'
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
  parseRoomDocument,
  type RoomWithoutPresence,
} from './parseRoomDocument'

const ROOMS_PAGE_SIZE = 20

function publicRoomsQuery(cursor?: QueryDocumentSnapshot<DocumentData>) {
  const baseConstraints = [
    where('status', '==', 'active'),
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

export function useRooms(enabled = true) {
  const [roomDocuments, setRoomDocuments] = useState<RoomWithoutPresence[]>([])
  const [lastDocument, setLastDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    let disposed = false

    if (!enabled) {
      setRoomDocuments([])
      setLastDocument(null)
      setHasMore(false)
      setLoading(false)
      setLoadingMore(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    void getDocs(publicRoomsQuery())
      .then(snapshot => {
        if (disposed) return

        setRoomDocuments(
          snapshot.docs
            .map(parseRoomDocument)
            .filter((room): room is RoomWithoutPresence => room !== null),
        )
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
  }, [enabled])

  const loadMore = useCallback(async () => {
    if (!hasMore || !lastDocument || loadingMoreRef.current) return

    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const snapshot = await getDocs(publicRoomsQuery(lastDocument))
      const nextRooms = snapshot.docs
        .map(parseRoomDocument)
        .filter((room): room is RoomWithoutPresence => room !== null)

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

  const rooms = useMemo(
    () =>
      roomDocuments.map(room => ({
        ...room,
        participantCount: null,
      })),
    [roomDocuments],
  )

  return { error, hasMore, loadMore, loading, loadingMore, rooms }
}
