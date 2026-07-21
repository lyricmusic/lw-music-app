import type { Timestamp } from 'firebase/firestore'

import type { UserCharacter } from './character'

export type UserAvatarType = 'custom' | 'none' | 'preset' | 'provider'

export interface UserAvatar {
  presetId: null | string
  storagePath: null | string
  type: UserAvatarType
}

export interface UserProfile {
  avatar: UserAvatar
  character?: UserCharacter
  createdAt: Timestamp
  displayName: string
  email: string
  onboardingCompleted: boolean
  photoURL: null | string
  updatedAt: Timestamp
}
