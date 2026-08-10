import { useEffect, useState } from 'react'

import { useSession } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'
import { reportOperationalError } from '@/shared/lib/telemetry'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import { parseRoomStatus, parseRoomVisibility } from '../model/roomAccess'
import type { RoomMemberRole } from '../model/types'
import { redeemRoomInvite } from './roomInvites'

export type RoomMembershipStatus =
  'error' | 'forbidden' | 'idle' | 'joined' | 'joining'

interface RoomMembershipState {
  error: null | string
  joinedNow: boolean
  status: RoomMembershipStatus
}

class RoomMembershipError extends Error {
  constructor(
    message: string,
    readonly reason: 'forbidden' | 'not-found',
  ) {
    super(message)
    this.name = 'RoomMembershipError'
  }
}

async function ensureRoomMembership(roomId: string, inviteId?: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы войти в комнату, авторизуйтесь.')

  if (inviteId) {
    return (await redeemRoomInvite(inviteId, roomId)).joinedNow
  }

  const roomRef = doc(db, 'rooms', roomId)
  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)

  return runTransaction(db, async transaction => {
    const roomSnapshot = await transaction.get(roomRef)
    if (!roomSnapshot.exists()) {
      throw new RoomMembershipError('Комната не найдена.', 'not-found')
    }

    const room = roomSnapshot.data()
    const isOwner = room.ownerId === user.uid
    if (parseRoomStatus(room.status) !== 'active' && !isOwner) {
      throw new RoomMembershipError('Эта комната уже закрыта.', 'forbidden')
    }

    const memberSnapshot = await transaction.get(memberRef)
    if (memberSnapshot.exists()) {
      if (memberSnapshot.data().status === 'active') {
        const member = memberSnapshot.data()
        const membershipPatch: Record<string, boolean | string> = {}
        if (member.isGuest === true && !user.isAnonymous) {
          membershipPatch.isGuest = false
        }
        if (member.userId !== user.uid) {
          membershipPatch.userId = user.uid
        }
        if (Object.keys(membershipPatch).length > 0) {
          transaction.update(memberRef, membershipPatch)
        }
        return false
      }
    }

    if (!isOwner && parseRoomVisibility(room.visibility) === 'private') {
      throw new RoomMembershipError(
        'Для входа в приватную комнату нужно приглашение.',
        'forbidden',
      )
    }

    const role: RoomMemberRole = isOwner ? 'owner' : 'member'
    transaction.set(memberRef, {
      invitedBy: null,
      isGuest: user.isAnonymous,
      joinedAt: serverTimestamp(),
      role,
      status: 'active',
      userId: user.uid,
    })
    return true
  })
}

export function useRoomMembership(
  roomId: string,
  enabled: boolean,
  inviteId?: string,
): RoomMembershipState {
  const { user } = useSession()
  const [state, setState] = useState<RoomMembershipState>({
    error: null,
    joinedNow: false,
    status: 'idle',
  })

  useEffect(() => {
    let disposed = false

    if (!roomId || !enabled) {
      setState({ error: null, joinedNow: false, status: 'idle' })
      return
    }

    setState({ error: null, joinedNow: false, status: 'joining' })
    void ensureRoomMembership(roomId, inviteId)
      .then(joinedNow => {
        if (!disposed) setState({ error: null, joinedNow, status: 'joined' })
      })
      .catch(reason => {
        if (disposed) return

        reportOperationalError('room_membership', reason)
        const forbidden =
          reason instanceof RoomMembershipError ||
          (reason &&
            typeof reason === 'object' &&
            'code' in reason &&
            reason.code === 'permission-denied')
        const message =
          reason instanceof Error
            ? reason.message
            : 'Не удалось присоединиться к комнате. Попробуйте ещё раз.'

        setState({
          error: message,
          joinedNow: false,
          status: forbidden ? 'forbidden' : 'error',
        })
      })

    return () => {
      disposed = true
    }
  }, [enabled, inviteId, roomId, user?.isAnonymous])

  return state
}
