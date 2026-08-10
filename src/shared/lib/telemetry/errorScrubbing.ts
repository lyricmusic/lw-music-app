const SAFE_TAG_NAMES = new Set(['error_category', 'request_id', 'runtime'])

const SAFE_TAG_VALUE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i
const REQUEST_ID = /^[a-z0-9][a-z0-9-]{7,63}$/i

type TelemetryRecord = Record<string, unknown>

function asRecord(value: unknown): TelemetryRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as TelemetryRecord)
    : null
}

function sanitizeFrameFilename(value: unknown) {
  if (typeof value !== 'string') return undefined

  try {
    const parsed = new URL(value, 'https://syncly.invalid')
    return parsed.pathname.startsWith('/') ? parsed.pathname : undefined
  } catch {
    return value.startsWith('/') && !value.includes('?') && !value.includes('#')
      ? value
      : undefined
  }
}

function sanitizeStacktrace(value: unknown) {
  const stacktrace = asRecord(value)
  if (!stacktrace || !Array.isArray(stacktrace.frames)) return undefined

  const frames = stacktrace.frames.flatMap(frameValue => {
    const frame = asRecord(frameValue)
    if (!frame) return []

    const filename = sanitizeFrameFilename(frame.filename)
    return [
      {
        colno: typeof frame.colno === 'number' ? frame.colno : undefined,
        filename,
        function:
          typeof frame.function === 'string' &&
          !frame.function.includes('@') &&
          frame.function.length <= 160
            ? frame.function
            : undefined,
        in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
        lineno: typeof frame.lineno === 'number' ? frame.lineno : undefined,
        module:
          typeof frame.module === 'string' && frame.module.length <= 160
            ? frame.module
            : undefined,
      },
    ]
  })

  return frames.length > 0 ? { frames } : undefined
}

function sanitizeException(value: unknown) {
  const exception = asRecord(value)
  if (!exception || !Array.isArray(exception.values)) return undefined

  const values = exception.values.flatMap(exceptionValue => {
    const item = asRecord(exceptionValue)
    if (!item) return []

    return [
      {
        mechanism: asRecord(item.mechanism)
          ? {
              handled:
                typeof asRecord(item.mechanism)?.handled === 'boolean'
                  ? asRecord(item.mechanism)?.handled
                  : undefined,
              type:
                typeof asRecord(item.mechanism)?.type === 'string'
                  ? 'generic'
                  : undefined,
            }
          : undefined,
        stacktrace: sanitizeStacktrace(item.stacktrace),
        type:
          typeof item.type === 'string' &&
          /^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(item.type)
            ? item.type
            : 'Error',
        value: 'Sensitive error details removed by Syncly.',
      },
    ]
  })

  return values.length > 0 ? { values } : undefined
}

function sanitizeTags(value: unknown) {
  const tags = asRecord(value)
  if (!tags) return undefined

  const safeTags = Object.fromEntries(
    Object.entries(tags).flatMap(([name, tagValue]) => {
      if (!SAFE_TAG_NAMES.has(name) || typeof tagValue !== 'string') return []
      if (!SAFE_TAG_VALUE.test(tagValue)) return []
      if (name === 'request_id' && !REQUEST_ID.test(tagValue)) return []
      return [[name, tagValue]]
    }),
  )
  return Object.keys(safeTags).length > 0 ? safeTags : undefined
}

/**
 * Reduces an SDK event to a strict allowlist. Raw error messages, URLs,
 * breadcrumbs, request data, user data and arbitrary context never leave the
 * browser even if a caller accidentally captures a rich Firebase error.
 */
export function scrubErrorEvent<T>(event: T): T {
  const telemetryEvent = event as unknown as TelemetryRecord
  const scrubbed: TelemetryRecord = {
    environment:
      typeof telemetryEvent.environment === 'string'
        ? telemetryEvent.environment
        : undefined,
    event_id:
      typeof telemetryEvent.event_id === 'string'
        ? telemetryEvent.event_id
        : undefined,
    exception: sanitizeException(telemetryEvent.exception),
    level:
      typeof telemetryEvent.level === 'string' ? telemetryEvent.level : 'error',
    message: telemetryEvent.exception
      ? undefined
      : 'Sensitive error details removed by Syncly.',
    platform:
      typeof telemetryEvent.platform === 'string'
        ? telemetryEvent.platform
        : 'javascript',
    release:
      typeof telemetryEvent.release === 'string'
        ? telemetryEvent.release
        : undefined,
    tags: sanitizeTags(telemetryEvent.tags),
    timestamp:
      typeof telemetryEvent.timestamp === 'number'
        ? telemetryEvent.timestamp
        : undefined,
  }

  return scrubbed as unknown as T
}

export function getSafeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && /^[a-z0-9][a-z0-9/_-]{0,63}$/i.test(code)
    ? code.toLowerCase()
    : null
}

export function getSafeErrorName(error: unknown) {
  return error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(error.name)
    ? error.name
    : 'Error'
}
