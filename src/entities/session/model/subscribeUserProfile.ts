import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import { db } from '@/shared/api/firebase/firebaseFirestore'

import type { UserProfile } from './types'

export function subscribeUserProfile(
  user: User,
  onProfile: (profile: UserProfile | null) => void,
  onError: (reason: unknown) => void,
) {
  return onSnapshot(
    doc(db, 'users', user.uid),
    snapshot => {
      onProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null)
    },
    onError,
  )
}
