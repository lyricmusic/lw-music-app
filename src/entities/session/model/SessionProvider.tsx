import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { auth } from '@/shared/api/firebase/firebaseAuth'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { User, onAuthStateChanged } from 'firebase/auth'

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
    let active = true
    let profileLoadVersion = 0
    let unsubscribeProfile: undefined | (() => void)

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      currentUser => {
        const loadVersion = ++profileLoadVersion
        unsubscribeProfile?.()
        unsubscribeProfile = undefined
        setUser(currentUser)

        if (!currentUser) {
          setProfile(null)
          setLoading(false)
          return
        }

        setLoading(true)
        void import('./subscribeUserProfile')
          .then(({ subscribeUserProfile }) => {
            if (!active || loadVersion !== profileLoadVersion) return

            unsubscribeProfile = subscribeUserProfile(
              currentUser,
              nextProfile => {
                if (!active || loadVersion !== profileLoadVersion) return
                setProfile(nextProfile)
                setLoading(false)
              },
              reason => {
                if (!active || loadVersion !== profileLoadVersion) return
                reportOperationalError('profile_subscription', reason)
                setProfile(null)
                setLoading(false)
              },
            )
          })
          .catch(reason => {
            if (!active || loadVersion !== profileLoadVersion) return
            reportOperationalError('profile_subscription', reason)
            setProfile(null)
            setLoading(false)
          })
      },
      reason => {
        reportOperationalError('profile_subscription', reason)
        setProfile(null)
        setUser(null)
        setLoading(false)
      },
    )

    return () => {
      active = false
      profileLoadVersion += 1
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
