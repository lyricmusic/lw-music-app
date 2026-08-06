import type { User } from 'firebase/auth'

import { fetchWithAppCheck } from '@/shared/api/firebase'

export interface SignedMediaUpload {
  fields: Record<string, string>
  objectKey: string
  publicUrl: string
  uploadUrl: string
}

interface ApiError {
  message?: string
}

const mediaApiUrl =
  import.meta.env.VITE_MEDIA_UPLOAD_URL ||
  import.meta.env.VITE_ROOM_COVER_UPLOAD_URL

export async function callMediaUploadApi<T>(
  user: User,
  body: Record<string, number | string>,
): Promise<T> {
  if (!mediaApiUrl) {
    throw new Error('Сервис загрузки изображений ещё не настроен.')
  }

  const response = await fetchWithAppCheck(mediaApiUrl, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Token': await user.getIdToken(),
    },
    method: 'POST',
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as ApiError
    throw new Error(error.message || 'Не удалось подготовить загрузку файла.')
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function uploadMediaFile(
  file: File,
  signedUpload: SignedMediaUpload,
) {
  const uploadBody = new FormData()
  Object.entries(signedUpload.fields).forEach(([name, value]) => {
    uploadBody.append(name, value)
  })
  uploadBody.append('file', file)

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
        : 'Не удалось загрузить изображение в Object Storage.',
    )
  }
}
