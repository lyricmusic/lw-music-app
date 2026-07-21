import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'

import type { RoomMessage } from '../model/types'

const MESSAGE_LIMIT = 50
const MESSAGE_RETENTION_MILLISECONDS = 24 * 60 * 60_000

export function useRoomMessages(roomId: string) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<null | string>(null)
  const [currentTimeMillis, setCurrentTimeMillis] = useState(Date.now)

  useEffect(() => {
    setMessages([])
    setLoading(true)
    setError(null)

    if (!roomId) {
      setLoading(false)
      return
    }

    const messagesQuery = query(
      collection(db, 'rooms', roomId, 'messages'),
      where(
        'createdAt',
        '>=',
        Timestamp.fromMillis(Date.now() - MESSAGE_RETENTION_MILLISECONDS),
      ),
      orderBy('createdAt', 'desc'),
      limit(MESSAGE_LIMIT),
    )

    return onSnapshot(
      messagesQuery,
      snapshot => {
        const nextMessages = snapshot.docs
          .map(messageSnapshot => {
            const data = messageSnapshot.data({ serverTimestamps: 'estimate' })

            return {
              authorId: typeof data.authorId === 'string' ? data.authorId : '',
              authorName:
                typeof data.authorName === 'string'
                  ? data.authorName
                  : 'Пользователь',
              authorPhotoURL:
                typeof data.authorPhotoURL === 'string'
                  ? data.authorPhotoURL
                  : null,
              createdAt:
                data.createdAt instanceof Timestamp ? data.createdAt : null,
              id: messageSnapshot.id,
              pending: messageSnapshot.metadata.hasPendingWrites,
              text: typeof data.text === 'string' ? data.text : '',
            } satisfies RoomMessage
          })
          .filter(message => message.authorId && message.text)
          .reverse()

        setMessages(nextMessages)
        setCurrentTimeMillis(Date.now())
        setError(null)
        setLoading(false)
      },
      reason => {
        console.error('Не удалось загрузить сообщения комнаты:', reason)
        setError(
          'Не удалось загрузить сообщения. Проверьте правила доступа Firestore.',
        )
        setLoading(false)
      },
    )
  }, [roomId])

  useEffect(() => {
    const nextExpirationMillis = messages.reduce((nearest, message) => {
      if (!message.createdAt) return nearest

      const expirationMillis =
        message.createdAt.toMillis() + MESSAGE_RETENTION_MILLISECONDS
      if (expirationMillis <= currentTimeMillis) return nearest
      return Math.min(nearest, expirationMillis)
    }, Number.POSITIVE_INFINITY)

    if (!Number.isFinite(nextExpirationMillis)) return

    const timeoutId = window.setTimeout(
      () => setCurrentTimeMillis(Date.now()),
      Math.max(0, nextExpirationMillis - Date.now()) + 50,
    )

    return () => window.clearTimeout(timeoutId)
  }, [currentTimeMillis, messages])

  const visibleMessages = messages.filter(
    message =>
      !message.createdAt ||
      message.createdAt.toMillis() + MESSAGE_RETENTION_MILLISECONDS >
        currentTimeMillis,
  )

  return { error, loading, messages: visibleMessages }
}
