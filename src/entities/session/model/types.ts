import type { Timestamp } from 'firebase/firestore'

import type { UserCharacter } from './character'

export type UserAvatarType = 'custom' | 'none' | 'preset' | 'provider'

export interface UserAvatar {
  presetId: null | string
  storagePath: null | string
  type: UserAvatarType
}

export interface PublicUserProfile {
  avatar: UserAvatar
  character?: UserCharacter
  createdAt: Timestamp
  displayName: string
  photoURL: null | string
  updatedAt: Timestamp
}

export interface UserProfile extends PublicUserProfile {
  email: string
  onboardingCompleted: boolean
}
