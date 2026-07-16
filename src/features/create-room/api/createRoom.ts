import type { Room } from '@/entities/room'
import { db } from '@/shared/api/firebase'
import { collection, doc, setDoc } from 'firebase/firestore'

export async function createRoom(room: Omit<Room, 'id'>) {
  const roomRef = doc(collection(db, 'rooms'))

  await setDoc(roomRef, {
    ...room,
    id: roomRef.id,
  })

  return roomRef.id
}
