import { useEffect, useState } from 'react'

import { auth, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import { parseRoomStatus, parseRoomVisibility } from '../model/roomAccess'
import type { RoomMemberRole } from '../model/types'

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

async function ensureRoomMembership(roomId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы войти в комнату, авторизуйтесь.')

  const roomRef = doc(db, 'rooms', roomId)
  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)

  await runTransaction(db, async transaction => {
    const roomSnapshot = await transaction.get(roomRef)
    if (!roomSnapshot.exists()) {
      throw new RoomMembershipError('Комната не найдена.', 'not-found')
    }

    const room = roomSnapshot.data()
    const isOwner = room.ownerId === user.uid
    if (parseRoomStatus(room.status) !== 'active') {
      throw new RoomMembershipError('Эта комната уже закрыта.', 'forbidden')
    }

    const memberSnapshot = await transaction.get(memberRef)
    if (memberSnapshot.exists()) {
      if (memberSnapshot.data().status === 'active') return

      throw new RoomMembershipError(
        'Вы больше не состоите в этой комнате.',
        'forbidden',
      )
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
    })
  })
}

export function useRoomMembership(
  roomId: string,
  enabled: boolean,
): RoomMembershipState {
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
    void ensureRoomMembership(roomId)
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
  }, [enabled, roomId])

  return state
}
