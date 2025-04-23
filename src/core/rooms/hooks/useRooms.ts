import { useCallback, useEffect, useState } from 'react'

import { Room as RoomType } from '@/core/rooms/types/Room.ts'
import { db } from '@/firebase.ts'
import {
  QueryDocumentSnapshot,
  QuerySnapshot,
  collection,
  getDocs,
} from 'firebase/firestore'

export function useRooms() {
  const [rooms, setRooms] = useState<RoomType[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<null | string>(null)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const roomsCollection = collection(db, 'rooms')
      const roomsSnapshot = (await getDocs(
        roomsCollection,
      )) as QuerySnapshot<RoomType>
      const roomsList: RoomType[] = []
      roomsSnapshot.docs.forEach((doc: QueryDocumentSnapshot<RoomType>) => {
        roomsList.push(doc.data())
      })
      console.log('roomsList', roomsList)
      setRooms(roomsList)
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  return { error, fetchRooms, loading, rooms }
}
