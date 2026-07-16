import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

import { auth, db } from '@/shared/api/firebase'

interface SendRoomMessageInput {
  authorName: string
  authorPhotoURL: null | string
  roomId: string
  text: string
}

export const ROOM_MESSAGE_MAX_LENGTH = 1000

export async function sendRoomMessage({
  authorName,
  authorPhotoURL,
  roomId,
  text,
}: SendRoomMessageInput) {
  const user = auth.currentUser
  const normalizedText = text.trim()

  if (!user) throw new Error('Чтобы отправить сообщение, войдите в аккаунт.')
  if (!roomId) throw new Error('Комната не найдена.')
  if (!normalizedText) return
  if (normalizedText.length > ROOM_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Сообщение не может быть длиннее ${ROOM_MESSAGE_MAX_LENGTH} символов.`,
    )
  }

  await addDoc(collection(db, 'rooms', roomId, 'messages'), {
    authorId: user.uid,
    authorName,
    authorPhotoURL,
    createdAt: serverTimestamp(),
    text: normalizedText,
  })
}
