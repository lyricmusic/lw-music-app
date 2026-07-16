import type { Timestamp } from 'firebase/firestore'

export interface RoomMessage {
  authorId: string
  authorName: string
  authorPhotoURL: null | string
  createdAt: null | Timestamp
  id: string
  pending: boolean
  text: string
}
