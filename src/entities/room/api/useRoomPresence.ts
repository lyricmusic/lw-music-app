import { useEffect } from 'react'

import { auth } from '@/shared/api/firebase'
import { realtimeDb } from '@/shared/api/firebase/firebaseRealtime'
import { reportOperationalError } from '@/shared/lib/telemetry'
import {
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database'

export function useRoomPresence(roomId: string) {
  useEffect(() => {
    const user = auth.currentUser
    if (!roomId || !user) return

    let connectionRef: ReturnType<typeof push> | null = null
    let disposed = false
    const connectedRef = ref(realtimeDb, '.info/connected')

    const unsubscribe = onValue(connectedRef, snapshot => {
      if (snapshot.val() !== true) {
        connectionRef = null
        return
      }
      if (disposed || connectionRef) return

      const nextConnectionRef = push(
        ref(realtimeDb, `roomPresence/${roomId}/${user.uid}`),
      )
      connectionRef = nextConnectionRef

      void onDisconnect(nextConnectionRef)
        .remove()
        .then(() => {
          if (disposed) return remove(nextConnectionRef)
          return set(nextConnectionRef, serverTimestamp())
        })
        .catch(reason => {
          if (connectionRef === nextConnectionRef) connectionRef = null
          reportOperationalError('room_presence', reason)
        })
    })

    return () => {
      disposed = true
      unsubscribe()
      if (connectionRef) void remove(connectionRef)
    }
  }, [roomId])
}
