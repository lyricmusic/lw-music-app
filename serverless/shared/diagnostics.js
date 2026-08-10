/* global console, module, process, require */

const { randomUUID } = require('node:crypto')

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/i
const SAFE_REQUEST_ID = /^[a-z0-9][a-z0-9-]{7,63}$/i
const generatedRequestIds = new WeakMap()

function getHeader(event, requestedName) {
  const normalizedName = requestedName.toLowerCase()
  return Object.entries(event?.headers ?? {}).find(
    ([name]) => name.toLowerCase() === normalizedName,
  )?.[1]
}

function safeIdentifier(value, fallback) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value)
    ? value
    : fallback
}

function getRequestId(event) {
  if (event && typeof event === 'object' && generatedRequestIds.has(event)) {
    return generatedRequestIds.get(event)
  }

  const clientRequestId = getHeader(event, 'x-request-id')?.trim()
  const platformRequestId = event?.requestContext?.requestId?.trim()
  const requestId = SAFE_REQUEST_ID.test(clientRequestId ?? '')
    ? clientRequestId
    : SAFE_REQUEST_ID.test(platformRequestId ?? '')
      ? platformRequestId
      : randomUUID()

  if (event && typeof event === 'object') {
    generatedRequestIds.set(event, requestId)
  }
  return requestId
}

function addDiagnosticHeaders(headers, requestId) {
  const exposedHeaders = new Set(
    String(headers?.['Access-Control-Expose-Headers'] ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  exposedHeaders.add('X-Request-ID')

  return {
    ...headers,
    'Access-Control-Expose-Headers': Array.from(exposedHeaders).join(', '),
    'X-Request-ID': requestId,
  }
}

function getSafeErrorDetails(error) {
  const errorName = safeIdentifier(error?.name, 'Error')
  const errorCode = safeIdentifier(error?.code, undefined)
  return { errorCode, errorName }
}

function createRequestDiagnostics({
  event,
  logger = console,
  now = Date.now,
  release = process.env.RELEASE,
  service,
}) {
  const requestId = getRequestId(event)
  const safeRelease = safeIdentifier(release, 'unversioned')
  const safeService = safeIdentifier(service, 'unknown-service')
  const startedAt = now()
  let completed = false

  const recordError = (error, { operation } = {}) => {
    const log = logger?.error ?? logger?.log
    log?.call(logger, {
      event: 'server_request_error',
      ...getSafeErrorDetails(error),
      operation: safeIdentifier(operation, 'unknown'),
      release: safeRelease,
      requestId,
      service: safeService,
    })
  }

  const complete = (response, { errorCode, operation, outcome } = {}) => {
    const statusCode = Number(response?.statusCode) || 500
    const finalizedResponse = {
      ...response,
      headers: addDiagnosticHeaders(response?.headers, requestId),
    }

    if (!completed) {
      completed = true
      const level =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
      const log = logger?.[level] ?? logger?.log
      log?.call(logger, {
        durationMs: Math.max(0, now() - startedAt),
        errorCode: safeIdentifier(errorCode, undefined),
        event: 'server_request',
        operation: safeIdentifier(operation, 'unknown'),
        outcome: safeIdentifier(
          outcome,
          statusCode < 400 ? 'success' : 'rejected',
        ),
        release: safeRelease,
        requestId,
        service: safeService,
        statusCode,
      })
    }

    return finalizedResponse
  }

  return { complete, recordError, requestId }
}

module.exports = {
  addDiagnosticHeaders,
  createRequestDiagnostics,
  getRequestId,
  getSafeErrorDetails,
}
