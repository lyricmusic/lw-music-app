import { collection, doc } from 'firebase/firestore'

import {
  DEFAULT_ROOM_VISIBILITY,
  normalizeRoomName,
  ROOM_NAME_MAX_LENGTH,
  type Category,
  type RoomVisibility,
} from '@/entities/room'
import { auth, callRoomManagementApi, db } from '@/shared/api/firebase'
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
  let uploadedObjectKey: null | string = null

  try {
    const signedUpload = await callMediaUploadApi<SignedMediaUpload>(user, {
      action: 'signUpload',
      contentType: image.type,
      fileSize: image.size,
      roomId: roomRef.id,
    })

    await uploadMediaFile(image, signedUpload)
    uploadedObjectKey = signedUpload.objectKey

    await callRoomManagementApi('createRoom', {
      categories,
      imagePath: signedUpload.objectKey,
      imageUrl: signedUpload.publicUrl,
      name: normalizedName,
      roomId: roomRef.id,
      visibility,
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
    if (
      error instanceof Error &&
      error.message === 'Комната с таким названием уже существует.'
    ) {
      throw new RoomNameAlreadyExistsError()
    }
    throw error
  }
}
