import { useEffect, useState } from 'react'

import { auth, realtimeDb } from '@/shared/api/firebase'
import {
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  set,
} from 'firebase/database'

export const ROOM_REACTION_OPTIONS = ['🔥', '💜', '👏', '✨'] as const
export type RoomReactionEmoji = (typeof ROOM_REACTION_OPTIONS)[number]

interface StoredRoomReaction {
  emoji: RoomReactionEmoji
  expiresAt: number
}

const REACTION_DURATION_MILLISECONDS = 6_000
const reactionExpirationTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>()

function isRoomReactionEmoji(value: unknown): value is RoomReactionEmoji {
  return ROOM_REACTION_OPTIONS.some(reaction => reaction === value)
}

function parseRoomReactions(value: unknown, now: number) {
  const reactions = new Map<string, RoomReactionEmoji>()
  let nearestExpiration: number | null = null

  if (!value || typeof value !== 'object') {
    return { nearestExpiration, reactions }
  }

  Object.entries(value).forEach(([participantId, candidate]) => {
    if (!candidate || typeof candidate !== 'object') return

    const { emoji, expiresAt } = candidate as Partial<StoredRoomReaction>
    if (
      !isRoomReactionEmoji(emoji) ||
      typeof expiresAt !== 'number' ||
      expiresAt <= now
    ) {
      return
    }

    reactions.set(participantId, emoji)
    nearestExpiration = Math.min(nearestExpiration ?? expiresAt, expiresAt)
  })

  return { nearestExpiration, reactions }
}

export function useRoomReactions(roomId: string) {
  const [reactions, setReactions] = useState<Map<string, RoomReactionEmoji>>(
    new Map(),
  )

  useEffect(() => {
    setReactions(new Map())
    if (!roomId) return

    let expirationTimer: ReturnType<typeof setTimeout> | undefined
    let snapshotValue: unknown = null

    const publishReactions = () => {
      if (expirationTimer) clearTimeout(expirationTimer)

      const { nearestExpiration, reactions: nextReactions } =
        parseRoomReactions(snapshotValue, Date.now())
      setReactions(nextReactions)

      if (nearestExpiration !== null) {
        expirationTimer = setTimeout(
          publishReactions,
          Math.max(50, nearestExpiration - Date.now() + 50),
        )
      }
    }

    const unsubscribe = onValue(
      ref(realtimeDb, `roomReactions/${roomId}`),
      snapshot => {
        snapshotValue = snapshot.val() as unknown
        publishReactions()
      },
      reason => {
        console.error('Не удалось загрузить реакции комнаты:', reason)
        snapshotValue = null
        publishReactions()
      },
    )

    return () => {
      unsubscribe()
      if (expirationTimer) clearTimeout(expirationTimer)
    }
  }, [roomId])

  return reactions
}

export async function sendRoomReaction(
  roomId: string,
  emoji: RoomReactionEmoji,
) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы отправить реакцию, авторизуйтесь.')
  if (!roomId) throw new Error('Комната не найдена.')
  if (!isRoomReactionEmoji(emoji)) throw new Error('Неизвестная реакция.')

  const reactionRef = ref(realtimeDb, `roomReactions/${roomId}/${user.uid}`)
  const expiresAt = Date.now() + REACTION_DURATION_MILLISECONDS
  const timerKey = `${roomId}/${user.uid}`

  await onDisconnect(reactionRef).remove()
  await set(reactionRef, { emoji, expiresAt } satisfies StoredRoomReaction)

  const previousTimer = reactionExpirationTimers.get(timerKey)
  if (previousTimer) clearTimeout(previousTimer)

  reactionExpirationTimers.set(
    timerKey,
    setTimeout(() => {
      reactionExpirationTimers.delete(timerKey)
      void runTransaction(
        reactionRef,
        currentValue =>
          currentValue?.expiresAt === expiresAt ? null : currentValue,
        { applyLocally: false },
      ).catch(reason => {
        console.error('Не удалось удалить завершившуюся реакцию:', reason)
      })
    }, REACTION_DURATION_MILLISECONDS + 100),
  )
}
