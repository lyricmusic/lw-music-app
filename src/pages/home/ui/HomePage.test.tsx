import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/entities/session', () => ({
  useSession: () => ({ loading: false, profile: null, user: null }),
}))
vi.mock('@/shared/lib/telemetry', () => ({ trackProductEvent: vi.fn() }))

import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('explains the product and exposes the public conversion paths', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(markup).toContain('Смотрите клипы вместе')
    expect(markup).toContain('Создайте комнату')
    expect(markup).toContain('Вход по приглашению')
    expect(markup).toContain('href="/sign-up"')
    expect(markup).toContain('href="/sign-in"')
    expect(markup).toContain('href="#how-it-works"')
  })
})
