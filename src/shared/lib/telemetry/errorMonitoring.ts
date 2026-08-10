import {
  getSafeErrorCode,
  getSafeErrorName,
  scrubErrorEvent,
} from './errorScrubbing'

export type ErrorCategory =
  | 'app_bootstrap'
  | 'app_check'
  | 'blocked_users_subscription'
  | 'guest_auth'
  | 'media_cleanup'
  | 'message_send'
  | 'messages_subscription'
  | 'profile_subscription'
  | 'react_recoverable'
  | 'react_render'
  | 'realtime_access'
  | 'room_membership'
  | 'room_metadata_subscription'
  | 'room_participants'
  | 'room_presence'
  | 'room_queue'
  | 'room_reactions'
  | 'room_restrictions'
  | 'rooms_catalog'
  | 'rooms_memberships'
  | 'rutube_player'
  | 'unexpected_client_error'

interface MonitoringEnvironment {
  appEnvironment?: string
  dsn?: string
  enabled?: string
  mode?: string
  release?: string
  test?: boolean
}

const CAPTURE_LIMIT = 30
const DEDUPLICATION_WINDOW_MS = 60_000
const capturedErrors = new Map<string, number>()
let captureCount = 0
let initialized = false
let initializationPromise: Promise<boolean> | null = null
let sentry: typeof import('./sentryAdapter') | null = null

export function resolveErrorMonitoringConfig({
  appEnvironment,
  dsn,
  enabled,
  mode,
  release,
  test,
}: MonitoringEnvironment) {
  const normalizedDsn = dsn?.trim() ?? ''
  const normalizedRelease = release?.trim() ?? ''
  const active =
    enabled === 'true' &&
    appEnvironment === 'production' &&
    mode === 'production' &&
    !test &&
    Boolean(normalizedDsn) &&
    Boolean(normalizedRelease)

  return {
    active,
    dsn: normalizedDsn,
    environment: appEnvironment === 'production' ? 'production' : 'development',
    release: normalizedRelease,
  }
}

function currentConfig() {
  return resolveErrorMonitoringConfig({
    appEnvironment: import.meta.env.VITE_APP_ENV,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: import.meta.env.VITE_ERROR_MONITORING_ENABLED,
    mode: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    test: Boolean(import.meta.env.VITEST),
  })
}

export async function initializeErrorMonitoring(
  environment?: MonitoringEnvironment,
) {
  if (initialized) return true

  const config = environment
    ? resolveErrorMonitoringConfig(environment)
    : currentConfig()
  if (!config.active) return false

  initializationPromise ??= import('./sentryAdapter')
    .then(sentryModule => {
      sentryModule.init({
        beforeSend: event => scrubErrorEvent(event),
        dsn: config.dsn,
        enabled: true,
        environment: config.environment,
        integrations: defaultIntegrations =>
          defaultIntegrations.filter(
            integration => integration.name !== 'Breadcrumbs',
          ),
        release: config.release,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      })
      sentry = sentryModule
      initialized = true
      return true
    })
    .catch(() => {
      initializationPromise = null
      return false
    })

  return initializationPromise
}

function isDuplicate(category: ErrorCategory, error: unknown) {
  const now = Date.now()
  const key = `${category}:${getSafeErrorName(error)}:${getSafeErrorCode(error) ?? 'none'}`
  const lastCapturedAt = capturedErrors.get(key)
  capturedErrors.set(key, now)
  if (capturedErrors.size > CAPTURE_LIMIT * 2) {
    for (const [storedKey, capturedAt] of capturedErrors) {
      if (now - capturedAt > DEDUPLICATION_WINDOW_MS)
        capturedErrors.delete(storedKey)
    }
  }
  return (
    lastCapturedAt !== undefined &&
    now - lastCapturedAt < DEDUPLICATION_WINDOW_MS
  )
}

export function reportOperationalError(
  category: ErrorCategory,
  error: unknown,
  options: { requestId?: string } = {},
) {
  const sentryClient = sentry
  if (
    !initialized ||
    !sentryClient ||
    captureCount >= CAPTURE_LIMIT ||
    isDuplicate(category, error)
  ) {
    return null
  }

  captureCount += 1
  return sentryClient.withScope(scope => {
    scope.setLevel('error')
    scope.setTag('error_category', category)
    scope.setTag('runtime', 'browser')
    const correlatedRequestId =
      options.requestId ??
      (error && typeof error === 'object' && 'requestId' in error
        ? String((error as { requestId?: unknown }).requestId ?? '')
        : '')
    if (/^[a-z0-9][a-z0-9-]{7,63}$/i.test(correlatedRequestId)) {
      scope.setTag('request_id', correlatedRequestId)
    }
    return sentryClient.captureException(
      error instanceof Error ? error : new Error('Non-error rejection'),
    )
  })
}

export function isErrorMonitoringInitialized() {
  return initialized
}

export function resetErrorMonitoringForTests() {
  initialized = false
  initializationPromise = null
  sentry = null
  captureCount = 0
  capturedErrors.clear()
}
