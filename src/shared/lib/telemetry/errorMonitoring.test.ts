import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sentryInit } = vi.hoisted(() => ({ sentryInit: vi.fn() }))
vi.mock('@sentry/react', () => ({ init: sentryInit }))

import {
  initializeErrorMonitoring,
  resetErrorMonitoringForTests,
  resolveErrorMonitoringConfig,
} from './errorMonitoring'

describe('error monitoring initialization gates', () => {
  const productionConfig = {
    appEnvironment: 'production',
    dsn: 'https://public@example.ingest.sentry.io/1',
    enabled: 'true',
    mode: 'production',
    release: 'syncly@abc123',
  }

  beforeEach(() => {
    sentryInit.mockReset()
    resetErrorMonitoringForTests()
  })

  it('enables only a complete production configuration', async () => {
    expect(resolveErrorMonitoringConfig(productionConfig).active).toBe(true)
    await expect(initializeErrorMonitoring(productionConfig)).resolves.toBe(
      true,
    )
    expect(sentryInit).toHaveBeenCalledOnce()
    expect(sentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: productionConfig.dsn,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      }),
    )
  })

  it('stays disabled in tests, development and without provider settings', async () => {
    expect(
      resolveErrorMonitoringConfig({ ...productionConfig, test: true }).active,
    ).toBe(false)
    expect(
      resolveErrorMonitoringConfig({
        ...productionConfig,
        appEnvironment: 'development',
        mode: 'development',
      }).active,
    ).toBe(false)
    expect(
      resolveErrorMonitoringConfig({ ...productionConfig, dsn: '' }).active,
    ).toBe(false)
    await expect(
      initializeErrorMonitoring({ ...productionConfig, test: true }),
    ).resolves.toBe(false)
    expect(sentryInit).not.toHaveBeenCalled()
  })
})
