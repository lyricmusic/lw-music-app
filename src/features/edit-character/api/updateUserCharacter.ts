import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'

import type { UserCharacter } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'

const AVAILABLE_APPEARANCE_IDS = new Set(['base', 'neon'])
const AVAILABLE_ACCENT_IDS = new Set(['violet', 'cyan', 'pink', 'lime'])
const AVAILABLE_DANCE_IDS = new Set(['side-step'])
const AVAILABLE_GENDER_IDS = new Set(['male', 'female'])

export async function updateUserCharacter(character: UserCharacter) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы сохранить персонажа, войдите в аккаунт.')

  if (
    !AVAILABLE_APPEARANCE_IDS.has(character.appearanceId) ||
    !AVAILABLE_ACCENT_IDS.has(character.accentColor) ||
    !AVAILABLE_DANCE_IDS.has(character.danceId) ||
    !AVAILABLE_GENDER_IDS.has(character.genderId)
  ) {
    throw new Error('Выбранный вариант персонажа пока недоступен.')
  }

  const privateProfileRef = doc(db, 'users', user.uid)
  const privateProfileSnapshot = await getDoc(privateProfileRef)
  if (!privateProfileSnapshot.exists()) {
    throw new Error('Профиль пользователя не найден.')
  }

  const privateProfile = privateProfileSnapshot.data()
  const updatedAt = serverTimestamp()
  const batch = writeBatch(db)
  batch.update(privateProfileRef, {
    character,
    updatedAt,
  })
  batch.set(doc(db, 'userProfiles', user.uid), {
    avatar: privateProfile.avatar,
    character,
    createdAt: privateProfile.createdAt,
    displayName: privateProfile.displayName,
    photoURL: privateProfile.photoURL ?? null,
    updatedAt,
  })
  await batch.commit()
}
