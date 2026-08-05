import type { DocumentData, DocumentSnapshot } from 'firebase/firestore'

import {
  parseRoomSettings,
  parseRoomStatus,
  parseRoomVisibility,
} from '../model/roomAccess'
import type { Category, Room } from '../model/types'

export type RoomWithoutPresence = Omit<Room, 'participantCount'>

export function parseRoomDocument(
  roomSnapshot: DocumentSnapshot<DocumentData>,
): RoomWithoutPresence | null {
  if (!roomSnapshot.exists()) return null

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
