import { auth, callRoomManagementApi, db } from '@/shared/api/firebase'
import { FirebaseError } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  type Unsubscribe,
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

export interface RoomInviteListItem extends RoomInvitePreview {
  createdAt: Timestamp
  createdBy: string
  tokenHash: string
}

interface InviteSecret {
  roomId: string
  token: string
  tokenHash: string
}

const roomInviteApiUrl = import.meta.env.VITE_ROOM_INVITE_API_URL
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/

function parseInvitePreview(
  inviteToken: string,
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
    inviteId: inviteToken,
    maxUses: data.maxUses,
    participantCount: data.participantCount,
    revokedAt: data.revokedAt,
    roomId: data.roomId,
    roomImageUrl: data.roomImageUrl,
    roomName: data.roomName,
    uses: data.uses,
  }
}

function parseInviteListItem(
  token: string,
  tokenHash: string,
  data: Record<string, unknown>,
): RoomInviteListItem | null {
  const preview = parseInvitePreview(token, data)
  if (
    !preview ||
    !(data.createdAt instanceof Timestamp) ||
    typeof data.createdBy !== 'string' ||
    !data.createdBy ||
    data.tokenHash !== tokenHash
  ) {
    return null
  }

  return {
    ...preview,
    createdAt: data.createdAt,
    createdBy: data.createdBy,
    tokenHash,
  }
}

function parseInviteSecret(data: Record<string, unknown>) {
  if (
    typeof data.roomId !== 'string' ||
    !data.roomId ||
    typeof data.token !== 'string' ||
    !TOKEN_PATTERN.test(data.token) ||
    typeof data.tokenHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.tokenHash)
  ) {
    return null
  }

  return {
    roomId: data.roomId,
    token: data.token,
    tokenHash: data.tokenHash,
  } satisfies InviteSecret
}

export async function hashRoomInviteToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
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
  if (!TOKEN_PATTERN.test(normalizedToken)) {
    throw new Error('Приглашение не найдено.')
  }

  const tokenHash = await hashRoomInviteToken(normalizedToken)
  let snapshot
  try {
    snapshot = await getDoc(doc(db, 'roomInvites', tokenHash))
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
  if (!preview || snapshot.data().tokenHash !== tokenHash) {
    throw new Error('Приглашение содержит некорректные данные.')
  }

  return preview
}

export async function createRoomInvite({
  expiresAt,
  maxUses = 1,
  roomId,
}: CreateRoomInviteInput) {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Чтобы создать приглашение, авторизуйтесь.')
  }
  if (user.isAnonymous) {
    throw new Error('Гостевой аккаунт не может создавать приглашения.')
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new Error('Количество использований должно быть от 1 до 100.')
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('Срок действия приглашения должен быть в будущем.')
  }

  const result = await callRoomManagementApi<{ ok: true; token: string }>(
    'createRoomInvite',
    {
      expiresAtMillis: expiresAt.getTime(),
      maxUses,
      roomId,
    },
  )
  return result.token
}

export function subscribeRoomInvites(
  roomId: string,
  onChange: (invites: RoomInviteListItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const inviteData = new Map<string, Record<string, unknown>>()
  const secrets = new Map<string, InviteSecret>()
  let invitesLoaded = false
  let secretsLoaded = false

  const emit = () => {
    if (!invitesLoaded || !secretsLoaded) return

    const invites = Array.from(secrets.entries())
      .map(([tokenHash, secret]) => {
        const data = inviteData.get(tokenHash)
        return data ? parseInviteListItem(secret.token, tokenHash, data) : null
      })
      .filter((invite): invite is RoomInviteListItem => invite !== null)
      .sort(
        (left, right) => right.createdAt.toMillis() - left.createdAt.toMillis(),
      )
    onChange(invites)
  }

  const inviteQuery = query(
    collection(db, 'roomInvites'),
    where('roomId', '==', roomId),
  )
  const secretQuery = query(
    collection(db, 'roomInviteSecrets'),
    where('roomId', '==', roomId),
  )

  const unsubscribeInvites = onSnapshot(
    inviteQuery,
    snapshot => {
      inviteData.clear()
      snapshot.forEach(invite => inviteData.set(invite.id, invite.data()))
      invitesLoaded = true
      emit()
    },
    reason => onError(reason),
  )
  const unsubscribeSecrets = onSnapshot(
    secretQuery,
    snapshot => {
      secrets.clear()
      snapshot.forEach(secretSnapshot => {
        const secret = parseInviteSecret(secretSnapshot.data())
        if (secret && secret.tokenHash === secretSnapshot.id) {
          secrets.set(secretSnapshot.id, secret)
        }
      })
      secretsLoaded = true
      emit()
    },
    reason => onError(reason),
  )

  return () => {
    unsubscribeInvites()
    unsubscribeSecrets()
  }
}

export async function revokeRoomInvite(tokenHash: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы отозвать приглашение, авторизуйтесь.')

  await callRoomManagementApi('revokeRoomInvite', { tokenHash })
}

export function getRoomInviteUrl(inviteToken: string) {
  return new URL(
    `/join/${encodeURIComponent(inviteToken)}`,
    window.location.origin,
  ).toString()
}

const redeemErrorMessages: Record<string, string> = {
  banned: 'Владелец комнаты запретил вам вход.',
  'invite-not-found': 'Приглашение не найдено.',
  'invite-unavailable':
    'Приглашение недействительно, отозвано, исчерпано или уже истекло.',
  'room-not-found': 'Комната не найдена.',
  'wrong-room': 'Приглашение ведёт в другую комнату.',
}

export async function redeemRoomInvite(
  inviteToken: string,
  expectedRoomId?: string,
) {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Чтобы войти в комнату, авторизуйтесь.')
  }
  if (!roomInviteApiUrl) {
    throw new Error('Сервер приглашений пока не настроен.')
  }

  const normalizedToken = inviteToken.trim()
  if (!TOKEN_PATTERN.test(normalizedToken)) {
    throw new Error('Приглашение не найдено.')
  }

  let response: Response
  try {
    response = await fetch(roomInviteApiUrl, {
      body: JSON.stringify({
        expectedRoomId: expectedRoomId?.trim() || undefined,
        token: normalizedToken,
      }),
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  } catch {
    throw new Error('Не удалось связаться с сервером приглашений.')
  }

  const result = (await response.json().catch(() => null)) as {
    error?: string
    roomId?: string
  } | null
  if (!response.ok) {
    throw new Error(
      (result?.error && redeemErrorMessages[result.error]) ||
        'Не удалось активировать приглашение.',
    )
  }
  if (!result?.roomId || (expectedRoomId && result.roomId !== expectedRoomId)) {
    throw new Error('Сервер приглашений вернул некорректный ответ.')
  }

  return result.roomId
}
