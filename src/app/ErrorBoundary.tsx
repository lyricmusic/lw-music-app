import { Component, type ReactNode } from 'react'

import { reportOperationalError } from '@/shared/lib/telemetry'
import { Button } from '@mui/material'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    reportOperationalError('react_render', error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return <AppErrorFallback />
  }
}

export function AppErrorFallback() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#12071F] px-4 py-8 text-[#F8F3FF] sm:px-6">
      <section
        aria-labelledby="app-error-title"
        className="w-full max-w-xl rounded-[20px] border border-[#5D3A82] bg-[#24143D] p-6 text-center shadow-2xl sm:p-10"
        role="alert"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3B2158] text-2xl"
        >
          ⚠
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl" id="app-error-title">
          Syncly не смог продолжить работу
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#CDBCE2] sm:text-base">
          Обновите страницу. Если соединение нестабильно, проверьте интернет и
          повторите попытку чуть позже.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => window.location.reload()} variant="contained">
            Обновить страницу
          </Button>
          <Button component="a" href="/" variant="outlined">
            На главную
          </Button>
        </div>
      </section>
    </main>
  )
}
