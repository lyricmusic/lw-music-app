import { auth, db } from '@/shared/api/firebase'
import { FirebaseError } from 'firebase/app'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

interface CreateRoomInviteInput {
  expiresAt: Date
  maxUses?: number
  roomId: string
}

export interface RoomInvitePreview {
  expiresAt: Timestamp
  inviteId: string
  maxUses: number
  participantCount: number
  revokedAt: null | Timestamp
  roomId: string
  roomImageUrl: string
  roomName: string
  uses: number
}

function parseInvitePreview(
  inviteId: string,
  data: Record<string, unknown>,
): RoomInvitePreview | null {
  if (
    !(data.expiresAt instanceof Timestamp) ||
    (data.revokedAt !== null && !(data.revokedAt instanceof Timestamp)) ||
    typeof data.roomId !== 'string' ||
    !data.roomId ||
    typeof data.roomImageUrl !== 'string' ||
    !data.roomImageUrl ||
    typeof data.roomName !== 'string' ||
    !data.roomName ||
    typeof data.participantCount !== 'number' ||
    !Number.isInteger(data.participantCount) ||
    data.participantCount < 0 ||
    typeof data.maxUses !== 'number' ||
    !Number.isInteger(data.maxUses) ||
    typeof data.uses !== 'number' ||
    !Number.isInteger(data.uses)
  ) {
    return null
  }

  return {
    expiresAt: data.expiresAt,
    inviteId,
    maxUses: data.maxUses,
    participantCount: data.participantCount,
    revokedAt: data.revokedAt,
    roomId: data.roomId,
    roomImageUrl: data.roomImageUrl,
    roomName: data.roomName,
    uses: data.uses,
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

export function isRoomInviteAvailable(invite: RoomInvitePreview) {
  return (
    invite.revokedAt === null &&
    invite.expiresAt.toMillis() > Date.now() &&
    invite.uses < invite.maxUses
  )
}

export async function getRoomInvitePreview(inviteToken: string) {
  const normalizedToken = inviteToken.trim()
  if (!normalizedToken) throw new Error('Приглашение не найдено.')

  let snapshot
  try {
    snapshot = await getDoc(doc(db, 'roomInvites', normalizedToken))
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new Error(
        'Не удалось проверить приглашение. Попробуйте обновить страницу позже.',
      )
    }
    throw error
  }
  if (!snapshot.exists()) throw new Error('Приглашение не найдено.')

  const preview = parseInvitePreview(normalizedToken, snapshot.data())
  if (!preview) {
    throw new Error(
      'Это приглашение создано в старом формате. Попросите владельца комнаты прислать новую ссылку.',
    )
  }

  return preview
}

export async function createRoomInvite({
  expiresAt,
  maxUses = 1,
  roomId,
}: CreateRoomInviteInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы создать приглашение, авторизуйтесь.')
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new Error('Количество использований должно быть от 1 до 100.')
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('Срок действия приглашения должен быть в будущем.')
  }

  const roomRef = doc(db, 'rooms', roomId)
  const activeMembersQuery = query(
    collection(db, 'rooms', roomId, 'members'),
    where('status', '==', 'active'),
  )
  const [roomSnapshot, memberCountSnapshot] = await Promise.all([
    getDoc(roomRef),
    getCountFromServer(activeMembersQuery),
  ])
  if (!roomSnapshot.exists()) throw new Error('Комната не найдена.')

  const room = roomSnapshot.data()
  if (
    typeof room.name !== 'string' ||
    !room.name ||
    typeof room.imageUrl !== 'string' ||
    !room.imageUrl
  ) {
    throw new Error('У комнаты нет данных для ссылки-приглашения.')
  }

  const inviteRef = doc(collection(db, 'roomInvites'))
  await setDoc(inviteRef, {
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    expiresAt: Timestamp.fromDate(expiresAt),
    maxUses,
    participantCount: memberCountSnapshot.data().count,
    revokedAt: null,
    roomId,
    roomImageUrl: room.imageUrl,
    roomName: room.name,
    uses: 0,
  })

  return inviteRef.id
}

export async function revokeRoomInvite(inviteId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы отозвать приглашение, авторизуйтесь.')

  await updateDoc(doc(db, 'roomInvites', inviteId), {
    revokedAt: serverTimestamp(),
  })
}

export function getRoomInviteUrl(inviteId: string) {
  return new URL(
    `/join/${encodeURIComponent(inviteId)}`,
    window.location.origin,
  ).toString()
}

export async function redeemRoomInvite(
  inviteToken: string,
  expectedRoomId?: string,
) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы войти в комнату, авторизуйтесь.')

  const normalizedToken = inviteToken.trim()
  if (!normalizedToken) throw new Error('Приглашение не найдено.')

  const inviteRef = doc(db, 'roomInvites', normalizedToken)
  const initialInviteSnapshot = await getDoc(inviteRef)
  if (!initialInviteSnapshot.exists())
    throw new Error('Приглашение не найдено.')

  const initialRoomId = initialInviteSnapshot.data().roomId
  if (
    typeof initialRoomId !== 'string' ||
    !initialRoomId ||
    (expectedRoomId && initialRoomId !== expectedRoomId)
  ) {
    throw new Error('Приглашение ведёт в другую комнату.')
  }

  const memberRef = doc(db, 'rooms', initialRoomId, 'members', user.uid)
  const redemptionRef = doc(db, 'roomInviteRedemptions', user.uid)

  try {
    await runTransaction(db, async transaction => {
      const [inviteSnapshot, memberSnapshot] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(memberRef),
      ])

      if (
        memberSnapshot.exists() &&
        memberSnapshot.data().status === 'active'
      ) {
        if (memberSnapshot.data().isGuest === true && !user.isAnonymous) {
          transaction.update(memberRef, { isGuest: false })
        }
        return
      }

      if (!inviteSnapshot.exists()) throw new Error('Приглашение не найдено.')

      const invite = inviteSnapshot.data()
      if (invite.roomId !== initialRoomId || !isInviteUsable(invite)) {
        throw new Error(
          'Приглашение недействительно, отозвано или уже истекло.',
        )
      }
      if (typeof invite.createdBy !== 'string' || !invite.createdBy) {
        throw new Error('Приглашение содержит некорректные данные.')
      }

      transaction.update(inviteRef, { uses: invite.uses + 1 })
      transaction.set(redemptionRef, {
        inviteId: normalizedToken,
        redeemedAt: serverTimestamp(),
        roomId: initialRoomId,
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
    const memberSnapshot = await getDoc(memberRef).catch(() => null)
    if (memberSnapshot?.data()?.status !== 'active') throw error
  }

  return initialRoomId
}
