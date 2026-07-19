import { httpsCallable } from 'firebase/functions'

import { firebaseFunctions } from './firebase'

export async function callFirebaseFunction<
  TResult = { ok: true },
  TInput = Record<string, unknown>,
>(name: string, input: TInput): Promise<TResult> {
  try {
    const callable = httpsCallable<TInput, TResult>(firebaseFunctions, name)
    const response = await callable(input)
    return response.data
  } catch (reason) {
    if (reason instanceof Error) {
      const message = reason.message
        .replace(/^Firebase:\s*/u, '')
        .replace(/\s*\(functions\/[\w-]+\)\.?$/u, '')
        .trim()
      throw new Error(message || 'Сервер отклонил действие.')
    }
    throw new Error('Сервер отклонил действие.')
  }
}
