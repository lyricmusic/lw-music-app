import type { User } from 'firebase/auth'
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'

import type { Category } from '@/entities/room'
import { auth, db } from '@/shared/api/firebase'

interface CreateRoomInput {
  categories: Category[]
  image: File
  name: string
}

interface SignedUpload {
  fields: Record<string, string>
  objectKey: string
  publicUrl: string
  uploadUrl: string
}

interface ApiError {
  message?: string
}

const coverApiUrl = import.meta.env.VITE_ROOM_COVER_UPLOAD_URL

async function callCoverApi<T>(
  user: User,
  body: Record<string, number | string>,
): Promise<T> {
  if (!coverApiUrl) {
    throw new Error('Сервис загрузки обложек ещё не настроен.')
  }

  const response = await fetch(coverApiUrl, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Token': await user.getIdToken(),
    },
    method: 'POST',
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as ApiError
    throw new Error(error.message || 'Не удалось подготовить загрузку обложки.')
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function uploadCover(image: File, signedUpload: SignedUpload) {
  const uploadBody = new FormData()
  Object.entries(signedUpload.fields).forEach(([name, value]) => {
    uploadBody.append(name, value)
  })
  uploadBody.append('file', image)

  const response = await fetch(signedUpload.uploadUrl, {
    body: uploadBody,
    method: 'POST',
  })
  if (!response.ok) {
    const responseBody = await response.text()
    const storageErrorCode = responseBody.match(/<Code>([^<]+)<\/Code>/)?.[1]
    throw new Error(
      storageErrorCode
        ? `Object Storage отклонил загрузку (${storageErrorCode}).`
        : 'Не удалось загрузить обложку в Object Storage.',
    )
  }
}

export async function createRoom({ categories, image, name }: CreateRoomInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы создать комнату, войдите в аккаунт.')

  const roomRef = doc(collection(db, 'rooms'))
  let uploadedObjectKey: null | string = null

  try {
    const signedUpload = await callCoverApi<SignedUpload>(user, {
      action: 'signUpload',
      contentType: image.type,
      fileSize: image.size,
      roomId: roomRef.id,
    })

    await uploadCover(image, signedUpload)
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
        await callCoverApi(user, {
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
