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
  settings: RoomSettings
  status: RoomStatus
  updatedAt: Timestamp
  visibility: RoomVisibility
}

export type RoomVisibility = 'private' | 'public' | 'unlisted'

export type RoomStatus = 'active' | 'archived'

export type RoomSettings = {
  allowGuestChat: boolean
  allowGuestQueue: boolean
  slowModeSeconds: number
}

export type RoomMemberRole = 'host' | 'member' | 'moderator' | 'owner'

export type RoomMemberStatus = 'active' | 'left'

export type RoomMember = {
  invitedBy: null | string
  isGuest: boolean
  joinedAt: Timestamp
  role: RoomMemberRole
  status: RoomMemberStatus
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
