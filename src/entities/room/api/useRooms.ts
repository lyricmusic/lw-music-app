import { useCallback, useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import {
  QueryDocumentSnapshot,
  QuerySnapshot,
  collection,
  getDocs,
} from 'firebase/firestore'

import type { Room } from '../model/types'

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<null | string>(null)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const roomsCollection = collection(db, 'rooms')
      const roomsSnapshot = (await getDocs(roomsCollection)) as QuerySnapshot<
        Omit<Room, 'id'> & { id?: string }
      >
      const roomsList: Room[] = []
      roomsSnapshot.docs.forEach(
        (
          snapshot: QueryDocumentSnapshot<Omit<Room, 'id'> & { id?: string }>,
        ) => {
          roomsList.push({ ...snapshot.data(), id: snapshot.id })
        },
      )
      setRooms(roomsList)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить список комнат.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  return { error, fetchRooms, loading, rooms }
}
