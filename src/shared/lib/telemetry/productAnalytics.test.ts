import { describe, expect, it, vi } from 'vitest'

import { createProductAnalyticsController } from './productAnalytics'

const roomOpenedEvent = {
  name: 'room_opened',
  properties: { source: 'catalog', user_kind: 'registered' },
} as const

describe('product analytics controller', () => {
  it('never loads an adapter or sends in disabled mode', async () => {
    const loadAdapter = vi.fn()
    const controller = createProductAnalyticsController({
      enabled: false,
      loadAdapter,
      readConsent: () => 'granted',
      writeConsent: vi.fn(),
    })

    await expect(controller.track(roomOpenedEvent)).resolves.toBe(false)
    await expect(controller.applyConsent('granted')).resolves.toBe(false)
    expect(loadAdapter).not.toHaveBeenCalled()
  })

  it('does not load or send before explicit consent', async () => {
    const loadAdapter = vi.fn()
    const controller = createProductAnalyticsController({
      enabled: true,
      loadAdapter,
      readConsent: () => 'unknown',
      writeConsent: vi.fn(),
    })

    await expect(controller.track(roomOpenedEvent)).resolves.toBe(false)
    await expect(controller.applyConsent('denied')).resolves.toBe(false)
    expect(loadAdapter).not.toHaveBeenCalled()
  })

  it('sends only schema-valid events and deduplicates strict-mode effects', async () => {
    let consent: 'denied' | 'granted' | 'unknown' = 'unknown'
    const logEvent = vi.fn()
    const setAnalyticsCollectionEnabled = vi.fn()
    const setConsent = vi.fn()
    const controller = createProductAnalyticsController({
      enabled: true,
      loadAdapter: async () => ({
        analytics: {} as never,
        logEvent,
        setAnalyticsCollectionEnabled,
        setConsent,
      }),
      readConsent: () => consent,
      writeConsent: nextConsent => {
        consent = nextConsent
      },
    })

    await expect(controller.applyConsent('granted')).resolves.toBe(true)
    await expect(
      controller.track(roomOpenedEvent, 'navigation:key'),
    ).resolves.toBe(true)
    await expect(
      controller.track(roomOpenedEvent, 'navigation:key'),
    ).resolves.toBe(false)
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(setConsent).toHaveBeenCalledWith(
      expect.objectContaining({ analytics_storage: 'granted' }),
    )
    expect(setAnalyticsCollectionEnabled).toHaveBeenCalledWith({}, true)
  })
})
