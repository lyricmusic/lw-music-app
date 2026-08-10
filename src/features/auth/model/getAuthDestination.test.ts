import { describe, expect, it } from 'vitest'

import { routes } from '@/shared/config/routes'

import { getAuthDestination } from './getAuthDestination'

describe('authentication return destination', () => {
  it('restores a room deep link with invite query and hash', () => {
    expect(
      getAuthDestination({
        from: {
          hash: '#player',
          pathname: '/rooms/room-42',
          search: '?invite=invite-123',
        },
      }),
    ).toBe('/rooms/room-42?invite=invite-123#player')
  })

  it('accepts location state left by an older open tab', () => {
    const legacyV6State = {
      from: {
        key: 'legacy-key',
        pathname: '/join/invite-123',
        search: '?source=old-tab',
        state: null,
      },
    }

    expect(getAuthDestination(legacyV6State)).toBe(
      '/join/invite-123?source=old-tab',
    )
  })

  it.each([
    undefined,
    null,
    {},
    { from: { pathname: 'https://example.com/phishing' } },
    { from: { pathname: '//example.com/phishing' } },
  ])('falls back to rooms for an unsafe or missing state', state => {
    expect(getAuthDestination(state)).toBe(routes.rooms)
  })
})
