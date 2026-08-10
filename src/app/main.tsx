import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import {
  initializeErrorMonitoring,
  reportOperationalError,
} from '@/shared/lib/telemetry'

import { AppErrorBoundary, AppErrorFallback } from './ErrorBoundary'

import './styles/index.css'

const rootElement: HTMLElement = document.getElementById('root')!
initializeErrorMonitoring()

const root = ReactDOM.createRoot(rootElement, {
  // componentDidCatch reports through the scrubbed boundary. Defining this
  // hook prevents React from printing the raw caught error to the console.
  onCaughtError: () => undefined,
  onRecoverableError: error => {
    reportOperationalError('react_recoverable', error)
  },
  onUncaughtError: error => {
    reportOperationalError('unexpected_client_error', error)
  },
})

void import('./App')
  .then(({ App }) => {
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    )
  })
  .catch(error => {
    reportOperationalError('app_bootstrap', error)
    root.render(<AppErrorFallback />)
  })
