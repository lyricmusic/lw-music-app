import { useEffect, useState } from 'react'

import { useSession } from '@/entities/session'
import { db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { collection, onSnapshot } from 'firebase/firestore'

export function useBlockedUsers() {
  const { user } = useSession()
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) {
      setBlockedUserIds(new Set())
      return
    }

    return onSnapshot(
      collection(db, 'users', user.uid, 'blockedUsers'),
      snapshot => {
        setBlockedUserIds(new Set(snapshot.docs.map(document => document.id)))
      },
      reason => {
        reportOperationalError('blocked_users_subscription', reason)
        setBlockedUserIds(new Set())
      },
    )
  }, [user])

  return blockedUserIds
}
