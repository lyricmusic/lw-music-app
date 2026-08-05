import { useEffect, useState } from 'react'

import { useSession } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import { parseRoomStatus, parseRoomVisibility } from '../model/roomAccess'
import type { RoomMemberRole } from '../model/types'
import { redeemRoomInvite } from './roomInvites'

export type RoomMembershipStatus =
  'error' | 'forbidden' | 'idle' | 'joined' | 'joining'

interface RoomMembershipState {
  error: null | string
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
    await redeemRoomInvite(inviteId, roomId)
    return
  }

  const roomRef = doc(db, 'rooms', roomId)
  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)

  await runTransaction(db, async transaction => {
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
        return
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
    status: 'idle',
  })

  useEffect(() => {
    let disposed = false

    if (!roomId || !enabled) {
      setState({ error: null, status: 'idle' })
      return
    }

    setState({ error: null, status: 'joining' })
    void ensureRoomMembership(roomId, inviteId)
      .then(() => {
        if (!disposed) setState({ error: null, status: 'joined' })
      })
      .catch(reason => {
        if (disposed) return

        console.error('Не удалось присоединиться к комнате:', reason)
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
          status: forbidden ? 'forbidden' : 'error',
        })
      })

    return () => {
      disposed = true
    }
  }, [enabled, inviteId, roomId, user?.isAnonymous])

  return state
}
