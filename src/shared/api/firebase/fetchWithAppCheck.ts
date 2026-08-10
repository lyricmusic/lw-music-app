import { getToken } from 'firebase/app-check'

import { reportOperationalError } from '@/shared/lib/telemetry'

import { appCheck } from './firebase'

const APP_CHECK_ERROR_CODES = new Set([
  'app-check-invalid',
  'app-check-required',
])

let tokenWarningWasLogged = false
const responseRequestIds = new WeakMap<Response, string>()

export class CorrelatedRequestError extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'CorrelatedRequestError'
  }
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function withRequestId(init: RequestInit) {
  const headers = new Headers(init.headers)
  const requestId = headers.get('X-Request-ID') || createRequestId()
  headers.set('X-Request-ID', requestId)
  return { init: { ...init, headers }, requestId }
}

function rememberRequestId(response: Response, requestId: string) {
  responseRequestIds.set(response, requestId)
  return response
}

async function fetchForRequest(
  input: RequestInfo | URL,
  init: RequestInit,
  requestId: string,
) {
  try {
    return rememberRequestId(await fetch(input, init), requestId)
  } catch {
    throw new CorrelatedRequestError('Network request failed.', requestId)
  }
}

export function getResponseRequestId(response: Response) {
  const responseRequestId = response.headers.get('X-Request-ID')?.trim()
  return responseRequestId || responseRequestIds.get(response)
}

async function getAppCheckToken(forceRefresh: boolean) {
  if (!appCheck) return null

  try {
    return (await getToken(appCheck, forceRefresh)).token
  } catch (error) {
    if (!tokenWarningWasLogged) {
      tokenWarningWasLogged = true
      reportOperationalError('app_check', error)
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
  const request = withRequestId(init)
  const response = await fetchForRequest(
    input,
    withAppCheckHeader(request.init, await getAppCheckToken(false)),
    request.requestId,
  )
  if (!appCheck || !(await isAppCheckRejection(response))) return response

  const refreshedToken = await getAppCheckToken(true)
  if (!refreshedToken) return response
  return fetchForRequest(
    input,
    withAppCheckHeader(request.init, refreshedToken),
    request.requestId,
  )
}
