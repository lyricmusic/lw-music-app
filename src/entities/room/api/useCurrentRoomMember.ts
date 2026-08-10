import { useEffect, useState } from 'react'

import { useSession } from '@/entities/session'
import { db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { doc, onSnapshot } from 'firebase/firestore'

import type { RoomMemberRole, RoomMemberStatus } from '../model/types'

export interface CurrentRoomMember {
  isGuest: boolean
  role: RoomMemberRole
  status: RoomMemberStatus
}

const ROOM_MEMBER_ROLES: RoomMemberRole[] = [
  'host',
  'member',
  'moderator',
  'owner',
]

export function useCurrentRoomMember(roomId: string) {
  const { user } = useSession()
  const [member, setMember] = useState<CurrentRoomMember | null>(null)

  useEffect(() => {
    if (!roomId || !user) {
      setMember(null)
      return
    }

    return onSnapshot(
      doc(db, 'rooms', roomId, 'members', user.uid),
      snapshot => {
        const data = snapshot.data()
        const role = data?.role
        const status = data?.status
        setMember(
          ROOM_MEMBER_ROLES.includes(role) &&
            (status === 'active' || status === 'left')
            ? { isGuest: data?.isGuest === true, role, status }
            : null,
        )
      },
      reason => {
        reportOperationalError('room_metadata_subscription', reason)
        setMember(null)
      },
    )
  }, [roomId, user])

  return member
}
