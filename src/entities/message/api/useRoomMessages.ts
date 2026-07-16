import { useEffect, useState } from 'react'

import { db } from '@/shared/api/firebase'
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'

import type { RoomMessage } from '../model/types'

const MESSAGE_LIMIT = 50

export function useRoomMessages(roomId: string) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<null | string>(null)

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

  return { error, loading, messages }
}
