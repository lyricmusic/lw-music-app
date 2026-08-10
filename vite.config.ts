import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const monitoringEnabled =
    mode === 'production' &&
    environment.VITE_APP_ENV === 'production' &&
    environment.VITE_ERROR_MONITORING_ENABLED === 'true'
  const release = environment.VITE_RELEASE?.trim()
  const sentryAuthToken = environment.SENTRY_AUTH_TOKEN?.trim()
  const sentryOrganization = environment.SENTRY_ORG?.trim()
  const sentryProject = environment.SENTRY_PROJECT?.trim()

  if (
    monitoringEnabled &&
    (!release || !sentryAuthToken || !sentryOrganization || !sentryProject)
  ) {
    throw new Error(
      'Production error monitoring requires VITE_RELEASE, SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT so source maps cannot be published accidentally.',
    )
  }

  return {
    build: {
      sourcemap: monitoringEnabled ? 'hidden' : false,
    },
    define: {
      // Чтобы избежать ошибки в браузере global is undefined
      global: {},
    },
    plugins: [
      react(),
      ...(monitoringEnabled
        ? [
            sentryVitePlugin({
              authToken: sentryAuthToken,
              org: sentryOrganization,
              project: sentryProject,
              release: { name: release },
              sourcemaps: {
                assets: './dist/**',
                filesToDeleteAfterUpload: './dist/**/*.map',
              },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': '/src',
        '@assets': '/assets',
      },
    },
  }
})
