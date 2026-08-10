export {
  initializeErrorMonitoring,
  isErrorMonitoringInitialized,
  reportOperationalError,
  resolveErrorMonitoringConfig,
} from './errorMonitoring'
export type { ErrorCategory } from './errorMonitoring'
export { scrubErrorEvent } from './errorScrubbing'
export {
  getProductAnalyticsConsent,
  initializeProductAnalyticsFromConsent,
  isProductAnalyticsAvailable,
  setProductAnalyticsConsent,
  trackProductEvent,
} from './productAnalytics'
export type { ProductAnalyticsConsent } from './productAnalytics'
export { isProductEvent } from './productEvents'
export type { ProductEvent } from './productEvents'
