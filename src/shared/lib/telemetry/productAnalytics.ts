import type { Analytics, ConsentSettings } from 'firebase/analytics'

import type { ProductEvent } from './productEvents'
import { isProductEvent } from './productEvents'

export type ProductAnalyticsConsent = 'denied' | 'granted' | 'unknown'

interface AnalyticsAdapter {
  analytics: Analytics
  logEvent: (analytics: Analytics, name: string, properties: object) => void
  setAnalyticsCollectionEnabled: (
    analytics: Analytics,
    enabled: boolean,
  ) => void
  setConsent: (settings: ConsentSettings) => void
}

interface AnalyticsControllerOptions {
  enabled: boolean
  loadAdapter: () => Promise<AnalyticsAdapter | null>
  readConsent: () => ProductAnalyticsConsent
  writeConsent: (consent: Exclude<ProductAnalyticsConsent, 'unknown'>) => void
}

const CONSENT_STORAGE_KEY = 'syncly:product-analytics-consent:v1'
const deniedConsent: ConsentSettings = {
  ad_personalization: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  analytics_storage: 'denied',
}

export function createProductAnalyticsController({
  enabled,
  loadAdapter,
  readConsent,
  writeConsent,
}: AnalyticsControllerOptions) {
  let adapterPromise: Promise<AnalyticsAdapter | null> | null = null
  const trackedKeys = new Set<string>()

  const getAdapter = () => {
    if (!enabled) return Promise.resolve(null)
    adapterPromise ??= loadAdapter().catch(() => null)
    return adapterPromise
  }

  const applyConsent = async (
    consent: Exclude<ProductAnalyticsConsent, 'unknown'>,
  ) => {
    writeConsent(consent)
    if (consent === 'denied' && !adapterPromise) return false

    const adapter = await getAdapter()
    if (!adapter) return false
    adapter.setConsent(
      consent === 'granted'
        ? { ...deniedConsent, analytics_storage: 'granted' }
        : deniedConsent,
    )
    adapter.setAnalyticsCollectionEnabled(
      adapter.analytics,
      consent === 'granted',
    )
    return true
  }

  const track = async (event: ProductEvent, dedupeKey?: string) => {
    if (!enabled || readConsent() !== 'granted' || !isProductEvent(event)) {
      return false
    }
    if (dedupeKey && trackedKeys.has(dedupeKey)) return false
    if (dedupeKey) trackedKeys.add(dedupeKey)

    const adapter = await getAdapter()
    if (!adapter || readConsent() !== 'granted') return false
    adapter.logEvent(adapter.analytics, event.name, event.properties)
    return true
  }

  return { applyConsent, track }
}

function readStoredConsent(): ProductAnalyticsConsent {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : 'unknown'
  } catch {
    return 'unknown'
  }
}

let volatileConsent: ProductAnalyticsConsent = 'unknown'
function readConsent() {
  const stored = readStoredConsent()
  return stored === 'unknown' ? volatileConsent : stored
}

function writeConsent(consent: Exclude<ProductAnalyticsConsent, 'unknown'>) {
  volatileConsent = consent
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent)
  } catch {
    // The explicit choice remains valid for this tab if storage is unavailable.
  }
}

const enabled =
  import.meta.env.VITE_PRODUCT_ANALYTICS_ENABLED === 'true' &&
  import.meta.env.VITE_PRODUCT_ANALYTICS_PRIVACY_CONFIRMED === 'true' &&
  Boolean(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim()) &&
  import.meta.env.MODE !== 'test' &&
  !import.meta.env.VITEST

async function loadFirebaseAnalytics(): Promise<AnalyticsAdapter | null> {
  const [{ firebaseApp }, analyticsModule] = await Promise.all([
    import('@/shared/api/firebase/firebase'),
    import('firebase/analytics'),
  ])
  if (!(await analyticsModule.isSupported())) return null

  const analytics = analyticsModule.initializeAnalytics(firebaseApp, {
    config: {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      cookie_expires: 2_592_000,
      cookie_update: false,
      page_location: 'not_collected',
      page_title: 'Syncly',
      send_page_view: false,
    },
  })
  analyticsModule.setDefaultEventParameters({
    page_location: 'not_collected',
    page_path: 'not_collected',
    page_referrer: 'not_collected',
    page_title: 'Syncly',
  })

  return {
    analytics,
    logEvent: analyticsModule.logEvent,
    setAnalyticsCollectionEnabled:
      analyticsModule.setAnalyticsCollectionEnabled,
    setConsent: analyticsModule.setConsent,
  }
}

const controller = createProductAnalyticsController({
  enabled,
  loadAdapter: loadFirebaseAnalytics,
  readConsent,
  writeConsent,
})

export function getProductAnalyticsConsent() {
  return enabled ? readConsent() : 'denied'
}

export function isProductAnalyticsAvailable() {
  return enabled
}

export async function setProductAnalyticsConsent(
  consent: Exclude<ProductAnalyticsConsent, 'unknown'>,
) {
  return controller.applyConsent(consent)
}

export function trackProductEvent(event: ProductEvent, dedupeKey?: string) {
  void controller.track(event, dedupeKey)
}

export function initializeProductAnalyticsFromConsent() {
  return readConsent() === 'granted'
    ? controller.applyConsent('granted')
    : Promise.resolve(false)
}
