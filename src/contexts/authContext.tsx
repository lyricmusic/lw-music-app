import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { auth, db } from '@/firebase.ts'
import { UserProfile } from '@/types/UserProfile'
import { User, onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

interface AuthContextProps {
  loading: boolean
  profile: UserProfile | null
  user: User | null
}

const AuthContext = createContext<AuthContextProps>({
  loading: true,
  profile: null,
  user: null,
})

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribeProfile: undefined | (() => void)

    const unsubscribeAuth = onAuthStateChanged(auth, currentUser => {
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
        () => {
          setProfile(null)
          setLoading(false)
        },
      )
    })

    return () => {
      unsubscribeProfile?.()
      unsubscribeAuth()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ loading, profile, user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
