import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { auth, db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { User, onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import type { UserProfile } from './types'

interface SessionContextValue {
  loading: boolean
  profile: UserProfile | null
  user: User | null
}

const SessionContext = createContext<SessionContextValue>({
  loading: true,
  profile: null,
  user: null,
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribeProfile: undefined | (() => void)

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      currentUser => {
        unsubscribeProfile?.()
        setUser(currentUser)

        if (!currentUser) {
          setProfile(null)
          setLoading(false)
          return
        }

        unsubscribeProfile = onSnapshot(
          doc(db, 'users', currentUser.uid),
          snapshot => {
            setProfile(
              snapshot.exists() ? (snapshot.data() as UserProfile) : null,
            )
            setLoading(false)
          },
          reason => {
            reportOperationalError('profile_subscription', reason)
            setProfile(null)
            setLoading(false)
          },
        )
      },
      reason => {
        reportOperationalError('profile_subscription', reason)
        setProfile(null)
        setUser(null)
        setLoading(false)
      },
    )

    return () => {
      unsubscribeProfile?.()
      unsubscribeAuth()
    }
  }, [])

  return (
    <SessionContext.Provider value={{ loading, profile, user }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
