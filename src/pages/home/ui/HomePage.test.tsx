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
    expect(markup).toContain(
      '\u0412\u043c\u0435\u0441\u0442\u0435 \u043c\u0443\u0437\u044b\u043a\u0430 \u0437\u0432\u0443\u0447\u0438\u0442 \u044f\u0440\u0447\u0435.',
    )
    expect(markup).toContain(
      '\u0421\u043c\u0435\u043d\u0430 \u043a\u043b\u0438\u043f\u0430 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u0434\u043b\u044f \u0432\u0441\u0435\u0439 \u043a\u043e\u043c\u043d\u0430\u0442\u044b',
    )
    expect(markup).not.toContain(
      '\u041f\u0430\u0443\u0437\u0430, \u043f\u0435\u0440\u0435\u043c\u043e\u0442\u043a\u0430',
    )
    expect(markup).toContain(
      '\u0432\u044b\u0440\u0430\u0437\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u0438\u0435 \u0432 \u043a\u043e\u043c\u043d\u0430\u0442\u0435',
    )
  })
})
