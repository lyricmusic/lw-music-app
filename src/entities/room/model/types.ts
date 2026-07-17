import type { Timestamp } from 'firebase/firestore'

export type Room = {
  categories: Category[]
  createdAt: Timestamp
  id: string
  imagePath: string
  imageUrl: string
  name: string
  ownerId: string
  participantCount: number
  updatedAt: Timestamp
}

export type Category = {
  id: number
  title: string
}

export type RoomQueueItem = {
  createdAt: Timestamp | null
  displayName: string
  id: string
  pending: boolean
  photoURL: null | string
  position: number
  userId: string
  videoId: string
}
