import { useEffect, useState } from 'react'

import { auth, db } from '@/shared/api/firebase'
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

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

function isInviteUsable(data: Record<string, unknown>) {
  return (
    data.revokedAt == null &&
    data.expiresAt instanceof Timestamp &&
    data.expiresAt.toMillis() > Date.now() &&
    typeof data.maxUses === 'number' &&
    Number.isInteger(data.maxUses) &&
    typeof data.uses === 'number' &&
    Number.isInteger(data.uses) &&
    data.uses < data.maxUses
  )
}

async function joinWithInvite(roomId: string, inviteId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы войти в комнату, авторизуйтесь.')

  const inviteRef = doc(db, 'roomInvites', inviteId)
  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)
  const redemptionRef = doc(db, 'roomInviteRedemptions', user.uid)

  const existingMember = await getDoc(memberRef).catch(() => null)
  if (existingMember?.data()?.status === 'active') return

  try {
    await runTransaction(db, async transaction => {
      const inviteSnapshot = await transaction.get(inviteRef)
      if (!inviteSnapshot.exists()) {
        throw new RoomMembershipError(
          'Приглашение не найдено или уже удалено.',
          'forbidden',
        )
      }

      const invite = inviteSnapshot.data()
      if (invite.roomId !== roomId || !isInviteUsable(invite)) {
        throw new RoomMembershipError(
          'Приглашение недействительно, отозвано или уже истекло.',
          'forbidden',
        )
      }
      if (typeof invite.createdBy !== 'string') {
        throw new RoomMembershipError(
          'Приглашение содержит некорректные данные.',
          'forbidden',
        )
      }

      transaction.update(inviteRef, { uses: invite.uses + 1 })
      transaction.set(redemptionRef, {
        inviteId,
        redeemedAt: serverTimestamp(),
        roomId,
      })
      transaction.set(memberRef, {
        invitedBy: invite.createdBy,
        isGuest: user.isAnonymous,
        joinedAt: serverTimestamp(),
        role: 'member',
        status: 'active',
      })
    })
  } catch (error) {
    // React Strict Mode can start the same redemption twice in development.
    // If one transaction has already succeeded, treat the second one as success.
    const memberSnapshot = await getDoc(memberRef).catch(() => null)
    if (memberSnapshot?.data()?.status === 'active') return
    throw error
  }
}

async function ensureRoomMembership(roomId: string, inviteId?: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы войти в комнату, авторизуйтесь.')

  if (inviteId) {
    await joinWithInvite(roomId, inviteId)
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
      if (memberSnapshot.data().status === 'active') return
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
  inviteId?: string,
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
  }, [enabled, inviteId, roomId])

  return state
}
