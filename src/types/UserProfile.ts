import type { Timestamp } from 'firebase/firestore'

export interface UserProfile {
  createdAt: Timestamp
  displayName: string
  email: string
  photoURL: null | string
  updatedAt: Timestamp
}
