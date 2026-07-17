import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'

import type { Category } from '@/entities/room'
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
}

export async function createRoom({ categories, image, name }: CreateRoomInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы создать комнату, войдите в аккаунт.')

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

    await setDoc(roomRef, {
      categories,
      createdAt: serverTimestamp(),
      imagePath: signedUpload.objectKey,
      imageUrl: signedUpload.publicUrl,
      name,
      ownerId: user.uid,
      updatedAt: serverTimestamp(),
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
