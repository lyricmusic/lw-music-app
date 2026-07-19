import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'

import {
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_ROOM_STATUS,
  DEFAULT_ROOM_VISIBILITY,
  getRoomNameKey,
  normalizeRoomName,
  ROOM_NAME_MAX_LENGTH,
  type Category,
  type RoomVisibility,
} from '@/entities/room'
import { auth, db } from '@/shared/api/firebase'
import {
  callMediaUploadApi,
  uploadMediaFile,
  type SignedMediaUpload,
} from '@/shared/api/media-upload'

interface CreateRoomInput {
  categories: Category[]
  image: File
  name: string
  visibility?: RoomVisibility
}

export class RoomNameAlreadyExistsError extends Error {
  constructor() {
    super('Комната с таким названием уже существует.')
    this.name = 'RoomNameAlreadyExistsError'
  }
}

export async function createRoom({
  categories,
  image,
  name,
  visibility = DEFAULT_ROOM_VISIBILITY,
}: CreateRoomInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы создать комнату, войдите в аккаунт.')
  if (user.isAnonymous) {
    throw new Error(
      'Сначала сохраните гостевой профиль, чтобы создать комнату.',
    )
  }

  const normalizedName = normalizeRoomName(name)
  if (!normalizedName) throw new Error('Введите название комнаты.')
  if (normalizedName.length > ROOM_NAME_MAX_LENGTH) {
    throw new Error(
      `Название не может быть длиннее ${ROOM_NAME_MAX_LENGTH} символов.`,
    )
  }

  const roomRef = doc(collection(db, 'rooms'))
  const ownerMemberRef = doc(db, 'rooms', roomRef.id, 'members', user.uid)
  const nameKey = getRoomNameKey(normalizedName)
  const roomNameRef = doc(db, 'roomNames', nameKey)
  let uploadedObjectKey: null | string = null

  try {
    const roomNameSnapshot = await getDoc(roomNameRef)
    if (roomNameSnapshot.exists()) {
      throw new RoomNameAlreadyExistsError()
    }

    const signedUpload = await callMediaUploadApi<SignedMediaUpload>(user, {
      action: 'signUpload',
      contentType: image.type,
      fileSize: image.size,
      roomId: roomRef.id,
    })

    await uploadMediaFile(image, signedUpload)
    uploadedObjectKey = signedUpload.objectKey

    await runTransaction(db, async transaction => {
      const reservedRoomNameSnapshot = await transaction.get(roomNameRef)
      if (reservedRoomNameSnapshot.exists()) {
        throw new RoomNameAlreadyExistsError()
      }

      transaction.set(roomNameRef, {
        createdAt: serverTimestamp(),
        name: normalizedName,
        ownerId: user.uid,
        roomId: roomRef.id,
      })
      transaction.set(roomRef, {
        categories,
        createdAt: serverTimestamp(),
        imagePath: signedUpload.objectKey,
        imageUrl: signedUpload.publicUrl,
        name: normalizedName,
        nameKey,
        ownerId: user.uid,
        settings: DEFAULT_ROOM_SETTINGS,
        status: DEFAULT_ROOM_STATUS,
        updatedAt: serverTimestamp(),
        visibility,
      })
      transaction.set(ownerMemberRef, {
        invitedBy: null,
        isGuest: user.isAnonymous,
        joinedAt: serverTimestamp(),
        role: 'owner',
        status: 'active',
      })
    })

    return roomRef.id
  } catch (error) {
    if (uploadedObjectKey) {
      try {
        await callMediaUploadApi(user, {
          action: 'deleteUpload',
          objectKey: uploadedObjectKey,
        })
      } catch (cleanupError) {
        console.error(
          'Не удалось удалить незакреплённую обложку:',
          cleanupError,
        )
      }
    }
    throw error
  }
}
