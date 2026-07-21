import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'

import type { UserCharacter } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'

const AVAILABLE_APPEARANCE_IDS = new Set(['base'])
const AVAILABLE_ACCENT_IDS = new Set(['violet', 'cyan', 'pink', 'lime'])
const AVAILABLE_DANCE_IDS = new Set(['side-step'])

export async function updateUserCharacter(character: UserCharacter) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы сохранить персонажа, войдите в аккаунт.')

  if (
    !AVAILABLE_APPEARANCE_IDS.has(character.appearanceId) ||
    !AVAILABLE_ACCENT_IDS.has(character.accentColor) ||
    !AVAILABLE_DANCE_IDS.has(character.danceId)
  ) {
    throw new Error('Выбранный вариант персонажа пока недоступен.')
  }

  await updateDoc(doc(db, 'users', user.uid), {
    character,
    updatedAt: serverTimestamp(),
  })
}
