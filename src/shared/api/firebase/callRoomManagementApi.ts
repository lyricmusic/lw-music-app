import { getToken } from 'firebase/app-check'

import { appCheck, auth } from './firebase'

const roomManagementApiUrl = import.meta.env.VITE_ROOM_MANAGEMENT_API_URL

export async function callRoomManagementApi<
  TResult = { ok: true },
  TInput extends Record<string, unknown> = Record<string, unknown>,
>(operation: string, input: TInput): Promise<TResult> {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы выполнить это действие, авторизуйтесь.')
  if (!roomManagementApiUrl) {
    throw new Error('Сервер управления комнатой пока не настроен.')
  }

  let response: Response
  try {
    const appCheckToken = appCheck ? await getToken(appCheck) : null
    response = await fetch(roomManagementApiUrl, {
      body: JSON.stringify({ ...input, operation }),
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-Authorization': `Bearer ${await user.getIdToken()}`,
        ...(appCheckToken
          ? { 'X-Firebase-AppCheck': appCheckToken.token }
          : {}),
      },
      method: 'POST',
    })
  } catch {
    throw new Error('Не удалось связаться с сервером управления комнатой.')
  }

  const result = (await response.json().catch(() => null)) as
    | (TResult & {
        error?: string
        errorMessage?: string
        message?: string
      })
    | null
  if (!response.ok) {
    throw new Error(
      result?.message || result?.errorMessage || 'Сервер отклонил действие.',
    )
  }
  if (!result) throw new Error('Сервер вернул некорректный ответ.')
  return result
}
