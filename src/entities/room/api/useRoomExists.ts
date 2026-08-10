import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { doc, onSnapshot } from 'firebase/firestore'

import {
  parseRoomSettings,
  parseRoomStatus,
  parseRoomVisibility,
} from '../model/roomAccess'
import type { RoomAccess } from '../model/types'

interface RoomExistenceState {
  access: null | RoomAccess
  error: null | 'forbidden' | 'unknown'
  exists: boolean | null
  roomId: string
}

export function useRoomExists(roomId: string, retryKey: unknown = null) {
  const [state, setState] = useState<RoomExistenceState>({
    access: null,
    error: null,
    exists: null,
    roomId: '',
  })

  useEffect(() => {
    if (!roomId) return

    setState({ access: null, error: null, exists: null, roomId })

    return onSnapshot(
      doc(db, 'rooms', roomId),
      { includeMetadataChanges: true },
      snapshot => {
        if (!snapshot.exists() && snapshot.metadata.fromCache) return

        if (!snapshot.exists()) {
          setState({ access: null, error: null, exists: false, roomId })
          return
        }

        const room = snapshot.data()
        setState({
          access: {
            settings: parseRoomSettings(room.settings),
            status: parseRoomStatus(room.status),
            visibility: parseRoomVisibility(room.visibility),
          },
          error: null,
          exists: true,
          roomId,
        })
      },
      reason => {
        reportOperationalError('room_metadata_subscription', reason)
        setState({
          access: null,
          error: reason.code === 'permission-denied' ? 'forbidden' : 'unknown',
          exists: null,
          roomId,
        })
      },
    )
  }, [retryKey, roomId])

  return state.roomId === roomId
    ? { access: state.access, error: state.error, exists: state.exists }
    : { access: null, error: null, exists: null }
}
