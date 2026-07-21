import { updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

import { resolveUserCharacter } from '@/entities/session'
import { auth, db } from '@/shared/api/firebase'
import {
  callMediaUploadApi,
  uploadMediaFile,
  type SignedMediaUpload,
} from '@/shared/api/media-upload'

import { getPresetAvatar, type PresetAvatarId } from '../model/presetAvatars'

interface CompleteProfileInput {
  avatarFile: File | null
  displayName: string
  presetAvatarId: null | PresetAvatarId
}

export async function completeProfile({
  avatarFile,
  displayName,
  presetAvatarId,
}: CompleteProfileInput) {
  const user = auth.currentUser
  const normalizedDisplayName = displayName.trim()

  if (!user) throw new Error('Чтобы сохранить профиль, войдите в аккаунт.')
  if (!normalizedDisplayName) throw new Error('Введите никнейм.')
  if (normalizedDisplayName.length > 50) {
    throw new Error('Никнейм не может быть длиннее 50 символов.')
  }
  if (!avatarFile && !presetAvatarId) throw new Error('Выберите аватар.')

  let avatarPath: null | string = null
  let avatarType: 'custom' | 'preset'
  let photoURL: string
  let uploadedObjectKey: null | string = null

  if (avatarFile) {
    const signedUpload = await callMediaUploadApi<SignedMediaUpload>(user, {
      action: 'signAvatarUpload',
      contentType: avatarFile.type,
      fileSize: avatarFile.size,
    })
    await uploadMediaFile(avatarFile, signedUpload)
    uploadedObjectKey = signedUpload.objectKey
    avatarPath = signedUpload.objectKey
    avatarType = 'custom'
    photoURL = signedUpload.publicUrl
  } else {
    const presetAvatar = getPresetAvatar(presetAvatarId!)
    if (!presetAvatar) throw new Error('Выбранный аватар не найден.')
    avatarType = 'preset'
    photoURL = presetAvatar.url
  }

  try {
    const profileRef = doc(db, 'users', user.uid)
    const profileSnapshot = await getDoc(profileRef)

    await setDoc(profileRef, {
      avatar: {
        presetId: presetAvatarId,
        storagePath: avatarPath,
        type: avatarType,
      },
      character: resolveUserCharacter(profileSnapshot.data()?.character),
      createdAt: profileSnapshot.data()?.createdAt ?? serverTimestamp(),
      displayName: normalizedDisplayName,
      email: user.email ?? '',
      onboardingCompleted: true,
      photoURL,
      updatedAt: serverTimestamp(),
    })
    try {
      await updateProfile(user, {
        displayName: normalizedDisplayName,
        photoURL,
      })
    } catch (authProfileError) {
      // Firestore is the profile source for the app. A later sign-in will
      // synchronize these fields back to Firebase Auth.
      console.error(
        'Не удалось синхронизировать профиль с Firebase Auth:',
        authProfileError,
      )
    }
  } catch (error) {
    if (uploadedObjectKey) {
      try {
        await callMediaUploadApi(user, {
          action: 'deleteAvatarUpload',
          objectKey: uploadedObjectKey,
        })
      } catch (cleanupError) {
        console.error('Не удалось удалить незакреплённый аватар:', cleanupError)
      }
    }
    throw error
  }
}
