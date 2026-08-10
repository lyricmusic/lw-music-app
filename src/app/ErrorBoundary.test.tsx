import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { reportOperationalError } = vi.hoisted(() => ({
  reportOperationalError: vi.fn(),
}))
vi.mock('@/shared/lib/telemetry', () => ({ reportOperationalError }))

import { AppErrorBoundary } from './ErrorBoundary'

describe('AppErrorBoundary', () => {
  it('reports render errors and renders the privacy-safe fallback', () => {
    const boundary = new AppErrorBoundary({ children: 'application' })
    boundary.componentDidCatch(new Error('private room name'))
    boundary.state = AppErrorBoundary.getDerivedStateFromError()

    const markup = renderToStaticMarkup(boundary.render())
    expect(reportOperationalError).toHaveBeenCalledWith(
      'react_render',
      expect.any(Error),
    )
    expect(markup).toContain('Syncly не смог продолжить работу')
    expect(markup).not.toContain('private room name')
  })
})
