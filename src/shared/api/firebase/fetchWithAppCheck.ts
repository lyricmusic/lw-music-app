import { getToken } from 'firebase/app-check'

import { appCheck } from './firebase'

const APP_CHECK_ERROR_CODES = new Set([
  'app-check-invalid',
  'app-check-required',
])

let tokenWarningWasLogged = false

async function getAppCheckToken(forceRefresh: boolean) {
  if (!appCheck) return null

  try {
    return (await getToken(appCheck, forceRefresh)).token
  } catch (error) {
    if (!tokenWarningWasLogged) {
      tokenWarningWasLogged = true
      console.warn('Firebase App Check token is unavailable.', error)
    }
    return null
  }
}

async function isAppCheckRejection(response: Response) {
  if (response.status !== 401) return false

  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: string } | null
  return Boolean(body?.error && APP_CHECK_ERROR_CODES.has(body.error))
}

function withAppCheckHeader(init: RequestInit, token: string | null) {
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Firebase-AppCheck', token)
  return { ...init, headers }
}

export async function fetchWithAppCheck(
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const response = await fetch(
    input,
    withAppCheckHeader(init, await getAppCheckToken(false)),
  )
  if (!appCheck || !(await isAppCheckRejection(response))) return response

  const refreshedToken = await getAppCheckToken(true)
  if (!refreshedToken) return response
  return fetch(input, withAppCheckHeader(init, refreshedToken))
}
